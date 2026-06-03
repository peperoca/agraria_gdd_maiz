<?php
/**
 * GET    /api/farm.php?id=N — Get a single farm
 * PUT    /api/farm.php?id=N — Update a farm
 * DELETE /api/farm.php?id=N — Delete a farm and its fields
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET', 'PUT', 'DELETE');

$user = authenticate();
$db = getDB();

$farmId = (int) ($_GET['id'] ?? 0);
if ($farmId <= 0) json_error('Farm ID is required');

// For GET: allow owner, shared, or admin
// For PUT/DELETE: allow only owner or admin
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!can_read_farm($db, $farmId, $user)) json_error('Farm not found', 404);
} else {
    if (!is_farm_owner($db, $farmId, $user)) json_error('Farm not found', 404);
}

$stmt = $db->prepare("SELECT id, name, latitude, longitude, station_id FROM farms WHERE id = ?");
$stmt->execute([$farmId]);
$farm = $stmt->fetch();

if (!$farm) json_error('Farm not found', 404);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $farm['id'] = (int) $farm['id'];
    $farm['latitude'] = $farm['latitude'] !== null ? (float) $farm['latitude'] : null;
    $farm['longitude'] = $farm['longitude'] !== null ? (float) $farm['longitude'] : null;
    json_response($farm);
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $body = get_json_body();
    $fields = [];
    $params = [];

    if (isset($body['name'])) { $fields[] = 'name = ?'; $params[] = trim($body['name']); }
    if (isset($body['latitude'])) { $fields[] = 'latitude = ?'; $params[] = (float) $body['latitude']; }
    if (isset($body['longitude'])) { $fields[] = 'longitude = ?'; $params[] = (float) $body['longitude']; }

    // Explicit station override takes priority
    if (isset($body['stationId'])) {
        $fields[] = 'station_id = ?';
        $params[] = $body['stationId'] !== null ? (int) $body['stationId'] : null;
    } elseif (isset($body['latitude']) && isset($body['longitude'])) {
        // Auto re-assign station if coords changed (and no explicit override)
        $nearest = find_nearest_station((float) $body['latitude'], (float) $body['longitude'], 50);
        $fields[] = 'station_id = ?';
        $params[] = $nearest ? (int) $nearest['id'] : null;
    }

    if (empty($fields)) json_error('No fields to update');

    // Capture old station_id before updating
    $oldStmt = $db->prepare("SELECT station_id FROM farms WHERE id = ?");
    $oldStmt->execute([$farmId]);
    $oldStationId = $oldStmt->fetchColumn();

    $params[] = $farmId;
    $stmt = $db->prepare("UPDATE farms SET " . implode(', ', $fields) . " WHERE id = ?");
    $stmt->execute($params);

    // Check if station changed and propagate to all fields
    $fieldsUpdated = 0;
    $activeSeasonsAffected = 0;
    $dataGapWarning = false;

    $newStmt = $db->prepare("SELECT station_id FROM farms WHERE id = ?");
    $newStmt->execute([$farmId]);
    $newStationId = $newStmt->fetchColumn();

    if ($newStationId && $oldStationId != $newStationId) {
        // Resolve old MAC
        $oldMac = null;
        if ($oldStationId) {
            $s = $db->prepare("SELECT mac FROM stations WHERE id = ?");
            $s->execute([$oldStationId]);
            $oldMac = $s->fetchColumn();
        }
        // Resolve new MAC
        $s = $db->prepare("SELECT mac FROM stations WHERE id = ?");
        $s->execute([$newStationId]);
        $newMac = $s->fetchColumn();

        if ($newMac) {
            // Propagate to all fields under this farm
            $upd = $db->prepare("
                UPDATE fields
                SET station_mac = ?,
                    previous_station_mac = station_mac,
                    station_changed_at = CURDATE()
                WHERE farm_id = ?
            ");
            $upd->execute([$newMac, $farmId]);
            $fieldsUpdated = $upd->rowCount();
        }

        // Count active seasons affected
        $cnt = $db->prepare("
            SELECT COUNT(*) FROM seasons s
            JOIN fields f ON f.id = s.field_id
            WHERE f.farm_id = ? AND s.is_active = 1
        ");
        $cnt->execute([$farmId]);
        $activeSeasonsAffected = (int) $cnt->fetchColumn();

        // Check data availability on new station
        $earliest = $db->prepare("
            SELECT MIN(s.sowing_date) FROM seasons s
            JOIN fields f ON f.id = s.field_id
            WHERE f.farm_id = ? AND s.is_active = 1
        ");
        $earliest->execute([$farmId]);
        $earliestSowing = $earliest->fetchColumn();

        if ($earliestSowing && $newMac) {
            $sowingTs = strtotime($earliestSowing) * 1000;
            $chk = $db->prepare("
                SELECT COUNT(*) FROM weather_readings r
                JOIN stations st ON st.id = r.station_id
                WHERE st.mac = ? AND r.dateutc >= ?
            ");
            $chk->execute([$newMac, $sowingTs]);
            $dataGapWarning = ((int) $chk->fetchColumn()) === 0;
        }
    }

    // Re-fetch to return updated data with distance
    $stmt = $db->prepare("
        SELECT f.id, f.name, f.latitude, f.longitude,
               s.mac AS station_mac, s.name AS station_name, f.created_at,
               CASE WHEN f.latitude IS NOT NULL AND s.latitude IS NOT NULL THEN
                 ROUND(6371 * acos(
                   cos(radians(f.latitude)) * cos(radians(s.latitude))
                   * cos(radians(s.longitude) - radians(f.longitude))
                   + sin(radians(f.latitude)) * sin(radians(s.latitude))
                 ), 1)
               ELSE NULL END AS station_distance_km
        FROM farms f
        LEFT JOIN stations s ON s.id = f.station_id
        WHERE f.id = ?
    ");
    $stmt->execute([$farmId]);
    $updated = $stmt->fetch();
    $updated['id'] = (int) $updated['id'];
    $updated['latitude'] = $updated['latitude'] !== null ? (float) $updated['latitude'] : null;
    $updated['longitude'] = $updated['longitude'] !== null ? (float) $updated['longitude'] : null;
    $updated['stationMac'] = $updated['station_mac'];
    $updated['stationName'] = $updated['station_name'];
    $updated['stationDistanceKm'] = $updated['station_distance_km'] !== null ? (float) $updated['station_distance_km'] : null;
    $updated['createdAt'] = $updated['created_at'];
    unset($updated['station_mac'], $updated['station_name'], $updated['created_at'], $updated['station_distance_km']);

    $updated['fieldsUpdated'] = $fieldsUpdated;
    $updated['activeSeasonsAffected'] = $activeSeasonsAffected;
    $updated['dataGapWarning'] = $dataGapWarning;

    json_response($updated);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    // CASCADE will delete fields too (ownership already verified above)
    $stmt = $db->prepare("DELETE FROM farms WHERE id = ?");
    $stmt->execute([$farmId]);
    json_response(['success' => true]);
}
