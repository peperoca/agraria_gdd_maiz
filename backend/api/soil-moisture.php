<?php
/**
 * GET /api/soil-moisture.php?field_id=N — Get soil moisture readings for a field
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET');

$user = authenticate();
$db = getDB();

$fieldId = (int) ($_GET['field_id'] ?? 0);
if ($fieldId <= 0) json_error('field_id is required');

// Verify ownership
$stmt = $db->prepare("SELECT id FROM fields WHERE id = ? AND user_id = ?");
$stmt->execute([$fieldId, $user['id']]);
if (!$stmt->fetch()) json_error('Field not found', 404);

$from = isset($_GET['from']) ? $_GET['from'] : null;
$sql = "SELECT date, vv_db, vh_db, vv_raw_db, ndvi_used, sm_relative, vv_dry, vv_wet FROM soil_moisture_readings WHERE field_id = ?";
$params = [$fieldId];
if ($from && preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
    $sql .= " AND date >= ?";
    $params[] = $from;
}
$sql .= " ORDER BY date ASC";
$stmt = $db->prepare($sql);
$stmt->execute($params);
$readings = $stmt->fetchAll();

foreach ($readings as &$r) {
    $r['vv_db'] = $r['vv_db'] !== null ? (float) $r['vv_db'] : null;
    $r['vh_db'] = $r['vh_db'] !== null ? (float) $r['vh_db'] : null;
    $r['vv_raw_db'] = $r['vv_raw_db'] !== null ? (float) $r['vv_raw_db'] : null;
    $r['ndvi_used'] = $r['ndvi_used'] !== null ? (float) $r['ndvi_used'] : null;
    $r['sm_relative'] = $r['sm_relative'] !== null ? (float) $r['sm_relative'] : null;
    $r['vv_dry'] = $r['vv_dry'] !== null ? (float) $r['vv_dry'] : null;
    $r['vv_wet'] = $r['vv_wet'] !== null ? (float) $r['vv_wet'] : null;
}

json_response($readings);
