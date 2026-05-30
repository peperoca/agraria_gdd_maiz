<?php
/**
 * Manual overrides for daily rain and irrigation per field.
 *
 * GET    ?field_id=N          → list all overrides for a field
 * POST                        → upsert override {field_id, date, rain_mm?, irrigation_mm?}
 * DELETE ?field_id=N&date=D   → remove override for a specific date
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET', 'POST', 'DELETE');

$user = authenticate();
$db = getDB();

// ── GET: list overrides ──
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $fieldId = (int) ($_GET['field_id'] ?? 0);
    if ($fieldId <= 0) json_error('field_id is required');

    $stmt = $db->prepare("
        SELECT date, rain_mm, irrigation_mm
        FROM field_daily_overrides
        WHERE field_id = ?
        ORDER BY date ASC
    ");
    $stmt->execute([$fieldId]);
    $rows = $stmt->fetchAll();

    foreach ($rows as &$r) {
        $r['rain_mm'] = $r['rain_mm'] !== null ? (float) $r['rain_mm'] : null;
        $r['irrigation_mm'] = $r['irrigation_mm'] !== null ? (float) $r['irrigation_mm'] : null;
    }

    json_response($rows);
}

// ── POST: upsert override ──
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = get_json_body();

    $fieldId = (int) ($body['field_id'] ?? 0);
    $date = trim($body['date'] ?? '');
    $rainMm = array_key_exists('rain_mm', $body) ? $body['rain_mm'] : null;
    $irrigMm = array_key_exists('irrigation_mm', $body) ? $body['irrigation_mm'] : null;

    if ($fieldId <= 0) json_error('field_id is required');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) json_error('date must be YYYY-MM-DD');

    // Cast to float or null
    $rainMm = $rainMm !== null && $rainMm !== '' ? (float) $rainMm : null;
    $irrigMm = $irrigMm !== null && $irrigMm !== '' ? (float) $irrigMm : null;

    // If both null, delete the override instead
    if ($rainMm === null && $irrigMm === null) {
        $stmt = $db->prepare("DELETE FROM field_daily_overrides WHERE field_id = ? AND date = ?");
        $stmt->execute([$fieldId, $date]);
        json_response(['success' => true, 'action' => 'deleted']);
    }

    $stmt = $db->prepare("
        INSERT INTO field_daily_overrides (field_id, date, rain_mm, irrigation_mm)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            rain_mm = VALUES(rain_mm),
            irrigation_mm = VALUES(irrigation_mm)
    ");
    $stmt->execute([$fieldId, $date, $rainMm, $irrigMm]);

    json_response([
        'success' => true,
        'action' => 'upserted',
        'date' => $date,
        'rain_mm' => $rainMm,
        'irrigation_mm' => $irrigMm,
    ]);
}

// ── DELETE: remove override ──
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $fieldId = (int) ($_GET['field_id'] ?? 0);
    $date = trim($_GET['date'] ?? '');

    if ($fieldId <= 0) json_error('field_id is required');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) json_error('date must be YYYY-MM-DD');

    $stmt = $db->prepare("DELETE FROM field_daily_overrides WHERE field_id = ? AND date = ?");
    $stmt->execute([$fieldId, $date]);

    json_response(['success' => true]);
}
