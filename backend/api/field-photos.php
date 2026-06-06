<?php
/**
 * Field Photos API
 * GET    ?field_id=N        → list photos for a field
 * POST   ?field_id=N        → upload photo(s) (multipart/form-data)
 * DELETE  ?id=N             → delete a photo
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
$user = authenticate();
$db = getDB();

// Upload directory (relative to this file's parent)
$uploadDir = __DIR__ . '/../uploads/field-photos/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// Base URL for serving photos
$baseUrl = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/../uploads/field-photos/';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $fieldId = (int) ($_GET['field_id'] ?? 0);
    if ($fieldId <= 0) json_error('field_id is required');

    // Verify ownership
    $stmt = $db->prepare("SELECT 1 FROM fields WHERE id = ? AND user_id = ?");
    $stmt->execute([$fieldId, $user['id']]);
    if (!$stmt->fetch()) json_error('Field not found', 404);

    $stmt = $db->prepare("SELECT id, filename, caption, created_at AS createdAt FROM field_photos WHERE field_id = ? ORDER BY created_at DESC");
    $stmt->execute([$fieldId]);
    $photos = $stmt->fetchAll();

    // Add full URL
    foreach ($photos as &$photo) {
        $photo['url'] = $baseUrl . $photo['filename'];
    }

    json_response($photos);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $fieldId = (int) ($_GET['field_id'] ?? ($_POST['field_id'] ?? 0));
    if ($fieldId <= 0) json_error('field_id is required');

    // Verify ownership
    $stmt = $db->prepare("SELECT 1 FROM fields WHERE id = ? AND user_id = ?");
    $stmt->execute([$fieldId, $user['id']]);
    if (!$stmt->fetch()) json_error('Field not found', 404);

    if (empty($_FILES['photos'])) json_error('No photos uploaded');

    $files = $_FILES['photos'];
    $uploaded = [];
    $allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    $maxSize = 10 * 1024 * 1024; // 10MB per file

    // Handle single or multiple files
    $fileCount = is_array($files['name']) ? count($files['name']) : 1;

    for ($i = 0; $i < $fileCount; $i++) {
        $name = is_array($files['name']) ? $files['name'][$i] : $files['name'];
        $tmpName = is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'];
        $size = is_array($files['size']) ? $files['size'][$i] : $files['size'];
        $type = is_array($files['type']) ? $files['type'][$i] : $files['type'];
        $error = is_array($files['error']) ? $files['error'][$i] : $files['error'];

        if ($error !== UPLOAD_ERR_OK) continue;
        if ($size > $maxSize) continue;
        if (!in_array(strtolower($type), $allowedTypes)) continue;

        // Generate unique filename
        $ext = pathinfo($name, PATHINFO_EXTENSION) ?: 'jpg';
        $filename = "field_{$fieldId}_" . uniqid() . '.' . strtolower($ext);
        $dest = $uploadDir . $filename;

        if (move_uploaded_file($tmpName, $dest)) {
            $caption = $_POST['caption'] ?? null;
            $stmt = $db->prepare("INSERT INTO field_photos (field_id, filename, caption) VALUES (?, ?, ?)");
            $stmt->execute([$fieldId, $filename, $caption]);

            $uploaded[] = [
                'id' => (int) $db->lastInsertId(),
                'filename' => $filename,
                'url' => $baseUrl . $filename,
                'caption' => $caption,
                'createdAt' => date('Y-m-d H:i:s'),
            ];
        }
    }

    json_response(['uploaded' => $uploaded, 'count' => count($uploaded)]);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $photoId = (int) ($_GET['id'] ?? 0);
    if ($photoId <= 0) json_error('Photo id is required');

    // Verify ownership via field
    $stmt = $db->prepare("
        SELECT p.filename FROM field_photos p
        JOIN fields f ON f.id = p.field_id
        WHERE p.id = ? AND f.user_id = ?
    ");
    $stmt->execute([$photoId, $user['id']]);
    $photo = $stmt->fetch();

    if (!$photo) json_error('Photo not found', 404);

    // Delete file
    $filePath = $uploadDir . $photo['filename'];
    if (file_exists($filePath)) unlink($filePath);

    // Delete DB record
    $stmt = $db->prepare("DELETE FROM field_photos WHERE id = ?");
    $stmt->execute([$photoId]);

    json_response(['success' => true]);
}
