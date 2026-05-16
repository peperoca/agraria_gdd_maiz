<?php
/**
 * Cron job: Detect and fill weather data gaps
 * Schedule: every hour at :30 (30 * * * *), after fetch_weather
 *
 * For each active station:
 * 1. Detect days with zero readings in the last 7 days
 * 2. Generate carry-forward data (copy last known day, max 3 days)
 * 3. Generate fallback-station data (nearest station within 30km)
 * 4. Mark gap-fills as replaced when real data arrives
 */

set_time_limit(300);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

$db = getDB();
$MAX_CARRY_FORWARD_DAYS = 3;
$LOOKBACK_DAYS = 7;
$FALLBACK_RADIUS_KM = 30;

function logMsg(string $msg): void {
    $ts = date('Y-m-d H:i:s');
    echo "[$ts] $msg\n";
}

// ── Step 1: Mark resolved gaps ──
// If real data now exists for a gap day, mark gap_fills as replaced
$db->exec("
    UPDATE weather_gap_fills gf
    INNER JOIN (
        SELECT DISTINCT wr.station_id, DATE(FROM_UNIXTIME(wr.dateutc / 1000)) AS reading_date
        FROM weather_readings wr
    ) rd ON rd.station_id = gf.station_id AND rd.gap_date = rd.reading_date
    SET gf.replaced_at = NOW()
    WHERE gf.replaced_at IS NULL
    AND gf.gap_date = rd.reading_date
");

$db->exec("
    UPDATE weather_gap_log gl
    INNER JOIN (
        SELECT station_id, DATE(FROM_UNIXTIME(dateutc / 1000)) AS reading_date,
               COUNT(*) AS cnt
        FROM weather_readings
        WHERE dateutc >= (UNIX_TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 7 DAY)) * 1000)
        GROUP BY station_id, reading_date
    ) rd ON rd.station_id = gl.station_id AND rd.reading_date = gl.gap_date AND rd.cnt >= 6
    SET gl.resolved_at = NOW()
    WHERE gl.resolved_at IS NULL
");

$resolved = $db->exec("SELECT ROW_COUNT()");
logMsg("Resolved gaps with real data: checked");

// ── Step 2: Process each station ──
$stations = $db->query("
    SELECT id, mac, name, latitude, longitude
    FROM stations WHERE is_active = 1
")->fetchAll();

if (empty($stations)) {
    logMsg("No active stations.");
    exit;
}

foreach ($stations as $station) {
    $stationId = (int) $station['id'];
    logMsg("Processing station: {$station['name']} ({$station['mac']})");

    // Find days with real data in lookback window
    $stmt = $db->prepare("
        SELECT DISTINCT DATE(FROM_UNIXTIME(dateutc / 1000)) AS reading_date
        FROM weather_readings
        WHERE station_id = ?
        AND dateutc >= (UNIX_TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL ? DAY)) * 1000)
        ORDER BY reading_date
    ");
    $stmt->execute([$stationId, $LOOKBACK_DAYS]);
    $daysWithData = array_column($stmt->fetchAll(), 'reading_date');

    // Build list of expected dates
    $today = new DateTime('today');
    $startDate = (clone $today)->modify("-{$LOOKBACK_DAYS} days");
    $expectedDates = [];
    $current = clone $startDate;
    while ($current < $today) {
        $expectedDates[] = $current->format('Y-m-d');
        $current->modify('+1 day');
    }

    $gapDates = array_diff($expectedDates, $daysWithData);

    if (empty($gapDates)) {
        logMsg("  No gaps detected");
        continue;
    }

    logMsg("  Found " . count($gapDates) . " gap day(s): " . implode(', ', $gapDates));

    // ── Carry-forward: copy last known day's readings ──
    // Find the most recent day with real data before the gap
    $stmt = $db->prepare("
        SELECT dateutc, tempf, humidity, windspeedmph, solarradiation,
               baromrelin, dewpoint, dailyrainin, hourlyrainin, date_iso
        FROM weather_readings
        WHERE station_id = ?
        AND dateutc < (UNIX_TIMESTAMP(?) * 1000)
        ORDER BY dateutc DESC
        LIMIT 288
    ");

    $insertGapFill = $db->prepare("
        INSERT IGNORE INTO weather_gap_fills
            (station_id, dateutc, source, source_station_id, tempf, humidity,
             windspeedmph, solarradiation, baromrelin, dewpoint,
             dailyrainin, hourlyrainin, date_iso, gap_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");

    $insertLog = $db->prepare("
        INSERT INTO weather_gap_log (station_id, gap_date, has_carry_forward, has_fallback, fallback_station_id)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            has_carry_forward = VALUES(has_carry_forward),
            has_fallback = VALUES(has_fallback),
            fallback_station_id = VALUES(fallback_station_id)
    ");

    $carryForwardDays = 0;
    foreach ($gapDates as $gapDate) {
        // Check if already gap-filled
        $check = $db->prepare("SELECT id FROM weather_gap_log WHERE station_id = ? AND gap_date = ? AND resolved_at IS NULL");
        $check->execute([$stationId, $gapDate]);
        $existingLog = $check->fetch();

        // ── Carry-forward (max 3 days from last real data) ──
        $hasCarryForward = false;
        if ($carryForwardDays < $MAX_CARRY_FORWARD_DAYS) {
            $stmt->execute([$stationId, $gapDate]);
            $lastDayReadings = $stmt->fetchAll();

            if (!empty($lastDayReadings)) {
                // Get the date of the source readings
                $sourceDate = new DateTime('@' . ($lastDayReadings[0]['dateutc'] / 1000));
                $gapDateTime = new DateTime($gapDate);
                $dayDiff = (int) $gapDateTime->diff($sourceDate)->days;

                if ($dayDiff <= $MAX_CARRY_FORWARD_DAYS) {
                    $cfInserted = 0;
                    foreach ($lastDayReadings as $r) {
                        // Shift the timestamp to the gap date (keep same time-of-day)
                        $origTs = (int) $r['dateutc'];
                        $origDate = new DateTime('@' . ($origTs / 1000));
                        $timeOfDay = ($origTs / 1000) % 86400;
                        $newTs = (strtotime($gapDate) + $timeOfDay) * 1000;
                        $newIso = date('c', $newTs / 1000);

                        $insertGapFill->execute([
                            $stationId, $newTs, 'carry_forward', null,
                            $r['tempf'], $r['humidity'], $r['windspeedmph'],
                            $r['solarradiation'], $r['baromrelin'], $r['dewpoint'],
                            0, 0, // dailyrainin + hourlyrainin zeroed for carry-forward
                            $newIso, $gapDate,
                        ]);
                        if ($insertGapFill->rowCount() > 0) $cfInserted++;
                    }
                    $hasCarryForward = $cfInserted > 0;
                    if ($hasCarryForward) {
                        logMsg("    $gapDate: carry-forward $cfInserted readings");
                    }
                }
            }
            $carryForwardDays++;
        }

        // ── Fallback station ──
        $hasFallback = false;
        $fallbackStationId = null;

        if ($station['latitude'] && $station['longitude']) {
            // Find nearest OTHER active station
            $fbStmt = $db->prepare("
                SELECT id, mac, name, latitude, longitude,
                (6371 * acos(
                    cos(radians(?)) * cos(radians(latitude))
                    * cos(radians(longitude) - radians(?))
                    + sin(radians(?)) * sin(radians(latitude))
                )) AS distance_km
                FROM stations
                WHERE is_active = 1 AND id != ?
                HAVING distance_km <= ?
                ORDER BY distance_km ASC
                LIMIT 1
            ");
            $fbStmt->execute([
                $station['latitude'], $station['longitude'],
                $station['latitude'], $stationId, $FALLBACK_RADIUS_KM,
            ]);
            $fallbackStation = $fbStmt->fetch();

            if ($fallbackStation) {
                $fallbackStationId = (int) $fallbackStation['id'];

                // Fetch that station's readings for the gap date
                $fbReadingsStmt = $db->prepare("
                    SELECT dateutc, tempf, humidity, windspeedmph, solarradiation,
                           baromrelin, dewpoint, dailyrainin, hourlyrainin, date_iso
                    FROM weather_readings
                    WHERE station_id = ?
                    AND dateutc >= (UNIX_TIMESTAMP(?) * 1000)
                    AND dateutc < (UNIX_TIMESTAMP(DATE_ADD(?, INTERVAL 1 DAY)) * 1000)
                    ORDER BY dateutc
                ");
                $fbReadingsStmt->execute([$fallbackStationId, $gapDate, $gapDate]);
                $fbReadings = $fbReadingsStmt->fetchAll();

                if (!empty($fbReadings)) {
                    $fbInserted = 0;
                    foreach ($fbReadings as $r) {
                        $insertGapFill->execute([
                            $stationId, (int) $r['dateutc'], 'fallback', $fallbackStationId,
                            $r['tempf'], $r['humidity'], $r['windspeedmph'],
                            $r['solarradiation'], $r['baromrelin'], $r['dewpoint'],
                            $r['dailyrainin'], $r['hourlyrainin'],
                            $r['date_iso'], $gapDate,
                        ]);
                        if ($insertGapFill->rowCount() > 0) $fbInserted++;
                    }
                    $hasFallback = $fbInserted > 0;
                    if ($hasFallback) {
                        logMsg("    $gapDate: fallback from '{$fallbackStation['name']}' ({$fallbackStation['distance_km']}km) $fbInserted readings");
                    }
                } else {
                    logMsg("    $gapDate: fallback station '{$fallbackStation['name']}' has no data either");
                }
            }
        }

        // Log the gap
        $insertLog->execute([
            $stationId, $gapDate,
            $hasCarryForward ? 1 : 0,
            $hasFallback ? 1 : 0,
            $fallbackStationId,
        ]);

        if (!$hasCarryForward && !$hasFallback) {
            logMsg("    $gapDate: NO DATA AVAILABLE for gap-fill");
        }
    }
}

logMsg("Done.");
