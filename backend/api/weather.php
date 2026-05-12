<?php
/**
 * GET /api/weather.php?mac=E8:DB:84:E6:C4:B8&from=2026-04-15
 * Optional params: from (ISO date), to (ISO date)
 * Returns: array of weather readings
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

// Build query with optional date filters
$sql = "
    SELECT
        r.dateutc,
        r.tempf,
        r.humidity,
        r.windspeedmph,
        r.solarradiation,
        r.baromrelin,
        r.dewpoint AS dewPoint,
        r.dailyrainin,
        r.hourlyrainin,
        r.date_iso AS date
    FROM weather_readings r
    JOIN stations s ON s.id = r.station_id
    WHERE s.mac = ?
";
$params = [$mac];

// Filter by date range (convert ISO dates to UTC millisecond timestamps)
if (!empty($_GET['from'])) {
    $fromTs = strtotime($_GET['from']) * 1000; // Convert to ms
    if ($fromTs) {
        $sql .= " AND r.dateutc >= ?";
        $params[] = $fromTs;
    }
}
if (!empty($_GET['to'])) {
    // Include the entire 'to' day
    $toTs = (strtotime($_GET['to']) + 86400) * 1000; // End of day in ms
    if ($toTs) {
        $sql .= " AND r.dateutc < ?";
        $params[] = $toTs;
    }
}

$sql .= " ORDER BY r.dateutc ASC LIMIT 100000";

$stmt = $db->prepare($sql);
$stmt->execute($params);
$readings = $stmt->fetchAll();

// Cast numeric fields
foreach ($readings as &$r) {
    $r['dateutc'] = (int) $r['dateutc'];
    $r['tempf'] = $r['tempf'] !== null ? (float) $r['tempf'] : null;
    $r['humidity'] = $r['humidity'] !== null ? (float) $r['humidity'] : null;
    $r['windspeedmph'] = $r['windspeedmph'] !== null ? (float) $r['windspeedmph'] : null;
    $r['solarradiation'] = $r['solarradiation'] !== null ? (float) $r['solarradiation'] : null;
    $r['baromrelin'] = $r['baromrelin'] !== null ? (float) $r['baromrelin'] : null;
    $r['dewPoint'] = $r['dewPoint'] !== null ? (float) $r['dewPoint'] : null;
    $r['dailyrainin'] = $r['dailyrainin'] !== null ? (float) $r['dailyrainin'] : null;
    $r['hourlyrainin'] = $r['hourlyrainin'] !== null ? (float) $r['hourlyrainin'] : null;
}

json_response($readings);
