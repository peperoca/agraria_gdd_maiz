<?php
/**
 * GET  /api/fields.php            - List all fields for authenticated user
 * GET  /api/fields.php?farm_id=N  - List fields for a specific farm
 * POST /api/fields.php            - Create a new field
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET', 'POST');

$user = authenticate();
$db = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $farmId = isset($_GET['farm_id']) ? (int) $_GET['farm_id'] : null;

    if ($farmId) {
        // Verify read access to farm (owner, shared, or admin)
        if (!can_read_farm($db, $farmId, $user)) json_error('Farm not found', 404);

        $stmt = $db->prepare("
            SELECT f.id, f.name,
                   COALESCE(s.sowing_date, f.sowing_date) AS sowingDate,
                   COALESCE(s.crop_type, f.crop_type, 'corn') AS cropType,
                   f.polygon,
                   f.station_mac AS stationMac, f.farm_id AS farmId,
                   f.created_at AS createdAt,
                   f.taw_mm AS tawMm, f.mad_pct AS madPct,
                   f.taw_source AS tawSource, f.coneat_gc AS coneatGc,
                   f.initial_asw_mm AS initialAswMm,
                   s.id AS seasonId, s.is_active AS seasonIsActive,
                   s.end_date AS seasonEndDate
            FROM fields f
            LEFT JOIN seasons s ON s.field_id = f.id AND s.is_active = 1
            WHERE f.farm_id = ?
            ORDER BY f.created_at DESC
        ");
        $stmt->execute([$farmId]);
    } else {
        // All fields the user can see: owned + from shared farms + directly shared fields
        if ($user['role'] === 'admin') {
            $stmt = $db->query("
                SELECT f.id, f.name, f.sowing_date AS sowingDate,
                       COALESCE(f.crop_type, 'corn') AS cropType,
                       f.polygon,
                       f.station_mac AS stationMac, f.farm_id AS farmId,
                       f.created_at AS createdAt
                FROM fields f
            LEFT JOIN seasons s ON s.field_id = f.id AND s.is_active = 1
                ORDER BY f.created_at DESC
            ");
        } else {
            $stmt = $db->prepare("
                SELECT f.id, f.name, f.sowing_date AS sowingDate,
                       COALESCE(f.crop_type, 'corn') AS cropType,
                       f.polygon,
                       f.station_mac AS stationMac, f.farm_id AS farmId,
                       f.created_at AS createdAt
                FROM fields f
            LEFT JOIN seasons s ON s.field_id = f.id AND s.is_active = 1
                WHERE f.user_id = ?
                UNION
                SELECT f.id, f.name, f.sowing_date AS sowingDate,
                       COALESCE(f.crop_type, 'corn') AS cropType,
                       f.polygon,
                       f.station_mac AS stationMac, f.farm_id AS farmId,
                       f.created_at AS createdAt
                FROM fields f
            LEFT JOIN seasons s ON s.field_id = f.id AND s.is_active = 1
                JOIN shares sh ON sh.entity_type = 'farm' AND sh.entity_id = f.farm_id AND sh.shared_with_id = ?
                UNION
                SELECT f.id, f.name, f.sowing_date AS sowingDate,
                       COALESCE(f.crop_type, 'corn') AS cropType,
                       f.polygon,
                       f.station_mac AS stationMac, f.farm_id AS farmId,
                       f.created_at AS createdAt
                FROM fields f
            LEFT JOIN seasons s ON s.field_id = f.id AND s.is_active = 1
                JOIN shares sh ON sh.entity_type = 'field' AND sh.entity_id = f.id AND sh.shared_with_id = ?
                ORDER BY createdAt DESC
            ");
            $stmt->execute([$user['id'], $user['id'], $user['id']]);
        }
    }

    $fields = $stmt->fetchAll();
    foreach ($fields as &$f) {
        $f['id'] = (int) $f['id'];
        $f['farmId'] = $f['farmId'] !== null ? (int) $f['farmId'] : null;
        $f['polygon'] = $f['polygon'] ? json_decode($f['polygon'], true) : null;
        $f['tawMm'] = $f['tawMm'] !== null ? (float) $f['tawMm'] : null;
        $f['madPct'] = $f['madPct'] !== null ? (float) $f['madPct'] : null;
        $f['initialAswMm'] = $f['initialAswMm'] !== null ? (float) $f['initialAswMm'] : null;
        $f['seasonId'] = $f['seasonId'] !== null ? (int) $f['seasonId'] : null;
        $f['seasonIsActive'] = isset($f['seasonIsActive']) ? (bool) $f['seasonIsActive'] : null;
        unset($f['seasonEndDate']); // Clean up — not needed in list view
    }

    json_response($fields);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = get_json_body();

    $name = trim($body['name'] ?? '');
    $sowingDate = $body['sowingDate'] ?? '';
    $stationMac = $body['stationMac'] ?? '';
    $cropType = $body['cropType'] ?? 'corn';
    $farmId = isset($body['farmId']) ? (int) $body['farmId'] : null;
    $polygon = isset($body['polygon']) && $body['polygon'] ? json_encode($body['polygon']) : null;

    if (!$name) json_error('Field name is required');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $sowingDate)) json_error('Invalid sowing date format (use YYYY-MM-DD)');
    $validCropTypes = [
        'corn', 'corn-short', 'corn-intermediate', 'corn-long',
        'soybean', 'soybean-short', 'soybean-intermediate', 'soybean-long',
        'wheat', 'wheat-short', 'wheat-intermediate', 'wheat-long',
        'rapeseed', 'rapeseed-short', 'rapeseed-intermediate', 'rapeseed-long',
    ];
    if (!in_array($cropType, $validCropTypes)) json_error('Invalid crop type');

    // If farmId given, verify ownership and get station from farm
    if ($farmId) {
        $fCheck = $db->prepare("SELECT f.id, s.mac FROM farms f LEFT JOIN stations s ON s.id = f.station_id WHERE f.id = ? AND f.user_id = ?");
        $fCheck->execute([$farmId, $user['id']]);
        $farmRow = $fCheck->fetch();
        if (!$farmRow) json_error('Farm not found', 404);
        if (!$stationMac && $farmRow['mac']) {
            $stationMac = $farmRow['mac'];
        }
    }

    if (!$stationMac) json_error('No station available. Create a farm with a location first.');

    // Soil water balance columns (optional on create)
    $tawMm = isset($body['tawMm']) ? (float) $body['tawMm'] : null;
    $madPct = isset($body['madPct']) ? (float) $body['madPct'] : null;
    $tawSource = $body['tawSource'] ?? null;
    $coneatGc = $body['coneatGc'] ?? null;
    $initialAswMm = isset($body['initialAswMm']) ? (float) $body['initialAswMm'] : null;

    if ($tawSource !== null && !in_array($tawSource, ['coneat_mm', 'coneat_apdn', 'manual'])) {
        $tawSource = null;
    }

    $stmt = $db->prepare("
        INSERT INTO fields (user_id, name, sowing_date, station_mac, crop_type, farm_id, polygon,
                            taw_mm, mad_pct, taw_source, coneat_gc, initial_asw_mm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([$user['id'], $name, $sowingDate, $stationMac, $cropType, $farmId, $polygon,
                    $tawMm, $madPct, $tawSource, $coneatGc, $initialAswMm]);
    $fieldId = (int) $db->lastInsertId();

    json_response([
        'id' => $fieldId,
        'name' => $name,
        'sowingDate' => $sowingDate,
        'cropType' => $cropType,
        'stationMac' => $stationMac,
        'polygon' => $polygon ? json_decode($polygon, true) : null,
        'farmId' => $farmId,
        'createdAt' => date('Y-m-d H:i:s'),
        'tawMm' => $tawMm,
        'madPct' => $madPct,
        'tawSource' => $tawSource,
        'coneatGc' => $coneatGc,
        'initialAswMm' => $initialAswMm,
    ], 201);
}
