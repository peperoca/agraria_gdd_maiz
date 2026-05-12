<?php
/**
 * One-time backfill script: Fetches historical weather data from Ambient Weather API.
 *
 * Usage (run from cPanel Terminal or SSH):
 *   php backfill.php 2026-04-01
 *
 * This fetches all data from the given date to now for all active stations.
 * Safe to run multiple times — duplicates are ignored.
 */

set_time_limit(0);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

$db = getDB();

$fromDate = $argv[1] ?? date('Y-m-d', strtotime('-60 days'));
$fromTs = strtotime($fromDate) * 1000;

echo "=== Backfill from $fromDate ===\n";

$stations = $db->query("SELECT id, mac, name, api_key, application_key FROM stations WHERE is_active = 1")->fetchAll();

foreach ($stations as $station) {
    echo "\nStation: {$station['name']} ({$station['mac']})\n";

    $endDate = null;
    $totalInserted = 0;
    $page = 0;

    while (true) {
        $page++;
        $params = [
            'apiKey' => $station['api_key'],
            'applicationKey' => $station['application_key'],
            'limit' => 288,
        ];
        if ($endDate) {
            $params['endDate'] = $endDate;
        }

        $url = AMBIENT_API_URL . '/' . urlencode($station['mac']) . '?' . http_build_query($params);

        // Retry with backoff on rate limit
        $result = null;
        for ($retry = 0; $retry < 5; $retry++) {
            $result = curl_fetch($url);

            if ($result['status'] === 429) {
                $wait = pow(2, $retry) * 3;
                echo "  Rate limited, waiting {$wait}s (retry " . ($retry + 1) . ")...\n";
                sleep($wait);
                continue;
            }
            break;
        }

        if ($result['status'] === 0) {
            echo "  ERROR on page $page: cURL error: {$result['error']}\n";
            break;
        }

        if ($result['status'] !== 200) {
            echo "  ERROR on page $page: HTTP {$result['status']}\n";
            break;
        }

        $readings = json_decode($result['body'], true);
        if (!is_array($readings) || empty($readings)) {
            echo "  No more readings on page $page\n";
            break;
        }

        $stmt = $db->prepare("
            INSERT INTO weather_readings
                (station_id, dateutc, tempf, humidity, windspeedmph, solarradiation, baromrelin, dewpoint, dailyrainin, hourlyrainin, date_iso)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                tempf = COALESCE(VALUES(tempf), tempf),
                humidity = COALESCE(VALUES(humidity), humidity),
                windspeedmph = COALESCE(VALUES(windspeedmph), windspeedmph),
                solarradiation = COALESCE(VALUES(solarradiation), solarradiation),
                baromrelin = COALESCE(VALUES(baromrelin), baromrelin),
                dewpoint = COALESCE(VALUES(dewpoint), dewpoint),
                dailyrainin = COALESCE(VALUES(dailyrainin), dailyrainin),
                hourlyrainin = COALESCE(VALUES(hourlyrainin), hourlyrainin)
        ");

        $inserted = 0;
        $updated = 0;
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
            $rows = $stmt->rowCount();
            if ($rows === 1) $inserted++;
            elseif ($rows === 2) $updated++;
        }

        $totalInserted += $inserted;
        $oldestTs = min(array_column($readings, 'dateutc'));
        $oldestDate = date('Y-m-d H:i', $oldestTs / 1000);
        echo "  Page $page: " . count($readings) . " readings, oldest: $oldestDate, new: $inserted, updated: $updated\n";

        if ($oldestTs <= $fromTs) {
            echo "  Reached target date $fromDate\n";
            break;
        }

        $endDate = date('c', ($oldestTs - 1) / 1000);
        sleep(2);
    }

    echo "  Total new readings inserted: $totalInserted\n";
}

echo "\n=== Backfill complete ===\n";
