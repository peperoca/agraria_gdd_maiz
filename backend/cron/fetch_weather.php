<?php
/**
 * Cron job: Fetch latest weather readings from Ambient Weather API
 * Schedule: every hour (0 * * * *)
 *
 * Fetches the last 288 readings (~24h) for each active station.
 * Duplicates are ignored via INSERT IGNORE on the unique (station_id, dateutc) key.
 */

set_time_limit(300);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

$db = getDB();

function logMsg(string $msg): void {
    $ts = date('Y-m-d H:i:s');
    echo "[$ts] $msg\n";
}

$stations = $db->query("SELECT id, mac, name, api_key, application_key FROM stations WHERE is_active = 1")->fetchAll();

if (empty($stations)) {
    logMsg("No active stations found.");
    exit;
}

foreach ($stations as $station) {
    logMsg("Fetching station: {$station['name']} ({$station['mac']})");

    $url = AMBIENT_API_URL . '/' . urlencode($station['mac']) . '?' . http_build_query([
        'apiKey' => $station['api_key'],
        'applicationKey' => $station['application_key'],
        'limit' => 288,
    ]);

    $result = curl_fetch($url);

    if ($result['status'] === 0) {
        logMsg("  ERROR: cURL failed: {$result['error']}");
        continue;
    }

    if ($result['status'] !== 200) {
        logMsg("  ERROR: API returned HTTP {$result['status']}");
        continue;
    }

    $readings = json_decode($result['body'], true);

    if (!is_array($readings)) {
        logMsg("  ERROR: Invalid JSON response");
        continue;
    }

    logMsg("  Received " . count($readings) . " readings");

    $stmt = $db->prepare("
        INSERT IGNORE INTO weather_readings
            (station_id, dateutc, tempf, humidity, windspeedmph, solarradiation, baromrelin, dewpoint, dailyrainin, hourlyrainin, date_iso)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");

    $inserted = 0;
    foreach ($readings as $r) {
        if (!isset($r['dateutc'])) continue;

        $stmt->execute([
            $station['id'],
            $r['dateutc'],
            $r['tempf'] ?? null,
            $r['humidity'] ?? null,
            $r['windspeedmph'] ?? null,
            $r['solarradiation'] ?? null,
            $r['baromrelin'] ?? null,
            $r['dewPoint'] ?? null,
            $r['dailyrainin'] ?? null,
            $r['hourlyrainin'] ?? null,
            $r['date'] ?? date('c', $r['dateutc'] / 1000),
        ]);

        if ($stmt->rowCount() > 0) {
            $inserted++;
        }
    }

    logMsg("  Inserted $inserted new readings (skipped " . (count($readings) - $inserted) . " duplicates)");
}

logMsg("Done.");
