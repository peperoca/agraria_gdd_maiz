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

// If lat/lon provided, return ALL active stations sorted by distance (for station picker)
$lat = isset($_GET['lat']) ? (float) $_GET['lat'] : null;
$lon = isset($_GET['lon']) ? (float) $_GET['lon'] : null;

if ($lat !== null && $lon !== null) {
    $stmt = $db->prepare("
        SELECT s.id, s.mac, s.name, s.latitude, s.longitude, s.elevation_m AS elevationM,
            ROUND(6371 * acos(
                cos(radians(?)) * cos(radians(s.latitude))
                * cos(radians(s.longitude) - radians(?))
                + sin(radians(?)) * sin(radians(s.latitude))
            ), 1) AS distance_km
        FROM stations s
        WHERE s.is_active = 1
        ORDER BY distance_km ASC
    ");
    $stmt->execute([$lat, $lon, $lat]);
} else {
    $stmt = $db->prepare("
        SELECT s.id, s.mac, s.name, s.latitude, s.longitude, s.elevation_m AS elevationM,
            NULL AS distance_km
        FROM stations s
        JOIN user_stations us ON us.station_id = s.id
        WHERE us.user_id = ? AND s.is_active = 1
        ORDER BY s.name
    ");
    $stmt->execute([$user['id']]);
}

$stations = $stmt->fetchAll();

// Cast numeric fields
foreach ($stations as &$s) {
    $s['id'] = (int) $s['id'];
    $s['latitude'] = (float) $s['latitude'];
    $s['longitude'] = (float) $s['longitude'];
    $s['elevationM'] = (int) $s['elevationM'];
    $s['distanceKm'] = $s['distance_km'] !== null ? (float) $s['distance_km'] : null;
    unset($s['distance_km']);
}

json_response($stations);
