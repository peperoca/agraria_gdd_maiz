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
    // Haversine distance SQL fragment (returns km between farm and station)
    $distExpr = "CASE WHEN f.latitude IS NOT NULL AND s.latitude IS NOT NULL THEN
        ROUND(6371 * acos(
            cos(radians(f.latitude)) * cos(radians(s.latitude))
            * cos(radians(s.longitude) - radians(f.longitude))
            + sin(radians(f.latitude)) * sin(radians(s.latitude))
        ), 1)
        ELSE NULL END";

    if ($user['role'] === 'admin') {
        // Admins see all farms
        $stmt = $db->prepare("
            SELECT f.id, f.name, f.latitude, f.longitude,
                   s.mac AS station_mac, s.name AS station_name, f.created_at,
                   u.username AS owner_username,
                   CASE WHEN f.user_id = ? THEN 'owner' ELSE 'admin' END AS access,
                   $distExpr AS station_distance_km
            FROM farms f
            LEFT JOIN stations s ON s.id = f.station_id AND s.is_active = 1
            LEFT JOIN users u ON u.id = f.user_id
            ORDER BY f.name ASC
        ");
        $stmt->execute([$user['id']]);
    } else {
        // Regular users: owned farms + shared farms
        $stmt = $db->prepare("
            SELECT f.id, f.name, f.latitude, f.longitude,
                   s.mac AS station_mac, s.name AS station_name, f.created_at,
                   NULL AS owner_username,
                   'owner' AS access,
                   $distExpr AS station_distance_km
            FROM farms f
            LEFT JOIN stations s ON s.id = f.station_id AND s.is_active = 1
            WHERE f.user_id = ?
            UNION
            SELECT f.id, f.name, f.latitude, f.longitude,
                   s.mac AS station_mac, s.name AS station_name, f.created_at,
                   u.username AS owner_username,
                   'shared' AS access,
                   $distExpr AS station_distance_km
            FROM farms f
            JOIN shares sh ON sh.entity_type = 'farm' AND sh.entity_id = f.id AND sh.shared_with_id = ?
            LEFT JOIN stations s ON s.id = f.station_id AND s.is_active = 1
            LEFT JOIN users u ON u.id = f.user_id
            ORDER BY access ASC, name ASC
        ");
        $stmt->execute([$user['id'], $user['id']]);
    }

    $farms = $stmt->fetchAll();

    foreach ($farms as &$f) {
        $f['id'] = (int) $f['id'];
        $f['latitude'] = $f['latitude'] !== null ? (float) $f['latitude'] : null;
        $f['longitude'] = $f['longitude'] !== null ? (float) $f['longitude'] : null;
        $f['stationMac'] = $f['station_mac'];
        $f['stationName'] = $f['station_name'];
        $f['createdAt'] = $f['created_at'];
        $f['ownerUsername'] = $f['owner_username'];
        $f['stationDistanceKm'] = $f['station_distance_km'] !== null ? (float) $f['station_distance_km'] : null;
        // access is already set from query
        unset($f['station_mac'], $f['station_name'], $f['created_at'], $f['owner_username'], $f['station_distance_km']);
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

    $distKm = null;
    if ($nearest && $lat !== null && $lon !== null) {
        $distKm = round($nearest['distance_km'], 1);
    }

    json_response([
        'id' => $farmId,
        'name' => $name,
        'latitude' => $lat,
        'longitude' => $lon,
        'stationMac' => $stationMac,
        'stationName' => $stationName,
        'stationDistanceKm' => $distKm,
        'createdAt' => date('Y-m-d H:i:s'),
    ], 201);
}
