<?php
/**
 * Web trigger for NDVI fetch cron
 * Usage: GET /api/run-ndvi-cron.php?key=YOUR_SECRET_KEY
 */

require_once __DIR__ . '/../config.php';

// Simple secret key check
$key = $_GET['key'] ?? '';
if (!defined('CRON_SECRET') || $key !== CRON_SECRET) {
    http_response_code(403);
    echo "Forbidden\n";
    exit;
}

header('Content-Type: text/plain');

// Run the NDVI cron
require __DIR__ . '/../cron/fetch_ndvi.php';
