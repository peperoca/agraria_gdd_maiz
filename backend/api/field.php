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
if ($fieldId <= 0) {
    json_error('Field ID is required');
}

// Verify ownership
$stmt = $db->prepare("
    SELECT id, name, sowing_date AS sowingDate, station_mac AS stationMac, created_at AS createdAt
    FROM fields
    WHERE id = ? AND user_id = ?
");
$stmt->execute([$fieldId, $user['id']]);
$field = $stmt->fetch();

if (!$field) {
    json_error('Field not found', 404);
}

$field['id'] = (int) $field['id'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    json_response($field);
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $body = get_json_body();

    $name = trim($body['name'] ?? $field['name']);
    $sowingDate = $body['sowingDate'] ?? $field['sowingDate'];

    if (!$name) {
        json_error('Field name is required');
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $sowingDate)) {
        json_error('Invalid sowing date format (use YYYY-MM-DD)');
    }

    $stmt = $db->prepare("UPDATE fields SET name = ?, sowing_date = ? WHERE id = ?");
    $stmt->execute([$name, $sowingDate, $fieldId]);

    json_response([
        'id' => $fieldId,
        'name' => $name,
        'sowingDate' => $sowingDate,
        'stationMac' => $field['stationMac'],
        'createdAt' => $field['createdAt'],
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $stmt = $db->prepare("DELETE FROM fields WHERE id = ? AND user_id = ?");
    $stmt->execute([$fieldId, $user['id']]);

    json_response(['success' => true]);
}
