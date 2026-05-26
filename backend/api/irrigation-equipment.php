<?php
/**
 * Irrigation Equipment CRUD
 * GET    ?farm_id=N          → list equipment for a farm
 * POST                       → create equipment
 * PUT    ?id=N               → update equipment
 * DELETE ?id=N               → deactivate equipment (soft delete)
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
$user = authenticate();
$db = getDB();

$method = $_SERVER['REQUEST_METHOD'];

// ── GET: list equipment for a farm ──
if ($method === 'GET') {
    $farmId = (int) ($_GET['farm_id'] ?? 0);
    if (!$farmId) json_error('farm_id is required');

    // Verify user owns the farm
    $stmt = $db->prepare("SELECT id FROM farms WHERE id = ? AND user_id = ?");
    $stmt->execute([$farmId, $user['id']]);
    if (!$stmt->fetch()) json_error('Farm not found', 404);

    $stmt = $db->prepare("
        SELECT id, farm_id, name, serial_number, report_url, area_ha, type, is_active, created_at
        FROM irrigation_equipment
        WHERE farm_id = ? AND is_active = 1
        ORDER BY name
    ");
    $stmt->execute([$farmId]);
    json_response($stmt->fetchAll());
}

// ── POST: create equipment ──
if ($method === 'POST') {
    $body = get_json_body();
    $farmId = (int) ($body['farm_id'] ?? 0);
    $name = trim($body['name'] ?? '');
    $serialNumber = trim($body['serial_number'] ?? '');
    $reportUrl = trim($body['report_url'] ?? '');
    $areaHa = isset($body['area_ha']) && $body['area_ha'] !== '' ? (float) $body['area_ha'] : null;
    $type = $body['type'] ?? 'pivot';

    if (!$farmId) json_error('farm_id is required');
    if (!$name) json_error('name is required');

    // Verify user owns the farm
    $stmt = $db->prepare("SELECT id FROM farms WHERE id = ? AND user_id = ?");
    $stmt->execute([$farmId, $user['id']]);
    if (!$stmt->fetch()) json_error('Farm not found', 404);

    $validTypes = ['pivot', 'drip', 'sprinkler', 'flood', 'other'];
    if (!in_array($type, $validTypes)) $type = 'other';

    $stmt = $db->prepare("
        INSERT INTO irrigation_equipment (farm_id, name, serial_number, report_url, area_ha, type)
        VALUES (?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([$farmId, $name, $serialNumber ?: null, $reportUrl ?: null, $areaHa, $type]);

    $id = (int) $db->lastInsertId();
    $stmt = $db->prepare("SELECT id, farm_id, name, serial_number, report_url, area_ha, type, is_active, created_at FROM irrigation_equipment WHERE id = ?");
    $stmt->execute([$id]);
    json_response($stmt->fetch(), 201);
}

// ── PUT: update equipment ──
if ($method === 'PUT') {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) json_error('id is required');

    // Verify ownership via farm
    $stmt = $db->prepare("
        SELECT ie.id FROM irrigation_equipment ie
        JOIN farms f ON f.id = ie.farm_id
        WHERE ie.id = ? AND f.user_id = ?
    ");
    $stmt->execute([$id, $user['id']]);
    if (!$stmt->fetch()) json_error('Equipment not found', 404);

    $body = get_json_body();
    $sets = [];
    $params = [];

    if (isset($body['name'])) {
        $sets[] = "name = ?";
        $params[] = trim($body['name']);
    }
    if (isset($body['serial_number'])) {
        $sets[] = "serial_number = ?";
        $params[] = trim($body['serial_number']) ?: null;
    }
    if (isset($body['report_url'])) {
        $sets[] = "report_url = ?";
        $params[] = trim($body['report_url']) ?: null;
    }
    if (array_key_exists('area_ha', $body)) {
        $sets[] = "area_ha = ?";
        $params[] = ($body['area_ha'] !== null && $body['area_ha'] !== '') ? (float) $body['area_ha'] : null;
    }
    if (isset($body['type'])) {
        $validTypes = ['pivot', 'drip', 'sprinkler', 'flood', 'other'];
        $sets[] = "type = ?";
        $params[] = in_array($body['type'], $validTypes) ? $body['type'] : 'other';
    }

    if (empty($sets)) json_error('No fields to update');

    $params[] = $id;
    $stmt = $db->prepare("UPDATE irrigation_equipment SET " . implode(', ', $sets) . " WHERE id = ?");
    $stmt->execute($params);

    $stmt = $db->prepare("SELECT id, farm_id, name, serial_number, report_url, area_ha, type, is_active, created_at FROM irrigation_equipment WHERE id = ?");
    $stmt->execute([$id]);
    json_response($stmt->fetch());
}

// ── DELETE: soft-deactivate equipment ──
if ($method === 'DELETE') {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) json_error('id is required');

    $stmt = $db->prepare("
        SELECT ie.id FROM irrigation_equipment ie
        JOIN farms f ON f.id = ie.farm_id
        WHERE ie.id = ? AND f.user_id = ?
    ");
    $stmt->execute([$id, $user['id']]);
    if (!$stmt->fetch()) json_error('Equipment not found', 404);

    $stmt = $db->prepare("UPDATE irrigation_equipment SET is_active = 0 WHERE id = ?");
    $stmt->execute([$id]);
    json_response(['success' => true]);
}

json_error('Method not allowed', 405);
