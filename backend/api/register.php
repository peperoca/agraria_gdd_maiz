<?php
/**
 * POST /api/register.php
 * Body: { "username": "...", "email": "...", "password": "..." }
 * Returns: { "token": "...", "user": { "id": N, "username": "...", "email": "..." } }
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('POST');

$body = get_json_body();

$username = trim($body['username'] ?? '');
$email = trim($body['email'] ?? '');
$password = $body['password'] ?? '';

// Validate
if (strlen($username) < 3 || strlen($username) > 50) {
    json_error('Username must be 3-50 characters');
}
if (!preg_match('/^[a-zA-Z0-9_]+$/', $username)) {
    json_error('Username can only contain letters, numbers, and underscores');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_error('Invalid email address');
}
if (strlen($password) < 6) {
    json_error('Password must be at least 6 characters');
}

$db = getDB();

// Check for existing username or email
$stmt = $db->prepare("SELECT id FROM users WHERE username = ? OR email = ?");
$stmt->execute([$username, $email]);
if ($stmt->fetch()) {
    json_error('Username or email already exists', 409);
}

// Create user
$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
$stmt = $db->prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)");
$stmt->execute([$username, $email, $hash]);
$userId = (int) $db->lastInsertId();

// Auto-assign all active stations to the new user
$stmt = $db->prepare("
    INSERT INTO user_stations (user_id, station_id)
    SELECT ?, id FROM stations WHERE is_active = 1
");
$stmt->execute([$userId]);

// Generate auth token
$token = generate_token();
$expiry = date('Y-m-d H:i:s', strtotime('+' . TOKEN_EXPIRY_DAYS . ' days'));
$stmt = $db->prepare("INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?, ?, ?)");
$stmt->execute([$userId, $token, $expiry]);

json_response([
    'token' => $token,
    'user' => [
        'id' => $userId,
        'username' => $username,
        'email' => $email,
        'role' => 'user',
    ],
], 201);
