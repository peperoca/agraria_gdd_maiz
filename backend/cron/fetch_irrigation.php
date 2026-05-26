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
    SELECT id, name, serial_number, report_url, area_ha
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
    $areaHa = $equip['area_ha'] ? (float) $equip['area_ha'] : null;

    echo "── Equipment: $equipName (serial: $serialNumber, id: $equipId, area: " . ($areaHa ? "{$areaHa} ha" : "NOT SET") . ") ──\n";

    if (!$areaHa) {
        echo "  SKIPPED — area_ha not set. Cannot compute average mm/ha.\n\n";
        continue;
    }

    // Find last reading date for this equipment
    $stmt = $db->prepare("SELECT MAX(date) AS last_date FROM irrigation_readings WHERE equipment_id = ?");
    $stmt->execute([$equipId]);
    $lastDate = $stmt->fetchColumn();

    if ($lastDate) {
        // Start from day after last reading
        $startDate = date('Y-m-d', strtotime($lastDate . ' +1 day'));
    } else {
        // No readings yet — go back to the earliest assignment start date for this equipment
        $stmt = $db->prepare("SELECT MIN(start_date) FROM irrigation_assignments WHERE equipment_id = ?");
        $stmt->execute([$equipId]);
        $earliestAssignment = $stmt->fetchColumn();

        if ($earliestAssignment) {
            $startDate = $earliestAssignment;
        } else {
            // No assignments either — default to 7 days ago
            $startDate = date('Y-m-d', $nowLocal - (7 * 86400));
        }
    }

    if ($startDate > $yesterdayLocal) {
        echo "  Already up to date (last: $lastDate)\n\n";
        continue;
    }

    echo "  Fetching from $startDate to $yesterdayLocal\n";

    // Iterate each day
    $current = $startDate;
    while ($current <= $yesterdayLocal) {
        $depthMm = fetch_agsense_day($reportUrl, $current, $areaHa);

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
 * Returns average depth in mm (= total m³ / 10 / area_ha), or null on failure.
 *
 * AgSense reports "Total Cubic Meters Pumped" which is the raw volume.
 * To get average mm applied over the whole irrigated area:
 *   mm = m³ / (area_ha × 10)
 *   (because 1 m³ over 1 ha = 0.1 mm)
 *
 * Parsing strategies for "Total Cubic Meters Pumped":
 * 1. Label/value div: <div ...>Total Cubic Meters Pumped:</div> <div ...>123 cubic meters</div>
 * 2. Table footer: <th id="footcol_6">123</th> (column 6 = Total Cubic Meters)
 */
function fetch_agsense_day(string $template, string $date, float $areaHa): ?float {
    $url = build_agsense_url($template, $date);

    $result = curl_fetch($url, 30);

    if ($result['status'] !== 200 || empty($result['body'])) {
        return null;
    }

    $html = $result['body'];
    $cubicMeters = null;

    // Strategy 1: Label/value div pattern — "Total Cubic Meters Pumped:"
    if (preg_match('/Total Cubic Meters Pumped:<\/div>\s*<div[^>]*>\s*([\d,.]+)\s*cubic meters/s', $html, $matches)) {
        $cubicMeters = (float) str_replace(',', '', $matches[1]);
    }

    // Strategy 2: Table footer — Total Cubic Meters is column 6
    if ($cubicMeters === null && preg_match('/id="footcol_6"[^>]*>([\d,.]+)</', $html, $matches)) {
        $cubicMeters = (float) str_replace(',', '', $matches[1]);
    }

    // Strategy 3: Inline block div pattern (PDF section)
    if ($cubicMeters === null && preg_match('/Total Cubic Meters Pumped:.*?<div[^>]*>([\d,.]+)\s*cubic meters/s', $html, $matches)) {
        $cubicMeters = (float) str_replace(',', '', $matches[1]);
    }

    if ($cubicMeters === null) {
        return null;
    }

    // Convert: mm = m³ / 10 / area_ha
    $depthMm = $cubicMeters / 10.0 / $areaHa;
    return round($depthMm, 2);
}
