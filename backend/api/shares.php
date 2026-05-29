<?php
/**
 * Sharing API
 *
 * GET    /api/shares.php?entity_type=farm&entity_id=N  — List shares for an entity (owner/admin only)
 * POST   /api/shares.php                               — Create a share
 * DELETE /api/shares.php?id=N                           — Remove a share
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET', 'POST', 'DELETE');

$user = authenticate();
$db = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $entityType = $_GET['entity_type'] ?? '';
    $entityId = (int) ($_GET['entity_id'] ?? 0);

    if (!in_array($entityType, ['farm', 'field'])) json_error('Invalid entity_type');
    if ($entityId <= 0) json_error('entity_id is required');

    // Verify ownership (only owner or admin can list shares)
    if ($entityType === 'farm') {
        if (!is_farm_owner($db, $entityId, $user)) json_error('Not authorized', 403);
    } else {
        // Field: check ownership via user_id
        $stmt = $db->prepare("SELECT user_id FROM fields WHERE id = ?");
        $stmt->execute([$entityId]);
        $field = $stmt->fetch();
        if (!$field) json_error('Field not found', 404);
        if ($user['role'] !== 'admin' && (int) $field['user_id'] !== (int) $user['id']) {
            json_error('Not authorized', 403);
        }
    }

    $stmt = $db->prepare("
        SELECT s.id, s.entity_type, s.entity_id, s.owner_id, s.shared_with_id,
               u.username AS shared_with_username, s.created_at
        FROM shares s
        JOIN users u ON u.id = s.shared_with_id
        WHERE s.entity_type = ? AND s.entity_id = ?
        ORDER BY s.created_at DESC
    ");
    $stmt->execute([$entityType, $entityId]);
    $shares = $stmt->fetchAll();

    foreach ($shares as &$s) {
        $s['id'] = (int) $s['id'];
        $s['entityType'] = $s['entity_type'];
        $s['entityId'] = (int) $s['entity_id'];
        $s['ownerId'] = (int) $s['owner_id'];
        $s['sharedWithId'] = (int) $s['shared_with_id'];
        $s['sharedWithUsername'] = $s['shared_with_username'];
        $s['createdAt'] = $s['created_at'];
        unset($s['entity_type'], $s['entity_id'], $s['owner_id'], $s['shared_with_id'], $s['shared_with_username'], $s['created_at']);
    }

    json_response($shares);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = get_json_body();

    $entityType = $body['entityType'] ?? '';
    $entityId = (int) ($body['entityId'] ?? 0);
    $sharedWithUsername = trim($body['sharedWithUsername'] ?? '');

    if (!in_array($entityType, ['farm', 'field'])) json_error('Invalid entityType');
    if ($entityId <= 0) json_error('entityId is required');
    if (!$sharedWithUsername) json_error('sharedWithUsername is required');

    // Verify entity exists and caller is owner (or admin)
    if ($entityType === 'farm') {
        $stmt = $db->prepare("SELECT user_id FROM farms WHERE id = ?");
        $stmt->execute([$entityId]);
        $entity = $stmt->fetch();
        if (!$entity) json_error('Farm not found', 404);
        if ($user['role'] !== 'admin' && (int) $entity['user_id'] !== (int) $user['id']) {
            json_error('Not authorized', 403);
        }
        $ownerId = (int) $entity['user_id'];
    } else {
        $stmt = $db->prepare("SELECT user_id FROM fields WHERE id = ?");
        $stmt->execute([$entityId]);
        $entity = $stmt->fetch();
        if (!$entity) json_error('Field not found', 404);
        if ($user['role'] !== 'admin' && (int) $entity['user_id'] !== (int) $user['id']) {
            json_error('Not authorized', 403);
        }
        $ownerId = (int) $entity['user_id'];
    }

    // Find the target user by username
    $stmt = $db->prepare("SELECT id, username FROM users WHERE username = ?");
    $stmt->execute([$sharedWithUsername]);
    $targetUser = $stmt->fetch();
    if (!$targetUser) json_error('User not found');

    $targetId = (int) $targetUser['id'];

    // Can't share with self
    if ($targetId === $ownerId) json_error('Cannot share with yourself');

    // Check for existing share
    $stmt = $db->prepare("SELECT 1 FROM shares WHERE entity_type = ? AND entity_id = ? AND shared_with_id = ?");
    $stmt->execute([$entityType, $entityId, $targetId]);
    if ($stmt->fetch()) json_error('Already shared with this user');

    $stmt = $db->prepare("
        INSERT INTO shares (entity_type, entity_id, owner_id, shared_with_id)
        VALUES (?, ?, ?, ?)
    ");
    $stmt->execute([$entityType, $entityId, $ownerId, $targetId]);

    json_response([
        'id' => (int) $db->lastInsertId(),
        'entityType' => $entityType,
        'entityId' => $entityId,
        'ownerId' => $ownerId,
        'sharedWithId' => $targetId,
        'sharedWithUsername' => $targetUser['username'],
        'createdAt' => date('Y-m-d H:i:s'),
    ], 201);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $shareId = (int) ($_GET['id'] ?? 0);
    if ($shareId <= 0) json_error('Share ID is required');

    // Fetch share to verify ownership
    $stmt = $db->prepare("SELECT id, owner_id FROM shares WHERE id = ?");
    $stmt->execute([$shareId]);
    $share = $stmt->fetch();
    if (!$share) json_error('Share not found', 404);

    if ($user['role'] !== 'admin' && (int) $share['owner_id'] !== (int) $user['id']) {
        json_error('Not authorized', 403);
    }

    $stmt = $db->prepare("DELETE FROM shares WHERE id = ?");
    $stmt->execute([$shareId]);

    json_response(['success' => true]);
}
