<?php
/**
 * GET /api/weather-gaps.php?mac=E8:DB:84:E6:C4:B8
 * Returns gap log for a station: which dates were gap-filled, with what source, and if resolved.
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET');

$user = authenticate();
$db = getDB();

$mac = $_GET['mac'] ?? '';
if (!$mac) {
    json_error('Station MAC is required');
}

$stmt = $db->prepare("
    SELECT gl.gap_date, gl.has_carry_forward, gl.has_fallback,
           s2.name AS fallback_station_name,
           ROUND((6371 * acos(
               cos(radians(s.latitude)) * cos(radians(s2.latitude))
               * cos(radians(s2.longitude) - radians(s.longitude))
               + sin(radians(s.latitude)) * sin(radians(s2.latitude))
           )), 1) AS fallback_distance_km,
           gl.resolved_at, gl.created_at
    FROM weather_gap_log gl
    JOIN stations s ON s.id = gl.station_id
    LEFT JOIN stations s2 ON s2.id = gl.fallback_station_id
    WHERE s.mac = ?
    ORDER BY gl.gap_date DESC
    LIMIT 100
");
$stmt->execute([$mac]);
$gaps = $stmt->fetchAll();

foreach ($gaps as &$g) {
    $g['has_carry_forward'] = (bool) $g['has_carry_forward'];
    $g['has_fallback'] = (bool) $g['has_fallback'];
    $g['fallback_distance_km'] = $g['fallback_distance_km'] !== null ? (float) $g['fallback_distance_km'] : null;
}

json_response($gaps);
