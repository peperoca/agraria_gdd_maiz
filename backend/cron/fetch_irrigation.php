<?php
/**
 * Cron: Fetch irrigation data from AgSense 365 reports
 *
 * Runs daily at 8:00 AM local (UTC-3) = 11:00 UTC
 * cPanel cron: 0 11 * * * /usr/local/bin/php /home/USER/public_html/gdd-api/cron/fetch_irrigation.php
 *
 * For each active equipment with a report_url:
 *   1. Find the last reading date (or default to 7 days ago)
 *   2. For each missing day up to yesterday (station local time):
 *      - Build URL by replacing date params in the template
 *      - Fetch HTML via cURL
 *      - Parse "Total Millimeters Applied: X.XX"
 *      - Upsert into irrigation_readings (source='api')
 *   3. Rate-limit: 1 second between requests
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

// Station timezone offset (UTC-3, no DST)
$tzOffset = -3;
$nowUtc = time();
$nowLocal = $nowUtc + ($tzOffset * 3600);
$yesterdayLocal = date('Y-m-d', $nowLocal - 86400);

echo "=== Irrigation Fetch: " . date('Y-m-d H:i:s') . " UTC ===\n";
echo "Station-local yesterday: $yesterdayLocal\n\n";

$db = getDB();

// Get all active equipment with a report URL
$stmt = $db->query("
    SELECT id, name, serial_number, report_url
    FROM irrigation_equipment
    WHERE is_active = 1 AND report_url IS NOT NULL AND report_url != ''
");
$equipment = $stmt->fetchAll();

if (empty($equipment)) {
    echo "No equipment with report URLs found.\n";
    exit(0);
}

echo "Found " . count($equipment) . " equipment with report URLs.\n\n";

$totalFetched = 0;
$totalErrors = 0;

foreach ($equipment as $equip) {
    $equipId = (int) $equip['id'];
    $equipName = $equip['name'];
    $serialNumber = $equip['serial_number'];
    $reportUrl = $equip['report_url'];

    echo "── Equipment: $equipName (serial: $serialNumber, id: $equipId) ──\n";

    // Find last reading date for this equipment
    $stmt = $db->prepare("SELECT MAX(date) AS last_date FROM irrigation_readings WHERE equipment_id = ?");
    $stmt->execute([$equipId]);
    $lastDate = $stmt->fetchColumn();

    if ($lastDate) {
        // Start from day after last reading
        $startDate = date('Y-m-d', strtotime($lastDate . ' +1 day'));
    } else {
        // Default: 7 days ago
        $startDate = date('Y-m-d', $nowLocal - (7 * 86400));
    }

    if ($startDate > $yesterdayLocal) {
        echo "  Already up to date (last: $lastDate)\n\n";
        continue;
    }

    echo "  Fetching from $startDate to $yesterdayLocal\n";

    // Iterate each day
    $current = $startDate;
    while ($current <= $yesterdayLocal) {
        $depthMm = fetch_agsense_day($reportUrl, $current);

        if ($depthMm !== null) {
            // Upsert reading
            $stmt = $db->prepare("
                INSERT INTO irrigation_readings (equipment_id, date, depth_mm, source)
                VALUES (?, ?, ?, 'api')
                ON DUPLICATE KEY UPDATE depth_mm = VALUES(depth_mm), source = 'api'
            ");
            $stmt->execute([$equipId, $current, $depthMm]);
            echo "  $current: {$depthMm} mm\n";
            $totalFetched++;
        } else {
            echo "  $current: FAILED to parse\n";
            $totalErrors++;
        }

        // Rate limit: 1 second between requests
        sleep(1);
        $current = date('Y-m-d', strtotime($current . ' +1 day'));
    }

    echo "\n";
}

echo "=== Done: $totalFetched readings fetched, $totalErrors errors ===\n";

// ── Helper functions ──

/**
 * Build an AgSense report URL for a specific date by replacing date parameters.
 */
function build_agsense_url(string $template, string $date): string {
    $d = new DateTime($date);
    $m = $d->format('m'); // zero-padded month
    $day = $d->format('d'); // zero-padded day
    $y = $d->format('Y');

    // Replace start date params
    $url = preg_replace('/start_m=\d+/', "start_m=$m", $template);
    $url = preg_replace('/start_d=\d+/', "start_d=$day", $url);
    $url = preg_replace('/start_y=\d+/', "start_y=$y", $url);

    // Replace stop date params
    $url = preg_replace('/stop_m=\d+/', "stop_m=$m", $url);
    $url = preg_replace('/stop_d=\d+/', "stop_d=$day", $url);
    $url = preg_replace('/stop_y=\d+/', "stop_y=$y", $url);

    return $url;
}

/**
 * Fetch a single day's irrigation depth from AgSense report.
 * Returns depth in mm, or null on failure.
 */
function fetch_agsense_day(string $template, string $date): ?float {
    $url = build_agsense_url($template, $date);

    $result = curl_fetch($url, 30);

    if ($result['status'] !== 200 || empty($result['body'])) {
        return null;
    }

    // Parse "Total Millimeters Applied: X.XX" from HTML
    if (preg_match('/Total Millimeters Applied:\s*([\d.]+)/', $result['body'], $matches)) {
        $value = (float) $matches[1];
        return round($value, 2);
    }

    // Also try "Total Inches Applied" and convert
    if (preg_match('/Total Inches Applied:\s*([\d.]+)/', $result['body'], $matches)) {
        $inches = (float) $matches[1];
        return round($inches * 25.4, 2);
    }

    return null;
}
