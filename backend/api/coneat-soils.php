<?php
/**
 * CONEAT Soil Data API
 * GET  /api/coneat-soils.php          — List all CONEAT groups (without geometry, for lightweight listing)
 * GET  /api/coneat-soils.php?full=1    — List all with geometry (for client-side intersection)
 * POST /api/coneat-soils.php           — Bulk import from processed JSON (admin only)
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();

$user = authenticate();
$db = getDB();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $full = isset($_GET['full']);

    if ($full) {
        $stmt = $db->query("SELECT gc_code, geometry, mm, apdn, ip FROM coneat_soils ORDER BY gc_code");
    } else {
        $stmt = $db->query("SELECT gc_code, mm, apdn, ip FROM coneat_soils ORDER BY gc_code");
    }

    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['mm'] = (float) $r['mm'];
        $r['apdn'] = (float) $r['apdn'];
        $r['ip'] = (int) $r['ip'];
        if (isset($r['geometry'])) {
            $r['geometry'] = json_decode($r['geometry'], true);
        }
    }

    json_response($rows);

} elseif ($method === 'POST') {
    require_admin($user);

    $body = json_decode(file_get_contents('php://input'), true);
    if (!$body || !isset($body['features']) || !is_array($body['features'])) {
        json_error('Invalid payload: expected {features: [...]}');
    }

    $features = $body['features'];
    $inserted = 0;

    $stmt = $db->prepare("
        INSERT INTO coneat_soils (gc_code, geometry, mm, apdn, ip)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            geometry = VALUES(geometry), mm = VALUES(mm),
            apdn = VALUES(apdn), ip = VALUES(ip)
    ");

    foreach ($features as $f) {
        $gc = $f['gc'] ?? null;
        $geometry = $f['geometry'] ?? null;
        $mm = $f['mm'] ?? null;
        $apdn = $f['apdn'] ?? null;
        $ip = $f['ip'] ?? 0;

        if (!$gc || !$geometry || $mm === null || $apdn === null) continue;

        $stmt->execute([
            $gc,
            json_encode($geometry),
            $mm,
            $apdn,
            $ip,
        ]);
        $inserted++;
    }

    json_response(['success' => true, 'inserted' => $inserted]);

} else {
    require_method('GET');
}
