<?php
/**
 * NDVI Cron: Fetch Sentinel-2 NDVI for all fields with polygons.
 * Uses Copernicus Data Space Ecosystem (CDSE) Statistical API.
 *
 * Schedule: Every 6 hours via cPanel cron
 * Command: php /home/valleyc/public_html/gdd-api/cron/fetch_ndvi.php
 *
 * For each field with a polygon:
 * 1. Get OAuth token from CDSE
 * 2. Query Sentinel Hub Statistical API for NDVI stats
 * 3. Compute Kc = 1.25 * NDVI + 0.20
 * 4. Upsert into ndvi_readings table
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';

// Check CDSE credentials
if (!defined('CDSE_CLIENT_ID') || !CDSE_CLIENT_ID) {
    echo "ERROR: CDSE_CLIENT_ID not configured\n";
    exit(1);
}

$db = getDB();
echo "NDVI Cron started: " . date('Y-m-d H:i:s') . "\n";

// ── Step 1: Get OAuth access token ──
function get_cdse_token(): ?string {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => CDSE_TOKEN_URL,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'grant_type' => 'client_credentials',
            'client_id' => CDSE_CLIENT_ID,
            'client_secret' => CDSE_CLIENT_SECRET,
        ]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_TIMEOUT => 30,
    ]);

    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status !== 200 || !$body) {
        echo "  Token error (HTTP $status): $body\n";
        return null;
    }

    $data = json_decode($body, true);
    return $data['access_token'] ?? null;
}

// ── Step 2: Query Statistical API for a field polygon ──
// Sentinel-2 evalscript (10m, B04/B08/SCL)
function get_s2_evalscript(): string {
    return <<<'SCRIPT'
//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B04", "B08", "SCL"],
      units: "DN"
    }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "cloud", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ],
    mosaicking: "SIMPLE"
  };
}

function evaluatePixel(sample) {
  let scl = sample.SCL;
  // Actual cloud pixels: 8=cloud med, 9=cloud high, 10=cirrus
  let isCloud = (scl === 8 || scl === 9 || scl === 10) ? 1 : 0;

  // Mask bad pixels for NDVI using NaN (dataMask stays 1 so cloud band is always counted)
  // SCL: 0=no data, 1=saturated, 3=cloud shadow, 8=cloud med, 9=cloud high, 10=cirrus, 11=snow
  if (scl === 0 || scl === 1 || scl === 3 || scl === 8 || scl === 9 || scl === 10 || scl === 11) {
    return { ndvi: [NaN], cloud: [isCloud], dataMask: [1] };
  }
  let nir = sample.B08;
  let red = sample.B04;
  if (nir + red === 0) {
    return { ndvi: [NaN], cloud: [0], dataMask: [1] };
  }
  let ndvi = (nir - red) / (nir + red);
  return { ndvi: [ndvi], cloud: [isCloud], dataMask: [1] };
}
SCRIPT;
}

function fetch_ndvi_stats(string $token, array $polygon, string $fromDate, string $toDate): ?array {
    $evalscript = get_s2_evalscript();
    // Resolution in degrees (~10m at latitude -34°)
    // 10m / 110540m per degree ≈ 0.0001° for latitude
    // 10m / 90890m per degree ≈ 0.00011° for longitude
    $resX = 0.00011;
    $resY = 0.0001;

    $payload = [
        'input' => [
            'bounds' => [
                'geometry' => $polygon,
            ],
            'data' => [[
                'type' => 'sentinel-2-l2a',
                'dataFilter' => [
                    'timeRange' => [
                        'from' => $fromDate . 'T00:00:00Z',
                        'to' => $toDate . 'T23:59:59Z',
                    ],
                    'maxCloudCoverage' => 50,
                    'mosaickingOrder' => 'leastCC',
                ],
            ]],
        ],
        'aggregation' => [
            'timeRange' => [
                'from' => $fromDate . 'T00:00:00Z',
                'to' => $toDate . 'T23:59:59Z',
            ],
            'aggregationInterval' => ['of' => 'P1D'],
            'evalscript' => $evalscript,
            'resx' => $resX,
            'resy' => $resY,
        ],
    ];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => SENTINEL_HUB_STATS_URL,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $token,
            'Accept: application/json',
        ],
        CURLOPT_TIMEOUT => 60,
    ]);

    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status !== 200 || !$body) {
        echo "  Stats API error (HTTP $status): " . substr($body ?: '', 0, 300) . "\n";
        return null;
    }

    return json_decode($body, true);
}

// ── Helper: Process a single NDVI stats entry and upsert ──
function process_ndvi_entry(array $entry, int $fieldId, string $sowingDate, PDO $db, string $source): ?string {
    $interval = $entry['interval'] ?? null;
    $outputs = $entry['outputs'] ?? null;
    if (!$interval || !$outputs) return null;

    $date = substr($interval['from'] ?? '', 0, 10);
    if (!$date || $date < $sowingDate) return null;

    $ndviStats = $outputs['ndvi']['bands']['B0']['stats'] ?? null;
    if (!$ndviStats) return null;

    $sampleCount = $ndviStats['sampleCount'] ?? 0;
    $noDataCount = $ndviStats['noDataCount'] ?? 0;
    if ($sampleCount <= 0) return null;

    $ndviMean = (float) ($ndviStats['mean'] ?? 0);

    // Cloud % from dedicated cloud band (only SCL 8/9/10 = actual clouds)
    $cloudStats = $outputs['cloud']['bands']['B0']['stats'] ?? null;
    $cloudPct = $cloudStats ? round(((float) ($cloudStats['mean'] ?? 0)) * 100, 2) : null;

    // Skip scenes where >50% of pixels are masked (clouds + shadows + no-data)
    $maskedPct = ($sampleCount + $noDataCount) > 0
        ? ($noDataCount / ($sampleCount + $noDataCount)) * 100
        : 0;
    if ($maskedPct > 50) return null;

    // Clamp NDVI to valid range
    $ndviMean = max(-1, min(1, $ndviMean));

    // Store Kc as NULL — computed on frontend using crop-specific formula
    $kc = null;

    // Upsert (scene_id stores the satellite source)
    $upsertStmt = $db->prepare("
        INSERT INTO ndvi_readings (field_id, date, ndvi_mean, kc, cloud_pct, scene_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE ndvi_mean = VALUES(ndvi_mean), kc = VALUES(kc), cloud_pct = VALUES(cloud_pct), scene_id = VALUES(scene_id)
    ");
    $upsertStmt->execute([$fieldId, $date, $ndviMean, $kc, $cloudPct, $source]);
    return $date;
}

// ── Main logic ──

// Get all fields with polygons
$stmt = $db->query("
    SELECT f.id, f.polygon, f.sowing_date
    FROM fields f
    WHERE f.polygon IS NOT NULL
");
$fields = $stmt->fetchAll();

if (empty($fields)) {
    echo "No fields with polygons found.\n";
    exit(0);
}

echo "Found " . count($fields) . " fields with polygons.\n";

// Get token
$token = get_cdse_token();
if (!$token) {
    echo "Failed to get CDSE access token.\n";
    exit(1);
}
echo "Got CDSE access token.\n";

$totalInserted = 0;
$requestCount = 0;

foreach ($fields as $field) {
    $fieldId = (int) $field['id'];
    $polygon = json_decode($field['polygon'], true);
    $sowingDate = $field['sowing_date'];

    if (!$polygon || !isset($polygon['coordinates'])) {
        echo "  Field $fieldId: invalid polygon, skipping.\n";
        continue;
    }

    // Refresh token every 8 fields to avoid expiry
    if (++$requestCount % 8 === 0) {
        echo "  Refreshing CDSE token...\n";
        $token = get_cdse_token();
        if (!$token) {
            echo "  Token refresh failed, stopping.\n";
            break;
        }
    }

    echo "  Field $fieldId: fetching NDVI since $sowingDate...\n";

    // Query from sowing date (or last reading) to today
    $lastStmt = $db->prepare("SELECT MAX(date) as last_date FROM ndvi_readings WHERE field_id = ?");
    $lastStmt->execute([$fieldId]);
    $lastRow = $lastStmt->fetch();
    $fromDate = ($lastRow && $lastRow['last_date']) ? $lastRow['last_date'] : $sowingDate;

    $toDate = date('Y-m-d');

    // Skip if already up to date
    if ($fromDate >= $toDate) {
        echo "    Already up to date.\n";
        continue;
    }

    // ── Fetch Sentinel-2 in chunks (max 30 days per request) ──
    $maxDays = 30;
    $currentFrom = $fromDate;
    $inserted = 0;

    while ($currentFrom < $toDate) {
        $currentTo = date('Y-m-d', min(strtotime("$currentFrom +{$maxDays} days"), strtotime($toDate)));

        $stats = fetch_ndvi_stats($token, $polygon, $currentFrom, $currentTo);
        if ($stats && isset($stats['data'])) {
            foreach ($stats['data'] as $entry) {
                $result = process_ndvi_entry($entry, $fieldId, $sowingDate, $db, 'sentinel-2');
                if ($result) $inserted++;
            }
        }

        $currentFrom = $currentTo;
        if ($currentFrom < $toDate) usleep(1000000); // 1s between chunks
    }

    echo "    Sentinel-2: $inserted readings.\n";
    $totalInserted += $inserted;

    // Rate limit: 2s between fields
    usleep(2000000);
}

echo "Done. Total NDVI readings processed: $totalInserted\n";
