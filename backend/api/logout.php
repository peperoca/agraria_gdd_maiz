<?php
/**
 * POST /api/logout.php
 * Requires: Authorization: Bearer <token>
 * Invalidates the current token
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('POST');

$header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', $header, $m)) {
    $db = getDB();
    $stmt = $db->prepare("DELETE FROM auth_tokens WHERE token = ?");
    $stmt->execute([$m[1]]);
}

json_response(['success' => true]);
