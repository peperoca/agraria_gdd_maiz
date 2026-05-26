<?php
/**
 * Debug: fetch one AgSense report and show the raw HTML response.
 * Usage: GET /api/debug-irrigation.php?key=CRON_SECRET&equipment_id=1&date=2026-05-25
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

$key = $_GET['key'] ?? '';
if (!defined('CRON_SECRET') || $key !== CRON_SECRET) {
    http_response_code(403);
    echo "Forbidden\n";
    exit;
}

$equipId = (int) ($_GET['equipment_id'] ?? 0);
$date = $_GET['date'] ?? date('Y-m-d', time() - 86400);

if (!$equipId) {
    echo "Provide equipment_id param\n";
    exit;
}

$db = getDB();
$stmt = $db->prepare("SELECT id, name, serial_number, report_url FROM irrigation_equipment WHERE id = ?");
$stmt->execute([$equipId]);
$equip = $stmt->fetch();

if (!$equip) {
    echo "Equipment not found\n";
    exit;
}

echo "Equipment: {$equip['name']} (serial: {$equip['serial_number']})\n";
echo "Date: $date\n\n";

$template = $equip['report_url'];

// Build URL
$d = new DateTime($date);
$m = $d->format('m');
$day = $d->format('d');
$y = $d->format('Y');

$url = preg_replace('/start_m=\d+/', "start_m=$m", $template);
$url = preg_replace('/start_d=\d+/', "start_d=$day", $url);
$url = preg_replace('/start_y=\d+/', "start_y=$y", $url);
$url = preg_replace('/stop_m=\d+/', "stop_m=$m", $url);
$url = preg_replace('/stop_d=\d+/', "stop_d=$day", $url);
$url = preg_replace('/stop_y=\d+/', "stop_y=$y", $url);

echo "URL: $url\n\n";

$result = curl_fetch($url, 30);

echo "HTTP Status: {$result['status']}\n";
if ($result['error']) {
    echo "cURL Error: {$result['error']}\n";
}
echo "Body length: " . strlen($result['body']) . " bytes\n\n";
echo "=== RAW HTML (first 3000 chars) ===\n";
echo substr($result['body'], 0, 3000) . "\n";
echo "\n=== END ===\n";

// Try to find any "millimeters" or "inches" or "applied" text
if (preg_match_all('/(Total|Applied|Millimeters|Inches|mm|applied)[^<]{0,100}/i', $result['body'], $matches)) {
    echo "\n=== MATCHED KEYWORDS ===\n";
    foreach ($matches[0] as $match) {
        echo "  $match\n";
    }
}
