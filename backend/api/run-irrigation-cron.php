<?php
/**
 * Web trigger for irrigation cron
 * Usage: GET /api/run-irrigation-cron.php?key=YOUR_CRON_SECRET
 */

require_once __DIR__ . '/../config.php';

// Simple secret-key auth (same pattern as other cron triggers)
$key = $_GET['key'] ?? '';
if (!defined('CRON_SECRET') || $key !== CRON_SECRET) {
    http_response_code(403);
    echo "Forbidden\n";
    exit;
}

// Run the cron inline
require __DIR__ . '/../cron/fetch_irrigation.php';
