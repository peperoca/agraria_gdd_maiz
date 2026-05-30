<?php
/**
 * GET    /api/field.php?id=N   - Get a single field
 * PUT    /api/field.php?id=N   - Update a field
 * DELETE /api/field.php?id=N   - Delete a field
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET', 'PUT', 'DELETE');

$user = authenticate();
$db = getDB();

$fieldId = (int) ($_GET['id'] ?? 0);
if ($fieldId <= 0) json_error('Field ID is required');

// Verify ownership
$stmt = $db->prepare("
    SELECT id, name, sowing_date AS sowingDate, station_mac AS stationMac,
           COALESCE(crop_type, 'corn') AS cropType, polygon,
           farm_id AS farmId, created_at AS createdAt,
           taw_mm AS tawMm, mad_pct AS madPct, taw_source AS tawSource,
           coneat_gc AS coneatGc, initial_asw_mm AS initialAswMm
    FROM fields
    WHERE id = ? AND user_id = ?
");
$stmt->execute([$fieldId, $user['id']]);
$field = $stmt->fetch();

if (!$field) json_error('Field not found', 404);
$field['id'] = (int) $field['id'];
$field['farmId'] = $field['farmId'] !== null ? (int) $field['farmId'] : null;
$field['polygon'] = $field['polygon'] ? json_decode($field['polygon'], true) : null;
$field['tawMm'] = $field['tawMm'] !== null ? (float) $field['tawMm'] : null;
$field['madPct'] = $field['madPct'] !== null ? (float) $field['madPct'] : null;
$field['initialAswMm'] = $field['initialAswMm'] !== null ? (float) $field['initialAswMm'] : null;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    json_response($field);
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $body = get_json_body();

    $name = trim($body['name'] ?? $field['name']);
    $sowingDate = $body['sowingDate'] ?? $field['sowingDate'];
    $cropType = $body['cropType'] ?? $field['cropType'];

    if (!$name) json_error('Field name is required');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $sowingDate)) json_error('Invalid sowing date format');
    $validCropTypes = [
        'corn', 'corn-short', 'corn-intermediate', 'corn-long',
        'soybean', 'soybean-short', 'soybean-intermediate', 'soybean-long',
        'wheat', 'wheat-short', 'wheat-intermediate', 'wheat-long',
        'rapeseed', 'rapeseed-short', 'rapeseed-intermediate', 'rapeseed-long',
    ];
    if (!in_array($cropType, $validCropTypes)) json_error('Invalid crop type');

    $polygon = array_key_exists('polygon', $body)
        ? ($body['polygon'] ? json_encode($body['polygon']) : null)
        : ($field['polygon'] ? json_encode($field['polygon']) : null);

    // Soil water balance columns
    $tawMm = array_key_exists('tawMm', $body) ? ($body['tawMm'] !== null ? (float) $body['tawMm'] : null) : $field['tawMm'];
    $madPct = array_key_exists('madPct', $body) ? ($body['madPct'] !== null ? (float) $body['madPct'] : null) : $field['madPct'];
    $tawSource = array_key_exists('tawSource', $body) ? $body['tawSource'] : $field['tawSource'];
    $coneatGc = array_key_exists('coneatGc', $body) ? $body['coneatGc'] : $field['coneatGc'];
    $initialAswMm = array_key_exists('initialAswMm', $body) ? ($body['initialAswMm'] !== null ? (float) $body['initialAswMm'] : null) : $field['initialAswMm'];

    // Validate tawSource
    if ($tawSource !== null && !in_array($tawSource, ['coneat_mm', 'coneat_apdn', 'manual'])) {
        $tawSource = null;
    }

    $stmt = $db->prepare("
        UPDATE fields
        SET name = ?, sowing_date = ?, crop_type = ?, polygon = ?,
            taw_mm = ?, mad_pct = ?, taw_source = ?, coneat_gc = ?, initial_asw_mm = ?
        WHERE id = ?
    ");
    $stmt->execute([$name, $sowingDate, $cropType, $polygon, $tawMm, $madPct, $tawSource, $coneatGc, $initialAswMm, $fieldId]);

    json_response([
        'id' => $fieldId,
        'name' => $name,
        'sowingDate' => $sowingDate,
        'cropType' => $cropType,
        'polygon' => $polygon ? json_decode($polygon, true) : null,
        'stationMac' => $field['stationMac'],
        'farmId' => $field['farmId'],
        'createdAt' => $field['createdAt'],
        'tawMm' => $tawMm,
        'madPct' => $madPct,
        'tawSource' => $tawSource,
        'coneatGc' => $coneatGc,
        'initialAswMm' => $initialAswMm,
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $stmt = $db->prepare("DELETE FROM fields WHERE id = ? AND user_id = ?");
    $stmt->execute([$fieldId, $user['id']]);
    json_response(['success' => true]);
}
