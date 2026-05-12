<?php
/**
 * Web-accessible backfill trigger
 *
 * Usage (visit in browser):
 *   https://www.valleychaco.com.py/gdd-api/api/run-backfill.php?key=YOUR_SECRET&from=2026-04-01
 *
 * Parameters:
 *   key  = secret key (must match BACKFILL_SECRET below)
 *   from = start date (YYYY-MM-DD), defaults to 60 days ago
 */

// ===== CHANGE THIS SECRET KEY =====
define('BACKFILL_SECRET', 'gdd-backfill-2026-valleychaco');

// Validate secret key
if (!isset($_GET['key']) || $_GET['key'] !== BACKFILL_SECRET) {
    http_response_code(403);
    die('Forbidden');
}

// Allow long execution
set_time_limit(0);
ini_set('max_execution_time', 0);

// Output as plain text so browser shows progress in real-time
header('Content-Type: text/plain; charset=utf-8');
header('X-Accel-Buffering: no');
ob_implicit_flush(true);
if (ob_get_level()) ob_end_flush();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

$db = getDB();

// Get target date
$fromDate = $_GET['from'] ?? date('Y-m-d', strtotime('-60 days'));
$fromTs = strtotime($fromDate) * 1000;

echo "=== Backfill from $fromDate ===\n";
echo "Server time: " . date('Y-m-d H:i:s') . "\n";
echo "cURL available: " . (function_exists('curl_init') ? 'YES' : 'NO') . "\n\n";
flush();

// Fetch all active stations
$stations = $db->query("SELECT id, mac, name, api_key, application_key FROM stations WHERE is_active = 1")->fetchAll();

if (empty($stations)) {
    echo "ERROR: No active stations found.\n";
    exit;
}

echo "Found " . count($stations) . " active station(s)\n\n";
flush();

foreach ($stations as $station) {
    echo "Station: {$station['name']} ({$station['mac']})\n";
    flush();

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
                flush();
                sleep($wait);
                continue;
            }
            break;
        }

        if ($result['status'] === 0) {
            echo "  ERROR on page $page: cURL error: {$result['error']}\n";
            flush();
            break;
        }

        if ($result['status'] !== 200) {
            echo "  ERROR on page $page: HTTP {$result['status']}\n";
            flush();
            break;
        }

        $readings = json_decode($result['body'], true);
        if (!is_array($readings) || empty($readings)) {
            echo "  No more readings on page $page\n";
            flush();
            break;
        }

        // Insert readings
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
            if ($stmt->rowCount() > 0) $inserted++;
        }

        $totalInserted += $inserted;
        $oldestTs = min(array_column($readings, 'dateutc'));
        $oldestDate = date('Y-m-d H:i', $oldestTs / 1000);
        echo "  Page $page: " . count($readings) . " readings, oldest: $oldestDate, inserted: $inserted\n";
        flush();

        // Check if we've reached the target date
        if ($oldestTs <= $fromTs) {
            echo "  Reached target date $fromDate\n";
            flush();
            break;
        }

        // Set endDate for next page
        $endDate = date('c', ($oldestTs - 1) / 1000);

        // Wait 2 seconds between requests to avoid rate limits
        sleep(2);
    }

    echo "  Total new readings inserted: $totalInserted\n\n";
    flush();
}

echo "=== Backfill complete ===\n";
echo "Finished at: " . date('Y-m-d H:i:s') . "\n";
