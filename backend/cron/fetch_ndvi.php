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
function fetch_ndvi_stats(string $token, array $polygon, string $fromDate, string $toDate): ?array {
    $evalscript = <<<'SCRIPT'
//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B04", "B08", "SCL"],
      units: "DN"
    }],
    output: [{
      id: "ndvi",
      bands: 1,
      sampleType: "FLOAT32"
    }],
    mosaicking: "ORBIT"
  };
}

function evaluatePixel(samples) {
  // Cloud mask using SCL band
  // SCL 3=cloud shadow, 8=cloud medium, 9=cloud high, 10=cirrus
  let dominated = false;
  let validNdvi = NaN;

  for (let i = 0; i < samples.length; i++) {
    let scl = samples[i].SCL;
    if (scl === 3 || scl === 8 || scl === 9 || scl === 10) continue;
    let nir = samples[i].B08;
    let red = samples[i].B04;
    if (nir + red === 0) continue;
    validNdvi = (nir - red) / (nir + red);
    dominated = true;
    break;
  }

  return { ndvi: [dominated ? validNdvi : NaN] };
}
SCRIPT;

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
            'resx' => 10,
            'resy' => 10,
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

foreach ($fields as $field) {
    $fieldId = (int) $field['id'];
    $polygon = json_decode($field['polygon'], true);
    $sowingDate = $field['sowing_date'];

    if (!$polygon || !isset($polygon['coordinates'])) {
        echo "  Field $fieldId: invalid polygon, skipping.\n";
        continue;
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

    $stats = fetch_ndvi_stats($token, $polygon, $fromDate, $toDate);
    if (!$stats || !isset($stats['data'])) {
        echo "    No data returned.\n";
        continue;
    }

    $inserted = 0;
    foreach ($stats['data'] as $entry) {
        $interval = $entry['interval'] ?? null;
        $outputs = $entry['outputs'] ?? null;
        if (!$interval || !$outputs) continue;

        $date = substr($interval['from'] ?? '', 0, 10);
        if (!$date || $date < $sowingDate) continue;

        $ndviStats = $outputs['ndvi']['bands']['B0']['stats'] ?? null;
        if (!$ndviStats) continue;

        $sampleCount = $ndviStats['sampleCount'] ?? 0;
        $noDataCount = $ndviStats['noDataCount'] ?? 0;
        if ($sampleCount <= 0) continue;

        $ndviMean = (float) ($ndviStats['mean'] ?? 0);
        $cloudPct = $sampleCount > 0
            ? round(($noDataCount / ($sampleCount + $noDataCount)) * 100, 2)
            : null;

        // Skip very cloudy scenes (>50% no-data)
        if ($cloudPct !== null && $cloudPct > 50) continue;

        // Clamp NDVI to valid range
        $ndviMean = max(-1, min(1, $ndviMean));

        // Kc = 1.25 * NDVI + 0.20 (Glenn et al.)
        $kc = round(1.25 * $ndviMean + 0.20, 4);
        $kc = max(0, min(1.4, $kc)); // Clamp Kc

        // Upsert
        $upsertStmt = $db->prepare("
            INSERT INTO ndvi_readings (field_id, date, ndvi_mean, kc, cloud_pct)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE ndvi_mean = VALUES(ndvi_mean), kc = VALUES(kc), cloud_pct = VALUES(cloud_pct)
        ");
        $upsertStmt->execute([$fieldId, $date, $ndviMean, $kc, $cloudPct]);
        $inserted++;
    }

    echo "    Inserted/updated $inserted NDVI readings.\n";
    $totalInserted += $inserted;

    // Rate limit
    usleep(500000); // 0.5s between fields
}

echo "Done. Total NDVI readings processed: $totalInserted\n";
