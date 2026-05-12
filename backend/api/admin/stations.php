<?php
/**
 * Admin: Station management
 *
 * GET    /api/admin/stations.php        — List all stations (with API keys)
 * POST   /api/admin/stations.php        — Create station
 * PUT    /api/admin/stations.php?id=N   — Update station
 * DELETE /api/admin/stations.php?id=N   — Deactivate station (soft delete)
 */

require_once __DIR__ . '/../../helpers.php';

cors_headers();
require_method('GET', 'POST', 'PUT', 'DELETE');

$user = authenticate();
require_admin($user);

$db = getDB();

// ── GET: List all stations ──
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->query("
        SELECT id, mac, name, api_key, application_key,
               latitude, longitude, elevation_m, is_active, created_at
        FROM stations
        ORDER BY is_active DESC, name ASC
    ");
    $stations = $stmt->fetchAll();

    foreach ($stations as &$s) {
        $s['id'] = (int) $s['id'];
        $s['latitude'] = (float) $s['latitude'];
        $s['longitude'] = (float) $s['longitude'];
        $s['elevation_m'] = (int) $s['elevation_m'];
        $s['is_active'] = (bool) $s['is_active'];
    }

    json_response($stations);
}

// ── POST: Create station ──
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = get_json_body();

    $mac = trim($body['mac'] ?? '');
    $name = trim($body['name'] ?? '');
    $apiKey = trim($body['apiKey'] ?? '');
    $appKey = trim($body['applicationKey'] ?? '');
    $lat = (float) ($body['latitude'] ?? -34.5);
    $lon = (float) ($body['longitude'] ?? -56.0);
    $elev = (int) ($body['elevationM'] ?? 50);

    if (!$mac) json_error('MAC address is required');
    if (!$name) json_error('Station name is required');
    if (!$apiKey) json_error('API key is required');
    if (!$appKey) json_error('Application key is required');

    // Check duplicate MAC
    $stmt = $db->prepare("SELECT id FROM stations WHERE mac = ?");
    $stmt->execute([$mac]);
    if ($stmt->fetch()) {
        json_error('A station with this MAC already exists', 409);
    }

    $stmt = $db->prepare("
        INSERT INTO stations (mac, name, api_key, application_key, latitude, longitude, elevation_m)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([$mac, $name, $apiKey, $appKey, $lat, $lon, $elev]);
    $stationId = (int) $db->lastInsertId();

    // Auto-assign to all existing users
    $db->prepare("
        INSERT INTO user_stations (user_id, station_id)
        SELECT id, ? FROM users
    ")->execute([$stationId]);

    json_response([
        'id' => $stationId,
        'mac' => $mac,
        'name' => $name,
        'latitude' => $lat,
        'longitude' => $lon,
        'elevationM' => $elev,
        'isActive' => true,
    ], 201);
}

// ── PUT: Update station ──
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) json_error('Station ID is required');

    $body = get_json_body();
    $fields = [];
    $params = [];

    if (isset($body['name'])) { $fields[] = 'name = ?'; $params[] = trim($body['name']); }
    if (isset($body['apiKey'])) { $fields[] = 'api_key = ?'; $params[] = trim($body['apiKey']); }
    if (isset($body['applicationKey'])) { $fields[] = 'application_key = ?'; $params[] = trim($body['applicationKey']); }
    if (isset($body['latitude'])) { $fields[] = 'latitude = ?'; $params[] = (float) $body['latitude']; }
    if (isset($body['longitude'])) { $fields[] = 'longitude = ?'; $params[] = (float) $body['longitude']; }
    if (isset($body['elevationM'])) { $fields[] = 'elevation_m = ?'; $params[] = (int) $body['elevationM']; }
    if (isset($body['isActive'])) { $fields[] = 'is_active = ?'; $params[] = $body['isActive'] ? 1 : 0; }

    if (empty($fields)) json_error('No fields to update');

    $params[] = $id;
    $stmt = $db->prepare("UPDATE stations SET " . implode(', ', $fields) . " WHERE id = ?");
    $stmt->execute($params);

    json_response(['success' => true]);
}

// ── DELETE: Soft delete (deactivate) ──
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) json_error('Station ID is required');

    $stmt = $db->prepare("UPDATE stations SET is_active = 0 WHERE id = ?");
    $stmt->execute([$id]);

    json_response(['success' => true]);
}
