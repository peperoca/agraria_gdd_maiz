<?php
/**
 * GET  /api/farms.php  — List user's farms
 * POST /api/farms.php  — Create a new farm (auto-assign nearest station)
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET', 'POST');

$user = authenticate();
$db = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->prepare("
        SELECT f.id, f.name, f.latitude, f.longitude,
               s.mac AS station_mac, s.name AS station_name, f.created_at
        FROM farms f
        LEFT JOIN stations s ON s.id = f.station_id AND s.is_active = 1
        WHERE f.user_id = ?
        ORDER BY f.name ASC
    ");
    $stmt->execute([$user['id']]);
    $farms = $stmt->fetchAll();

    foreach ($farms as &$f) {
        $f['id'] = (int) $f['id'];
        $f['latitude'] = $f['latitude'] !== null ? (float) $f['latitude'] : null;
        $f['longitude'] = $f['longitude'] !== null ? (float) $f['longitude'] : null;
        $f['stationMac'] = $f['station_mac'];
        $f['stationName'] = $f['station_name'];
        $f['createdAt'] = $f['created_at'];
        unset($f['station_mac'], $f['station_name'], $f['created_at']);
    }

    json_response($farms);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = get_json_body();

    $name = trim($body['name'] ?? '');
    $lat = isset($body['latitude']) ? (float) $body['latitude'] : null;
    $lon = isset($body['longitude']) ? (float) $body['longitude'] : null;

    if (!$name) json_error('Farm name is required');

    // Auto-assign nearest station if coordinates given
    $stationId = null;
    $stationMac = null;
    $stationName = null;
    if ($lat !== null && $lon !== null) {
        $nearest = find_nearest_station($lat, $lon, 50);
        if ($nearest) {
            $stationId = (int) $nearest['id'];
            $stationMac = $nearest['mac'];
            $stationName = $nearest['name'];
        }
    }

    $stmt = $db->prepare("
        INSERT INTO farms (user_id, name, latitude, longitude, station_id)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->execute([$user['id'], $name, $lat, $lon, $stationId]);
    $farmId = (int) $db->lastInsertId();

    json_response([
        'id' => $farmId,
        'name' => $name,
        'latitude' => $lat,
        'longitude' => $lon,
        'stationMac' => $stationMac,
        'stationName' => $stationName,
        'createdAt' => date('Y-m-d H:i:s'),
    ], 201);
}
