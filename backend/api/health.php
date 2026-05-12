<?php
/**
 * GET /api/health.php
 * Public endpoint to verify the API is running and DB is connected
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();

try {
    $db = getDB();
    $stmt = $db->query("SELECT COUNT(*) as count FROM stations WHERE is_active = 1");
    $row = $stmt->fetch();

    $stmtReadings = $db->query("SELECT COUNT(*) as count FROM weather_readings");
    $readings = $stmtReadings->fetch();

    json_response([
        'status' => 'ok',
        'stations' => (int) $row['count'],
        'totalReadings' => (int) $readings['count'],
        'serverTime' => date('c'),
        'phpVersion' => PHP_VERSION,
    ]);
} catch (Exception $e) {
    json_response([
        'status' => 'error',
        'message' => 'Database connection failed',
    ], 500);
}
