<?php
/**
 * Irrigation Assignments CRUD
 * GET    ?equipment_id=N  or  ?field_id=N  → list assignments
 * POST                                      → create assignment (auto-closes previous)
 * PUT    ?id=N                              → update assignment dates
 * DELETE ?id=N                              → remove assignment
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
$user = authenticate();
$db = getDB();

$method = $_SERVER['REQUEST_METHOD'];

// Helper: verify user owns equipment (via farm)
function verify_equipment_owner(PDO $db, int $equipmentId, int $userId): bool {
    $stmt = $db->prepare("
        SELECT ie.id FROM irrigation_equipment ie
        JOIN farms f ON f.id = ie.farm_id
        WHERE ie.id = ? AND f.user_id = ?
    ");
    $stmt->execute([$equipmentId, $userId]);
    return (bool) $stmt->fetch();
}

// Helper: verify user owns field (via farm)
function verify_field_owner(PDO $db, int $fieldId, int $userId): bool {
    $stmt = $db->prepare("
        SELECT fi.id FROM fields fi
        JOIN farms f ON f.id = fi.farm_id
        WHERE fi.id = ? AND f.user_id = ?
    ");
    $stmt->execute([$fieldId, $userId]);
    return (bool) $stmt->fetch();
}

// ── GET: list assignments ──
if ($method === 'GET') {
    $equipmentId = (int) ($_GET['equipment_id'] ?? 0);
    $fieldId = (int) ($_GET['field_id'] ?? 0);

    if ($equipmentId) {
        if (!verify_equipment_owner($db, $equipmentId, $user['id'])) json_error('Equipment not found', 404);

        $stmt = $db->prepare("
            SELECT ia.id, ia.equipment_id, ia.field_id, ia.start_date, ia.end_date, ia.created_at,
                   fi.name AS field_name
            FROM irrigation_assignments ia
            JOIN fields fi ON fi.id = ia.field_id
            WHERE ia.equipment_id = ?
            ORDER BY ia.start_date DESC
        ");
        $stmt->execute([$equipmentId]);
    } elseif ($fieldId) {
        if (!verify_field_owner($db, $fieldId, $user['id'])) json_error('Field not found', 404);

        $stmt = $db->prepare("
            SELECT ia.id, ia.equipment_id, ia.field_id, ia.start_date, ia.end_date, ia.created_at,
                   ie.name AS equipment_name
            FROM irrigation_assignments ia
            JOIN irrigation_equipment ie ON ie.id = ia.equipment_id
            WHERE ia.field_id = ?
            ORDER BY ia.start_date DESC
        ");
        $stmt->execute([$fieldId]);
    } else {
        json_error('equipment_id or field_id is required');
    }

    json_response($stmt->fetchAll());
}

// ── POST: create assignment ──
if ($method === 'POST') {
    $body = get_json_body();
    $equipmentId = (int) ($body['equipment_id'] ?? 0);
    $fieldId = (int) ($body['field_id'] ?? 0);
    $startDate = trim($body['start_date'] ?? '');
    $endDate = isset($body['end_date']) && $body['end_date'] ? trim($body['end_date']) : null;

    if (!$equipmentId) json_error('equipment_id is required');
    if (!$fieldId) json_error('field_id is required');
    if (!$startDate) json_error('start_date is required');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate)) json_error('start_date must be YYYY-MM-DD');
    if ($endDate && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate)) json_error('end_date must be YYYY-MM-DD');

    if (!verify_equipment_owner($db, $equipmentId, $user['id'])) json_error('Equipment not found', 404);
    if (!verify_field_owner($db, $fieldId, $user['id'])) json_error('Field not found', 404);

    // Auto-close previous open assignment for this equipment
    // Set end_date = day before new start_date
    $prevEndDate = date('Y-m-d', strtotime($startDate . ' -1 day'));
    $stmt = $db->prepare("
        UPDATE irrigation_assignments
        SET end_date = ?
        WHERE equipment_id = ? AND end_date IS NULL AND start_date < ?
    ");
    $stmt->execute([$prevEndDate, $equipmentId, $startDate]);

    $stmt = $db->prepare("
        INSERT INTO irrigation_assignments (equipment_id, field_id, start_date, end_date)
        VALUES (?, ?, ?, ?)
    ");
    $stmt->execute([$equipmentId, $fieldId, $startDate, $endDate]);

    $id = (int) $db->lastInsertId();
    $stmt = $db->prepare("
        SELECT ia.id, ia.equipment_id, ia.field_id, ia.start_date, ia.end_date, ia.created_at,
               fi.name AS field_name, ie.name AS equipment_name
        FROM irrigation_assignments ia
        JOIN fields fi ON fi.id = ia.field_id
        JOIN irrigation_equipment ie ON ie.id = ia.equipment_id
        WHERE ia.id = ?
    ");
    $stmt->execute([$id]);
    json_response($stmt->fetch(), 201);
}

// ── PUT: update assignment dates ──
if ($method === 'PUT') {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) json_error('id is required');

    // Verify ownership
    $stmt = $db->prepare("
        SELECT ia.id, ia.equipment_id FROM irrigation_assignments ia
        JOIN irrigation_equipment ie ON ie.id = ia.equipment_id
        JOIN farms f ON f.id = ie.farm_id
        WHERE ia.id = ? AND f.user_id = ?
    ");
    $stmt->execute([$id, $user['id']]);
    if (!$stmt->fetch()) json_error('Assignment not found', 404);

    $body = get_json_body();
    $sets = [];
    $params = [];

    if (isset($body['start_date'])) {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $body['start_date'])) json_error('start_date must be YYYY-MM-DD');
        $sets[] = "start_date = ?";
        $params[] = $body['start_date'];
    }
    if (array_key_exists('end_date', $body)) {
        if ($body['end_date'] !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $body['end_date'])) {
            json_error('end_date must be YYYY-MM-DD or null');
        }
        $sets[] = "end_date = ?";
        $params[] = $body['end_date'];
    }
    if (isset($body['field_id'])) {
        $fieldId = (int) $body['field_id'];
        if (!verify_field_owner($db, $fieldId, $user['id'])) json_error('Field not found', 404);
        $sets[] = "field_id = ?";
        $params[] = $fieldId;
    }

    if (empty($sets)) json_error('No fields to update');

    $params[] = $id;
    $stmt = $db->prepare("UPDATE irrigation_assignments SET " . implode(', ', $sets) . " WHERE id = ?");
    $stmt->execute($params);

    json_response(['success' => true]);
}

// ── DELETE: remove assignment ──
if ($method === 'DELETE') {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) json_error('id is required');

    $stmt = $db->prepare("
        SELECT ia.id FROM irrigation_assignments ia
        JOIN irrigation_equipment ie ON ie.id = ia.equipment_id
        JOIN farms f ON f.id = ie.farm_id
        WHERE ia.id = ? AND f.user_id = ?
    ");
    $stmt->execute([$id, $user['id']]);
    if (!$stmt->fetch()) json_error('Assignment not found', 404);

    $stmt = $db->prepare("DELETE FROM irrigation_assignments WHERE id = ?");
    $stmt->execute([$id]);
    json_response(['success' => true]);
}

json_error('Method not allowed', 405);
