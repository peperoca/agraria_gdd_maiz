<?php
/**
 * GET /api/ndvi-image.php?field_id=N&date=YYYY-MM-DD&type=truecolor|ndvi
 *
 * Returns a PNG image from Sentinel Hub Process API.
 * Proxies the request because CDSE credentials are server-side.
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET');

$user = authenticate();
$db = getDB();

$fieldId = (int) ($_GET['field_id'] ?? 0);
$date = $_GET['date'] ?? '';
$type = $_GET['type'] ?? 'ndvi'; // 'truecolor' or 'ndvi'

if ($fieldId <= 0) json_error('field_id is required');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) json_error('Invalid date format');
if (!in_array($type, ['truecolor', 'ndvi'])) json_error('type must be truecolor or ndvi');

// Get field polygon
$stmt = $db->prepare("SELECT polygon FROM fields WHERE id = ? AND user_id = ?");
$stmt->execute([$fieldId, $user['id']]);
$field = $stmt->fetch();
if (!$field || !$field['polygon']) json_error('Field not found or no polygon', 404);

$polygon = json_decode($field['polygon'], true);
if (!$polygon || !isset($polygon['coordinates'])) json_error('Invalid polygon');

// Compute bounding box from polygon
$coords = $polygon['coordinates'][0];
$lngs = array_column($coords, 0);
$lats = array_column($coords, 1);
$bbox = [min($lngs), min($lats), max($lngs), max($lats)];

// Add 10% padding
$lngPad = (max($lngs) - min($lngs)) * 0.1;
$latPad = (max($lats) - min($lats)) * 0.1;
$bbox = [
    $bbox[0] - $lngPad,
    $bbox[1] - $latPad,
    $bbox[2] + $lngPad,
    $bbox[3] + $latPad,
];

// Calculate image dimensions (max 512px, maintain aspect ratio)
$lngRange = $bbox[2] - $bbox[0];
$latRange = $bbox[3] - $bbox[1];
$maxDim = 512;
if ($lngRange > $latRange) {
    $width = $maxDim;
    $height = max(1, (int) round($maxDim * $latRange / $lngRange));
} else {
    $height = $maxDim;
    $width = max(1, (int) round($maxDim * $lngRange / $latRange));
}

// Get CDSE token
if (!defined('CDSE_CLIENT_ID') || !CDSE_CLIENT_ID) json_error('CDSE not configured', 500);

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
    CURLOPT_TIMEOUT => 15,
]);
$tokenBody = curl_exec($ch);
curl_close($ch);
$tokenData = json_decode($tokenBody, true);
$token = $tokenData['access_token'] ?? null;
if (!$token) json_error('Failed to get CDSE token', 500);

// Build evalscript
if ($type === 'truecolor') {
    $evalscript = <<<'SCRIPT'
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B03", "B02"], units: "DN" }],
    output: { bands: 3, sampleType: "UINT8" }
  };
}
function evaluatePixel(sample) {
  let gain = 3.5 / 10000;
  return [
    Math.min(255, Math.max(0, sample.B04 * gain * 255)),
    Math.min(255, Math.max(0, sample.B03 * gain * 255)),
    Math.min(255, Math.max(0, sample.B02 * gain * 255))
  ];
}
SCRIPT;
} else {
    $evalscript = <<<'SCRIPT'
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL"], units: "DN" }],
    output: { bands: 3, sampleType: "AUTO" }
  };
}
function evaluatePixel(sample) {
  let scl = sample.SCL;
  if (scl === 3 || scl === 8 || scl === 9 || scl === 10) {
    return [0.8, 0.8, 0.8]; // Cloud = gray
  }
  let nir = sample.B08;
  let red = sample.B04;
  if (nir + red === 0) return [0, 0, 0];
  let ndvi = (nir - red) / (nir + red);

  // Color ramp: brown(-0.2) -> yellow(0.1) -> light green(0.3) -> green(0.5) -> dark green(0.8+)
  if (ndvi < -0.2) return [0.5, 0.3, 0.1];
  if (ndvi < 0.1) { let t = (ndvi + 0.2) / 0.3; return [0.5 + t * 0.5, 0.3 + t * 0.5, 0.1]; }
  if (ndvi < 0.3) { let t = (ndvi - 0.1) / 0.2; return [1.0 - t * 0.5, 0.8, 0.1 * (1 - t)]; }
  if (ndvi < 0.5) { let t = (ndvi - 0.3) / 0.2; return [0.5 - t * 0.3, 0.8 - t * 0.1, t * 0.1]; }
  if (ndvi < 0.8) { let t = (ndvi - 0.5) / 0.3; return [0.2 - t * 0.15, 0.7 - t * 0.2, 0.1 + t * 0.1]; }
  return [0.05, 0.5, 0.2];
}
SCRIPT;
}

$fromDate = $date . 'T00:00:00Z';
$toDate = $date . 'T23:59:59Z';

$payload = [
    'input' => [
        'bounds' => [
            'bbox' => $bbox,
            'properties' => ['crs' => 'http://www.opengis.net/def/crs/EPSG/0/4326'],
        ],
        'data' => [[
            'type' => 'sentinel-2-l2a',
            'dataFilter' => [
                'timeRange' => ['from' => $fromDate, 'to' => $toDate],
                'mosaickingOrder' => 'leastCC',
            ],
        ]],
    ],
    'output' => [
        'width' => $width,
        'height' => $height,
        'responses' => [[
            'identifier' => 'default',
            'format' => ['type' => 'image/png'],
        ]],
    ],
    'evalscript' => $evalscript,
];

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => 'https://sh.dataspace.copernicus.eu/api/v1/process',
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $token,
        'Accept: image/png',
    ],
    CURLOPT_TIMEOUT => 30,
]);

$imageData = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($status !== 200 || !$imageData) {
    json_error('Failed to fetch image from Sentinel Hub (HTTP ' . $status . ')', 502);
}

// Return image directly
header('Content-Type: image/png');
header('Cache-Control: public, max-age=86400'); // Cache 24h
echo $imageData;
exit;
