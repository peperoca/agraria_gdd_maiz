<?php
/**
 * GET    /api/field.php?id=N   - Get a single field
 * PUT    /api/field.php?id=N   - Update a field
 * DELETE /api/field.php?id=N   - Delete a field
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET', 'PUT', 'DELETE');

$user = authenticate();
$db = getDB();

$fieldId = (int) ($_GET['id'] ?? 0);
if ($fieldId <= 0) json_error('Field ID is required');

// Verify ownership
$stmt = $db->prepare("
    SELECT id, name, sowing_date AS sowingDate, station_mac AS stationMac,
           COALESCE(crop_type, 'corn') AS cropType, polygon,
           farm_id AS farmId, created_at AS createdAt
    FROM fields
    WHERE id = ? AND user_id = ?
");
$stmt->execute([$fieldId, $user['id']]);
$field = $stmt->fetch();

if (!$field) json_error('Field not found', 404);
$field['id'] = (int) $field['id'];
$field['farmId'] = $field['farmId'] !== null ? (int) $field['farmId'] : null;
$field['polygon'] = $field['polygon'] ? json_decode($field['polygon'], true) : null;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    json_response($field);
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $body = get_json_body();

    $name = trim($body['name'] ?? $field['name']);
    $sowingDate = $body['sowingDate'] ?? $field['sowingDate'];
    $cropType = $body['cropType'] ?? $field['cropType'];

    if (!$name) json_error('Field name is required');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $sowingDate)) json_error('Invalid sowing date format');
    if (!in_array($cropType, ['corn', 'soybean', 'wheat'])) json_error('Invalid crop type');

    $polygon = array_key_exists('polygon', $body)
        ? ($body['polygon'] ? json_encode($body['polygon']) : null)
        : ($field['polygon'] ? json_encode($field['polygon']) : null);

    $stmt = $db->prepare("UPDATE fields SET name = ?, sowing_date = ?, crop_type = ?, polygon = ? WHERE id = ?");
    $stmt->execute([$name, $sowingDate, $cropType, $polygon, $fieldId]);

    json_response([
        'id' => $fieldId,
        'name' => $name,
        'sowingDate' => $sowingDate,
        'cropType' => $cropType,
        'polygon' => $polygon ? json_decode($polygon, true) : null,
        'stationMac' => $field['stationMac'],
        'farmId' => $field['farmId'],
        'createdAt' => $field['createdAt'],
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $stmt = $db->prepare("DELETE FROM fields WHERE id = ? AND user_id = ?");
    $stmt->execute([$fieldId, $user['id']]);
    json_response(['success' => true]);
}
