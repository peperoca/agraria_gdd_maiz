<?php
/**
 * GET /api/ndvi.php?field_id=N — Get NDVI readings for a field
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
$sql = "SELECT date, ndvi_mean, kc, cloud_pct FROM ndvi_readings WHERE field_id = ?";
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
    $r['ndvi_mean'] = (float) $r['ndvi_mean'];
    $r['kc'] = (float) $r['kc'];
    $r['cloud_pct'] = $r['cloud_pct'] !== null ? (float) $r['cloud_pct'] : null;
}

json_response($readings);
