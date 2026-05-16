<?php
/**
 * GET /api/weather.php?mac=E8:DB:84:E6:C4:B8&from=2026-04-15
 * Optional params: from (ISO date), to (ISO date)
 * Returns: array of weather readings with source flags
 *
 * Each reading includes a 'source' field:
 *   'station' — real data from the assigned station
 *   'carry_forward' — copied from last known day (gap ≤ 3 days)
 *   'fallback' — from nearest station during blackout
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

// ── Real readings ──
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
        r.date_iso AS date,
        'station' AS source
    FROM weather_readings r
    JOIN stations s ON s.id = r.station_id
    WHERE s.mac = ?
";
$params = [$mac];

if (!empty($_GET['from'])) {
    $fromTs = strtotime($_GET['from']) * 1000;
    if ($fromTs) {
        $sql .= " AND r.dateutc >= ?";
        $params[] = $fromTs;
    }
}
if (!empty($_GET['to'])) {
    $toTs = (strtotime($_GET['to']) + 86400) * 1000;
    if ($toTs) {
        $sql .= " AND r.dateutc < ?";
        $params[] = $toTs;
    }
}

// ── Gap-fill readings (unreplaced) ──
$sqlGap = "
    SELECT
        gf.dateutc,
        gf.tempf,
        gf.humidity,
        gf.windspeedmph,
        gf.solarradiation,
        gf.baromrelin,
        gf.dewpoint AS dewPoint,
        gf.dailyrainin,
        gf.hourlyrainin,
        gf.date_iso AS date,
        gf.source
    FROM weather_gap_fills gf
    JOIN stations s ON s.id = gf.station_id
    WHERE s.mac = ?
    AND gf.replaced_at IS NULL
";
$paramsGap = [$mac];

if (!empty($_GET['from'])) {
    $fromTs = strtotime($_GET['from']) * 1000;
    if ($fromTs) {
        $sqlGap .= " AND gf.dateutc >= ?";
        $paramsGap[] = $fromTs;
    }
}
if (!empty($_GET['to'])) {
    $toTs = (strtotime($_GET['to']) + 86400) * 1000;
    if ($toTs) {
        $sqlGap .= " AND gf.dateutc < ?";
        $paramsGap[] = $toTs;
    }
}

// Combine: real data + gap fills, sorted by timestamp
$combined = "
    SELECT * FROM (
        ($sql)
        UNION ALL
        ($sqlGap)
    ) combined
    ORDER BY dateutc ASC
    LIMIT 150000
";
$allParams = array_merge($params, $paramsGap);

$stmt = $db->prepare($combined);
$stmt->execute($allParams);
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
    // source is already a string: 'station', 'carry_forward', or 'fallback'
}

json_response($readings);
