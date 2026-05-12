<?php
/**
 * Shared helpers: CORS, JSON responses, authentication
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

/**
 * Set CORS headers and handle preflight OPTIONS requests
 */
function cors_headers(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if (in_array($origin, CORS_ORIGINS, true)) {
        header("Access-Control-Allow-Origin: $origin");
    }

    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Max-Age: 86400');

    // Handle preflight
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

/**
 * Send a JSON response and exit
 */
function json_response($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Send an error response and exit
 */
function json_error(string $message, int $code = 400): void {
    json_response(['error' => $message], $code);
}

/**
 * Parse JSON request body
 */
function get_json_body(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_error('Invalid JSON body', 400);
    }
    return $data;
}

/**
 * Require a specific HTTP method
 */
function require_method(string ...$methods): void {
    if (!in_array($_SERVER['REQUEST_METHOD'], $methods, true)) {
        json_error('Method not allowed', 405);
    }
}

/**
 * Authenticate the request via Bearer token.
 * Returns the user row or sends 401 and exits.
 */
function authenticate(): array {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    if (!preg_match('/^Bearer\s+([a-f0-9]{64})$/i', $header, $m)) {
        json_error('Unauthorized', 401);
    }

    $token = $m[1];
    $db = getDB();

    // Clean up expired tokens occasionally (1% chance per request)
    if (mt_rand(1, 100) === 1) {
        $db->exec("DELETE FROM auth_tokens WHERE expires_at < NOW()");
    }

    $stmt = $db->prepare("
        SELECT u.id, u.username, u.email, u.role
        FROM auth_tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = ? AND t.expires_at > NOW()
    ");
    $stmt->execute([$token]);
    $user = $stmt->fetch();

    if (!$user) {
        json_error('Unauthorized', 401);
    }

    return $user;
}

/**
 * Require admin role. Sends 403 and exits if user is not admin.
 */
function require_admin(array $user): void {
    if (($user['role'] ?? '') !== 'admin') {
        json_error('Forbidden — admin access required', 403);
    }
}

/**
 * Generate a secure random token
 */
function generate_token(): string {
    return bin2hex(random_bytes(32));
}

/**
 * Find the nearest active station within a given radius (km) using Haversine formula.
 * Returns station row or null if none found.
 */
function find_nearest_station(float $lat, float $lon, float $maxKm = 20): ?array {
    $db = getDB();
    $stmt = $db->prepare("
        SELECT id, mac, name, latitude, longitude, elevation_m,
        (6371 * acos(
            cos(radians(?)) * cos(radians(latitude))
            * cos(radians(longitude) - radians(?))
            + sin(radians(?)) * sin(radians(latitude))
        )) AS distance_km
        FROM stations
        WHERE is_active = 1
        HAVING distance_km <= ?
        ORDER BY distance_km ASC
        LIMIT 1
    ");
    $stmt->execute([$lat, $lon, $lat, $maxKm]);
    $result = $stmt->fetch();
    return $result ?: null;
}

/**
 * Fetch a URL using cURL (works on cPanel where allow_url_fopen is disabled)
 * Returns ['status' => int, 'body' => string] or ['status' => 0, 'error' => string]
 */
function curl_fetch(string $url, int $timeout = 30): array {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'CornGDD-Backend/1.0',
    ]);
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($body === false) {
        return ['status' => 0, 'body' => '', 'error' => $error];
    }
    return ['status' => $status, 'body' => $body, 'error' => ''];
}
