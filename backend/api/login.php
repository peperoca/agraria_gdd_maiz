<?php
/**
 * POST /api/login.php
 * Body: { "username": "...", "password": "..." }
 * Returns: { "token": "...", "user": { "id": N, "username": "...", "email": "..." } }
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('POST');

$body = get_json_body();

$username = trim($body['username'] ?? '');
$password = $body['password'] ?? '';

if (!$username || !$password) {
    json_error('Username and password are required');
}

$db = getDB();

$stmt = $db->prepare("SELECT id, username, email, password_hash, role FROM users WHERE username = ?");
$stmt->execute([$username]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    json_error('Invalid username or password', 401);
}

// Generate auth token
$token = generate_token();
$expiry = date('Y-m-d H:i:s', strtotime('+' . TOKEN_EXPIRY_DAYS . ' days'));
$stmt = $db->prepare("INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?, ?, ?)");
$stmt->execute([$user['id'], $token, $expiry]);

json_response([
    'token' => $token,
    'user' => [
        'id' => (int) $user['id'],
        'username' => $user['username'],
        'email' => $user['email'],
        'role' => $user['role'] ?? 'user',
    ],
]);
