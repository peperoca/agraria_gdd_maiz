<?php
/**
 * GET  /api/fields.php            - List all fields for authenticated user
 * GET  /api/fields.php?farm_id=N  - List fields for a specific farm
 * POST /api/fields.php            - Create a new field
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET', 'POST');

$user = authenticate();
$db = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $farmId = isset($_GET['farm_id']) ? (int) $_GET['farm_id'] : null;

    if ($farmId) {
        // Verify farm ownership
        $check = $db->prepare("SELECT id FROM farms WHERE id = ? AND user_id = ?");
        $check->execute([$farmId, $user['id']]);
        if (!$check->fetch()) json_error('Farm not found', 404);

        $stmt = $db->prepare("
            SELECT f.id, f.name, f.sowing_date AS sowingDate,
                   COALESCE(f.crop_type, 'corn') AS cropType,
                   f.polygon,
                   f.station_mac AS stationMac, f.farm_id AS farmId,
                   f.created_at AS createdAt
            FROM fields f
            WHERE f.user_id = ? AND f.farm_id = ?
            ORDER BY f.created_at DESC
        ");
        $stmt->execute([$user['id'], $farmId]);
    } else {
        $stmt = $db->prepare("
            SELECT f.id, f.name, f.sowing_date AS sowingDate,
                   COALESCE(f.crop_type, 'corn') AS cropType,
                   f.polygon,
                   f.station_mac AS stationMac, f.farm_id AS farmId,
                   f.created_at AS createdAt
            FROM fields f
            WHERE f.user_id = ?
            ORDER BY f.created_at DESC
        ");
        $stmt->execute([$user['id']]);
    }

    $fields = $stmt->fetchAll();
    foreach ($fields as &$f) {
        $f['id'] = (int) $f['id'];
        $f['farmId'] = $f['farmId'] !== null ? (int) $f['farmId'] : null;
        $f['polygon'] = $f['polygon'] ? json_decode($f['polygon'], true) : null;
    }

    json_response($fields);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = get_json_body();

    $name = trim($body['name'] ?? '');
    $sowingDate = $body['sowingDate'] ?? '';
    $stationMac = $body['stationMac'] ?? '';
    $cropType = $body['cropType'] ?? 'corn';
    $farmId = isset($body['farmId']) ? (int) $body['farmId'] : null;
    $polygon = isset($body['polygon']) && $body['polygon'] ? json_encode($body['polygon']) : null;

    if (!$name) json_error('Field name is required');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $sowingDate)) json_error('Invalid sowing date format (use YYYY-MM-DD)');
    if (!in_array($cropType, ['corn', 'soybean', 'wheat'])) json_error('Invalid crop type');

    // If farmId given, verify ownership and get station from farm
    if ($farmId) {
        $fCheck = $db->prepare("SELECT f.id, s.mac FROM farms f LEFT JOIN stations s ON s.id = f.station_id WHERE f.id = ? AND f.user_id = ?");
        $fCheck->execute([$farmId, $user['id']]);
        $farmRow = $fCheck->fetch();
        if (!$farmRow) json_error('Farm not found', 404);
        if (!$stationMac && $farmRow['mac']) {
            $stationMac = $farmRow['mac'];
        }
    }

    if (!$stationMac) json_error('No station available. Create a farm with a location first.');

    $stmt = $db->prepare("
        INSERT INTO fields (user_id, name, sowing_date, station_mac, crop_type, farm_id, polygon)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([$user['id'], $name, $sowingDate, $stationMac, $cropType, $farmId, $polygon]);
    $fieldId = (int) $db->lastInsertId();

    json_response([
        'id' => $fieldId,
        'name' => $name,
        'sowingDate' => $sowingDate,
        'cropType' => $cropType,
        'stationMac' => $stationMac,
        'polygon' => $polygon ? json_decode($polygon, true) : null,
        'farmId' => $farmId,
        'createdAt' => date('Y-m-d H:i:s'),
    ], 201);
}
