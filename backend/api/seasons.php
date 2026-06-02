<?php
/**
 * Crop Seasons API — multiple seasons per physical field
 *
 * GET    ?field_id=N        → list all seasons for a field (newest first)
 * POST                      → create new season {field_id, crop_type, sowing_date}
 * PUT    ?id=N              → update season
 * DELETE ?id=N              → delete season
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET', 'POST', 'PUT', 'DELETE');

$user = authenticate();
$db = getDB();

// ── GET: list seasons ──
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $fieldId = (int) ($_GET['field_id'] ?? 0);
    if ($fieldId <= 0) json_error('field_id is required');

    $stmt = $db->prepare("
        SELECT id, field_id AS fieldId, crop_type AS cropType,
               sowing_date AS sowingDate, end_date AS endDate,
               is_active AS isActive, initial_asw_mm AS initialAswMm,
               created_at AS createdAt
        FROM seasons
        WHERE field_id = ?
        ORDER BY sowing_date DESC
    ");
    $stmt->execute([$fieldId]);
    $rows = $stmt->fetchAll();

    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
        $r['fieldId'] = (int) $r['fieldId'];
        $r['isActive'] = (bool) $r['isActive'];
        $r['initialAswMm'] = $r['initialAswMm'] !== null ? (float) $r['initialAswMm'] : null;
    }

    json_response($rows);
}

// ── POST: create new season ──
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = get_json_body();

    $fieldId = (int) ($body['field_id'] ?? 0);
    $cropType = trim($body['crop_type'] ?? 'corn');
    $sowingDate = trim($body['sowing_date'] ?? '');

    if ($fieldId <= 0) json_error('field_id is required');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $sowingDate)) json_error('sowing_date must be YYYY-MM-DD');

    $validCropTypes = [
        'corn', 'corn-short', 'corn-intermediate', 'corn-long',
        'soybean', 'soybean-short', 'soybean-intermediate', 'soybean-long',
        'wheat', 'wheat-short', 'wheat-intermediate', 'wheat-long',
        'rapeseed', 'rapeseed-short', 'rapeseed-intermediate', 'rapeseed-long',
    ];
    if (!in_array($cropType, $validCropTypes)) json_error('Invalid crop type');

    // Verify field ownership
    $stmt = $db->prepare("SELECT id FROM fields WHERE id = ? AND user_id = ?");
    $stmt->execute([$fieldId, $user['id']]);
    if (!$stmt->fetch()) json_error('Field not found', 404);

    // Deactivate previous active season(s) for this field
    $prevEndDate = date('Y-m-d', strtotime($sowingDate . ' -1 day'));
    $stmt = $db->prepare("
        UPDATE seasons
        SET is_active = 0, end_date = COALESCE(end_date, ?)
        WHERE field_id = ? AND is_active = 1
    ");
    $stmt->execute([$prevEndDate, $fieldId]);

    // Accept optional initial ASW (rolled over from previous season)
    $initialAswMm = isset($body['initial_asw_mm']) ? (float) $body['initial_asw_mm'] : null;

    // Create new season
    $stmt = $db->prepare("
        INSERT INTO seasons (field_id, crop_type, sowing_date, is_active, initial_asw_mm)
        VALUES (?, ?, ?, 1, ?)
    ");
    $stmt->execute([$fieldId, $cropType, $sowingDate, $initialAswMm]);
    $seasonId = (int) $db->lastInsertId();

    // Also update legacy fields columns for backward compat
    $stmt = $db->prepare("UPDATE fields SET crop_type = ?, sowing_date = ? WHERE id = ?");
    $stmt->execute([$cropType, $sowingDate, $fieldId]);

    json_response([
        'id' => $seasonId,
        'fieldId' => $fieldId,
        'cropType' => $cropType,
        'sowingDate' => $sowingDate,
        'endDate' => null,
        'isActive' => true,
        'initialAswMm' => $initialAswMm,
        'createdAt' => date('Y-m-d H:i:s'),
    ], 201);
}

// ── PUT: update season ──
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $seasonId = (int) ($_GET['id'] ?? 0);
    if ($seasonId <= 0) json_error('Season ID is required');

    $body = get_json_body();

    // Verify ownership via field
    $stmt = $db->prepare("
        SELECT s.id, s.field_id FROM seasons s
        JOIN fields f ON f.id = s.field_id
        WHERE s.id = ? AND f.user_id = ?
    ");
    $stmt->execute([$seasonId, $user['id']]);
    if (!$stmt->fetch()) json_error('Season not found', 404);

    $sets = [];
    $params = [];

    if (isset($body['crop_type'])) {
        $sets[] = 'crop_type = ?';
        $params[] = $body['crop_type'];
    }
    if (isset($body['sowing_date'])) {
        $sets[] = 'sowing_date = ?';
        $params[] = $body['sowing_date'];
    }
    if (array_key_exists('end_date', $body)) {
        $sets[] = 'end_date = ?';
        $params[] = $body['end_date'];
    }
    if (isset($body['is_active'])) {
        $sets[] = 'is_active = ?';
        $params[] = $body['is_active'] ? 1 : 0;
    }
    if (array_key_exists('initial_asw_mm', $body)) {
        $sets[] = 'initial_asw_mm = ?';
        $params[] = $body['initial_asw_mm'] !== null ? (float) $body['initial_asw_mm'] : null;
    }

    if (empty($sets)) json_error('No fields to update');

    $params[] = $seasonId;
    $stmt = $db->prepare("UPDATE seasons SET " . implode(', ', $sets) . " WHERE id = ?");
    $stmt->execute($params);

    json_response(['success' => true]);
}

// ── DELETE: remove season ──
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $seasonId = (int) ($_GET['id'] ?? 0);
    if ($seasonId <= 0) json_error('Season ID is required');

    $stmt = $db->prepare("
        SELECT s.id FROM seasons s
        JOIN fields f ON f.id = s.field_id
        WHERE s.id = ? AND f.user_id = ?
    ");
    $stmt->execute([$seasonId, $user['id']]);
    if (!$stmt->fetch()) json_error('Season not found', 404);

    $stmt = $db->prepare("DELETE FROM seasons WHERE id = ?");
    $stmt->execute([$seasonId]);

    json_response(['success' => true]);
}
