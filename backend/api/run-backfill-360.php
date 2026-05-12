<?php
/**
 * Backfill with page-count chunking for shared hosting without CLI.
 *
 * Usage:
 *   First run (starts from now, goes backwards):
 *     run-backfill-360.php?key=SECRET
 *
 *   Resume from where last run stopped (URL printed at the end):
 *     run-backfill-360.php?key=SECRET&endDate=EPOCH_MS
 *
 * Parameters:
 *   key     = secret key
 *   from    = target start date (YYYY-MM-DD), default 360 days ago
 *   endDate = epoch ms to resume from (printed by previous run)
 *   pages   = max pages per run (default 100, ~5 min at 3s/page)
 */

define('BACKFILL_SECRET', 'gdd-backfill-2026-valleychaco');

if (!isset($_GET['key']) || $_GET['key'] !== BACKFILL_SECRET) {
    http_response_code(403);
    die('Forbidden');
}

set_time_limit(0);
ini_set('max_execution_time', 0);
ini_set('memory_limit', '256M');

header('Content-Type: text/plain; charset=utf-8');
header('X-Accel-Buffering: no');
ob_implicit_flush(true);
if (ob_get_level()) ob_end_flush();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

$db = getDB();

$fromDate = $_GET['from'] ?? date('Y-m-d', strtotime('-360 days'));
$fromTs = strtotime($fromDate) * 1000;
$maxPages = intval($_GET['pages'] ?? 100);
$resumeEndDate = $_GET['endDate'] ?? null;

echo "=== Backfill ===\n";
echo "Target from: $fromDate\n";
echo "Max pages: $maxPages\n";
echo "Resume endDate: " . ($resumeEndDate ? $resumeEndDate . ' (' . date('Y-m-d H:i', $resumeEndDate / 1000) . ')' : 'none (starting from now)') . "\n";
echo "Server time: " . date('Y-m-d H:i:s') . "\n\n";
flush();

$stations = $db->query("SELECT id, mac, name, api_key, application_key FROM stations WHERE is_active = 1")->fetchAll();

if (empty($stations)) {
    echo "ERROR: No active stations found.\n";
    exit;
}

echo "Found " . count($stations) . " active station(s)\n\n";
flush();

foreach ($stations as $station) {
    echo "=== Station: {$station['name']} ({$station['mac']}) ===\n";
    flush();

    $totalInserted = 0;
    $totalUpdated = 0;
    $page = 0;
    $startTime = time();
    $reachedTarget = false;
    $lastOldestTs = null;

    // Use epoch ms for endDate — the Ambient Weather API expects this format
    $currentEndDateMs = $resumeEndDate ? intval($resumeEndDate) : null;

    while ($page < $maxPages) {
        $page++;
        $params = [
            'apiKey' => $station['api_key'],
            'applicationKey' => $station['application_key'],
            'limit' => 288,
        ];
        if ($currentEndDateMs) {
            $params['endDate'] = $currentEndDateMs;
        }

        $url = AMBIENT_API_URL . '/' . urlencode($station['mac']) . '?' . http_build_query($params);

        // Retry with backoff on rate limit
        $result = null;
        for ($retry = 0; $retry < 5; $retry++) {
            $result = curl_fetch($url);

            if ($result['status'] === 429) {
                $wait = pow(2, $retry) * 10;
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
            echo "  Body: " . substr($result['body'], 0, 200) . "\n";
            flush();
            break;
        }

        $readings = json_decode($result['body'], true);
        if (!is_array($readings) || empty($readings)) {
            echo "  No more readings on page $page — reached end of available API data\n";
            $reachedTarget = true;
            flush();
            break;
        }

        // Upsert readings
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
        $totalUpdated += $updated;
        $oldestTs = min(array_column($readings, 'dateutc'));
        $lastOldestTs = $oldestTs;
        $oldestDate = date('Y-m-d H:i', $oldestTs / 1000);
        $elapsed = time() - $startTime;
        echo "  Page $page: " . count($readings) . " readings, oldest: $oldestDate, new: $inserted, updated: $updated (elapsed: {$elapsed}s)\n";
        flush();

        // Check if we've reached the target date
        if ($oldestTs <= $fromTs) {
            echo "  Reached target date $fromDate\n";
            $reachedTarget = true;
            flush();
            break;
        }

        // Next page: 1ms before the oldest reading
        $currentEndDateMs = $oldestTs - 1;

        // Wait 3 seconds between requests
        sleep(3);
    }

    $elapsed = time() - $startTime;
    $count = $db->query("SELECT COUNT(*) FROM weather_readings")->fetchColumn();

    echo "\n  Summary for {$station['name']}:\n";
    echo "    New readings inserted: $totalInserted\n";
    echo "    Existing readings updated: $totalUpdated\n";
    echo "    Pages fetched: $page\n";
    echo "    Time elapsed: {$elapsed}s\n";
    echo "    Total readings in DB: $count\n\n";
    flush();

    // Print resume URL if we didn't finish
    if (!$reachedTarget && $lastOldestTs) {
        $baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http')
            . '://' . $_SERVER['HTTP_HOST'] . $_SERVER['SCRIPT_NAME'];
        $resumeUrl = $baseUrl . '?key=' . BACKFILL_SECRET
            . '&from=' . urlencode($fromDate)
            . '&endDate=' . $lastOldestTs
            . '&pages=' . $maxPages;

        echo "  *** NOT FINISHED — oldest data so far: " . date('Y-m-d', $lastOldestTs / 1000) . " ***\n";
        echo "  *** Copy and visit this URL to continue: ***\n\n";
        echo "  $resumeUrl\n\n";
    } else {
        echo "  *** COMPLETE — all available data has been fetched ***\n\n";
    }
    flush();
}

echo "=== Done ===\n";
echo "Finished at: " . date('Y-m-d H:i:s') . "\n";
