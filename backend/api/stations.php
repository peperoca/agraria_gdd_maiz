<?php
/**
 * GET /api/stations.php
 * Returns list of stations available to the authenticated user
 * Does NOT expose API keys
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET');

$user = authenticate();
$db = getDB();

$stmt = $db->prepare("
    SELECT s.mac, s.name, s.latitude, s.longitude, s.elevation_m AS elevationM
    FROM stations s
    JOIN user_stations us ON us.station_id = s.id
    WHERE us.user_id = ? AND s.is_active = 1
    ORDER BY s.name
");
$stmt->execute([$user['id']]);
$stations = $stmt->fetchAll();

// Cast numeric fields
foreach ($stations as &$s) {
    $s['latitude'] = (float) $s['latitude'];
    $s['longitude'] = (float) $s['longitude'];
    $s['elevationM'] = (int) $s['elevationM'];
}

json_response($stations);
