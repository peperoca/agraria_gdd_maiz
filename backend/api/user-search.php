<?php
/**
 * Search users by username (for sharing UI)
 *
 * GET /api/user-search.php?q=term  — Search by username prefix (authenticated, any role)
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET');

$user = authenticate();
$db = getDB();

$query = trim($_GET['q'] ?? '');
if (strlen($query) < 2) json_error('Search query must be at least 2 characters');

$stmt = $db->prepare("
    SELECT id, username
    FROM users
    WHERE username LIKE ? AND id != ?
    ORDER BY username ASC
    LIMIT 10
");
$stmt->execute([$query . '%', $user['id']]);
$users = $stmt->fetchAll();

foreach ($users as &$u) {
    $u['id'] = (int) $u['id'];
}

json_response($users);
