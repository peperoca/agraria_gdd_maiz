<?php
/**
 * Admin: User management
 *
 * GET  /api/admin/users.php          — List all users
 * PUT  /api/admin/users.php?id=N     — Update user role
 */

require_once __DIR__ . '/../../helpers.php';

cors_headers();
require_method('GET', 'PUT');

$user = authenticate();
require_admin($user);

$db = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // List all users with field count
    $stmt = $db->query("
        SELECT u.id, u.username, u.email, u.role, u.created_at,
               COUNT(f.id) AS field_count
        FROM users u
        LEFT JOIN fields f ON f.user_id = u.id
        GROUP BY u.id
        ORDER BY u.created_at DESC
    ");
    $users = $stmt->fetchAll();

    foreach ($users as &$u) {
        $u['id'] = (int) $u['id'];
        $u['field_count'] = (int) $u['field_count'];
    }

    json_response($users);
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $targetId = (int) ($_GET['id'] ?? 0);
    if (!$targetId) {
        json_error('User ID is required');
    }

    $body = get_json_body();
    $newRole = $body['role'] ?? '';

    if (!in_array($newRole, ['user', 'admin'], true)) {
        json_error('Role must be "user" or "admin"');
    }

    // Prevent self-demotion
    if ($targetId === (int) $user['id'] && $newRole !== 'admin') {
        json_error('Cannot remove your own admin role');
    }

    // Check target user exists
    $stmt = $db->prepare("SELECT id FROM users WHERE id = ?");
    $stmt->execute([$targetId]);
    if (!$stmt->fetch()) {
        json_error('User not found', 404);
    }

    $stmt = $db->prepare("UPDATE users SET role = ? WHERE id = ?");
    $stmt->execute([$newRole, $targetId]);

    json_response(['success' => true, 'id' => $targetId, 'role' => $newRole]);
}
