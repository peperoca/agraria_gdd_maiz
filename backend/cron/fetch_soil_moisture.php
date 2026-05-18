<?php
/**
 * Soil Moisture Cron: Fetch Sentinel-1 SAR backscatter for all fields with polygons.
 * Uses Copernicus Data Space Ecosystem (CDSE) Statistical API.
 *
 * Model: Change Detection relative soil moisture
 *   SM_relative = (VV_current - VV_dry) / (VV_wet - VV_dry) * 100
 *   VV is vegetation-corrected using NDVI: VV_soil = VV_raw - A * NDVI
 *
 * Schedule: Every 12 hours via cPanel cron
 * Command: php /home/valleyc/public_html/gdd-api/cron/fetch_soil_moisture.php
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';

if (!defined('CDSE_CLIENT_ID') || !CDSE_CLIENT_ID) {
    echo "ERROR: CDSE_CLIENT_ID not configured\n";
    exit(1);
}

// Vegetation attenuation factor (dB). Empirical range 3-5 dB for C-band agriculture.
define('VEG_ATTENUATION_A', 4.0);

// Minimum VV spread (dB) and observation count before computing SM%
define('MIN_VV_SPREAD_DB', 1.0);
define('MIN_OBSERVATIONS', 3);

$db = getDB();
echo "Soil Moisture Cron started: " . date('Y-m-d H:i:s') . "\n";

// ── Step 1: Get OAuth access token ──
function get_cdse_token_sm(): ?string {
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

// ── Step 2: Query Statistical API for Sentinel-1 SAR ──
function fetch_s1_stats(string $token, array $polygon, string $fromDate, string $toDate): ?array {
    $evalscript = <<<'SCRIPT'
//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["VV", "VH"],
      units: "LINEAR_POWER"
    }],
    output: [
      { id: "vv", bands: 1, sampleType: "FLOAT32" },
      { id: "vh", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ],
    mosaicking: "ORBIT"
  };
}

function evaluatePixel(samples) {
  for (let i = 0; i < samples.length; i++) {
    let vv = samples[i].VV;
    let vh = samples[i].VH;
    if (vv > 0 && vh > 0) {
      return {
        vv: [vv],
        vh: [vh],
        dataMask: [1]
      };
    }
  }
  return { vv: [0], vh: [0], dataMask: [0] };
}
SCRIPT;

    $payload = [
        'input' => [
            'bounds' => [
                'geometry' => $polygon,
            ],
            'data' => [[
                'type' => 'S1GRD',
                'dataFilter' => [
                    'timeRange' => [
                        'from' => $fromDate . 'T00:00:00Z',
                        'to' => $toDate . 'T23:59:59Z',
                    ],
                    'acquisitionMode' => 'IW',
                    'polarization' => 'DV',
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
            'resx' => 20,
            'resy' => 20,
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
        echo "  S1 Stats API error (HTTP $status): " . substr($body ?: '', 0, 300) . "\n";
        return null;
    }

    return json_decode($body, true);
}

// ── Step 3: Look up most recent NDVI for vegetation correction ──
function get_nearest_ndvi(PDO $db, int $fieldId, string $date): ?float {
    $stmt = $db->prepare("
        SELECT ndvi_mean FROM ndvi_readings
        WHERE field_id = ? AND date <= ?
        ORDER BY date DESC LIMIT 1
    ");
    $stmt->execute([$fieldId, $date]);
    $row = $stmt->fetch();
    return $row ? (float) $row['ndvi_mean'] : null;
}

// ── Step 4: Get historical VV range for a field ──
function get_vv_range(PDO $db, int $fieldId): array {
    $stmt = $db->prepare("
        SELECT MIN(vv_db) as vv_min, MAX(vv_db) as vv_max, COUNT(*) as cnt
        FROM soil_moisture_readings
        WHERE field_id = ? AND vv_db IS NOT NULL
    ");
    $stmt->execute([$fieldId]);
    $row = $stmt->fetch();
    return [
        'min' => $row['vv_min'] !== null ? (float) $row['vv_min'] : null,
        'max' => $row['vv_max'] !== null ? (float) $row['vv_max'] : null,
        'count' => (int) $row['cnt'],
    ];
}

// ── Main logic ──

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

$token = get_cdse_token_sm();
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

    // Query from last reading (or sowing date) to today
    $lastStmt = $db->prepare("SELECT MAX(date) as last_date FROM soil_moisture_readings WHERE field_id = ?");
    $lastStmt->execute([$fieldId]);
    $lastRow = $lastStmt->fetch();
    $fromDate = ($lastRow && $lastRow['last_date']) ? $lastRow['last_date'] : $sowingDate;
    $toDate = date('Y-m-d');

    if ($fromDate >= $toDate) {
        echo "  Field $fieldId: already up to date.\n";
        continue;
    }

    echo "  Field $fieldId: fetching S1 SAR from $fromDate to $toDate...\n";

    $stats = fetch_s1_stats($token, $polygon, $fromDate, $toDate);
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

        // Extract mean VV and VH (linear power)
        $vvStats = $outputs['vv']['bands']['B0']['stats'] ?? null;
        $vhStats = $outputs['vh']['bands']['B0']['stats'] ?? null;
        if (!$vvStats) continue;

        $sampleCount = $vvStats['sampleCount'] ?? 0;
        if ($sampleCount <= 0) continue;

        $vvLinear = (float) ($vvStats['mean'] ?? 0);
        $vhLinear = (float) (($vhStats['mean'] ?? 0));

        // Skip invalid values
        if ($vvLinear <= 0) continue;

        // Convert linear power to dB
        $vvRawDb = round(10 * log10($vvLinear), 3);
        $vhDb = $vhLinear > 0 ? round(10 * log10($vhLinear), 3) : null;

        // Vegetation correction using NDVI
        $ndviUsed = get_nearest_ndvi($db, $fieldId, $date);
        if ($ndviUsed !== null && $ndviUsed > 0) {
            $vvDb = round($vvRawDb - VEG_ATTENUATION_A * $ndviUsed, 3);
        } else {
            $vvDb = $vvRawDb;
            $ndviUsed = $ndviUsed ?? null;
        }

        // Get current historical range (before this new reading)
        $range = get_vv_range($db, $fieldId);

        // Compute new min/max including this reading
        $vvDry = ($range['min'] !== null) ? min($range['min'], $vvDb) : $vvDb;
        $vvWet = ($range['max'] !== null) ? max($range['max'], $vvDb) : $vvDb;
        $totalCount = $range['count'] + 1;

        // Compute SM% only if enough spread and observations
        $smRelative = null;
        $spread = $vvWet - $vvDry;
        if ($spread >= MIN_VV_SPREAD_DB && $totalCount >= MIN_OBSERVATIONS) {
            $smRelative = round(($vvDb - $vvDry) / $spread * 100, 2);
            $smRelative = max(0, min(100, $smRelative));
        }

        // Upsert
        $upsertStmt = $db->prepare("
            INSERT INTO soil_moisture_readings
                (field_id, date, vv_db, vh_db, vv_raw_db, ndvi_used, sm_relative, vv_dry, vv_wet)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                vv_db = VALUES(vv_db), vh_db = VALUES(vh_db), vv_raw_db = VALUES(vv_raw_db),
                ndvi_used = VALUES(ndvi_used), sm_relative = VALUES(sm_relative),
                vv_dry = VALUES(vv_dry), vv_wet = VALUES(vv_wet)
        ");
        $upsertStmt->execute([$fieldId, $date, $vvDb, $vhDb, $vvRawDb, $ndviUsed, $smRelative, $vvDry, $vvWet]);
        $inserted++;
    }

    // Recalculate SM% for all readings now that range may have expanded
    if ($inserted > 0) {
        $range = get_vv_range($db, $fieldId);
        $spread = ($range['max'] !== null && $range['min'] !== null) ? $range['max'] - $range['min'] : 0;

        if ($spread >= MIN_VV_SPREAD_DB && $range['count'] >= MIN_OBSERVATIONS) {
            $updateStmt = $db->prepare("
                UPDATE soil_moisture_readings
                SET sm_relative = ROUND(GREATEST(0, LEAST(100, (vv_db - ?) / ? * 100)), 2),
                    vv_dry = ?, vv_wet = ?
                WHERE field_id = ? AND vv_db IS NOT NULL
            ");
            $updateStmt->execute([$range['min'], $spread, $range['min'], $range['max'], $fieldId]);
            echo "    Recalculated SM% for all readings (range: {$range['min']} to {$range['max']} dB).\n";
        }
    }

    echo "    Inserted/updated $inserted soil moisture readings.\n";
    $totalInserted += $inserted;

    usleep(500000);
}

echo "Done. Total soil moisture readings processed: $totalInserted\n";
