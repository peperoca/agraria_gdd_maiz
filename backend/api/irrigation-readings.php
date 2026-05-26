<?php
/**
 * Irrigation Readings
 * GET ?field_id=N&from=DATE&to=DATE → daily irrigation depth for a field
 *
 * Joins assignments by date range to sum equipment readings for dates
 * the equipment was assigned to this field.
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
$user = authenticate();
$db = getDB();

require_method('GET');

$fieldId = (int) ($_GET['field_id'] ?? 0);
$from = $_GET['from'] ?? null;
$to = $_GET['to'] ?? null;

if (!$fieldId) json_error('field_id is required');

// Verify user owns the field (via farm)
$stmt = $db->prepare("
    SELECT fi.id FROM fields fi
    JOIN farms f ON f.id = fi.farm_id
    WHERE fi.id = ? AND f.user_id = ?
");
$stmt->execute([$fieldId, $user['id']]);
if (!$stmt->fetch()) json_error('Field not found', 404);

// Build query — sum irrigation from all equipment assigned to this field on each date
$sql = "
    SELECT ir.date, SUM(ir.depth_mm) AS depth_mm
    FROM irrigation_readings ir
    JOIN irrigation_assignments ia ON ia.equipment_id = ir.equipment_id
    WHERE ia.field_id = ?
      AND ir.date >= ia.start_date
      AND (ia.end_date IS NULL OR ir.date <= ia.end_date)
";
$params = [$fieldId];

if ($from) {
    $sql .= " AND ir.date >= ?";
    $params[] = $from;
}
if ($to) {
    $sql .= " AND ir.date <= ?";
    $params[] = $to;
}

$sql .= " GROUP BY ir.date ORDER BY ir.date";

$stmt = $db->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

// Convert depth_mm to float
$result = array_map(function ($row) {
    return [
        'date' => $row['date'],
        'depth_mm' => round((float) $row['depth_mm'], 2),
    ];
}, $rows);

json_response($result);
