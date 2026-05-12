<?php
/**
 * GET  /api/fields.php        - List all fields for authenticated user
 * POST /api/fields.php        - Create a new field
 *   Body: { "name": "...", "sowingDate": "2026-04-23", "stationMac": "E8:DB:84:E6:C4:B8" }
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET', 'POST');

$user = authenticate();
$db = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->prepare("
        SELECT id, name, sowing_date AS sowingDate, station_mac AS stationMac, created_at AS createdAt
        FROM fields
        WHERE user_id = ?
        ORDER BY created_at DESC
    ");
    $stmt->execute([$user['id']]);
    $fields = $stmt->fetchAll();

    // Cast id to int
    foreach ($fields as &$f) {
        $f['id'] = (int) $f['id'];
    }

    json_response($fields);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = get_json_body();

    $name = trim($body['name'] ?? '');
    $sowingDate = $body['sowingDate'] ?? '';
    $stationMac = $body['stationMac'] ?? '';

    if (!$name) {
        json_error('Field name is required');
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $sowingDate)) {
        json_error('Invalid sowing date format (use YYYY-MM-DD)');
    }
    if (!$stationMac) {
        json_error('Station MAC is required');
    }

    $stmt = $db->prepare("
        INSERT INTO fields (user_id, name, sowing_date, station_mac)
        VALUES (?, ?, ?, ?)
    ");
    $stmt->execute([$user['id'], $name, $sowingDate, $stationMac]);
    $fieldId = (int) $db->lastInsertId();

    json_response([
        'id' => $fieldId,
        'name' => $name,
        'sowingDate' => $sowingDate,
        'stationMac' => $stationMac,
        'createdAt' => date('Y-m-d H:i:s'),
    ], 201);
}
