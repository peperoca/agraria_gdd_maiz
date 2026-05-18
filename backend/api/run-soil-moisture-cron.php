<?php
/**
 * Web trigger for Soil Moisture fetch cron
 * Usage: GET /api/run-soil-moisture-cron.php?key=YOUR_SECRET_KEY
 */

require_once __DIR__ . '/../config.php';

$key = $_GET['key'] ?? '';
if (!defined('CRON_SECRET') || $key !== CRON_SECRET) {
    http_response_code(403);
    echo "Forbidden\n";
    exit;
}

header('Content-Type: text/plain');

require __DIR__ . '/../cron/fetch_soil_moisture.php';
