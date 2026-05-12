<?php
/**
 * Debug endpoint — test the registration flow and show errors
 * DELETE THIS FILE after debugging
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: text/plain');
header('Access-Control-Allow-Origin: *');

echo "=== Debug Register ===\n\n";

// Test 1: Can we load config?
echo "1. Loading config...\n";
try {
    require_once __DIR__ . '/../config.php';
    echo "   OK - DB_HOST: " . DB_HOST . ", DB_NAME: " . DB_NAME . "\n";
} catch (Throwable $e) {
    echo "   FAIL: " . $e->getMessage() . "\n";
    exit;
}

// Test 2: Can we connect to DB?
echo "\n2. Connecting to DB...\n";
try {
    require_once __DIR__ . '/../db.php';
    $db = getDB();
    echo "   OK - Connected\n";
} catch (Throwable $e) {
    echo "   FAIL: " . $e->getMessage() . "\n";
    exit;
}

// Test 3: Do the required tables exist?
echo "\n3. Checking tables...\n";
$tables = ['stations', 'weather_readings', 'users', 'auth_tokens', 'fields', 'user_stations'];
foreach ($tables as $table) {
    try {
        $count = $db->query("SELECT COUNT(*) as c FROM $table")->fetch();
        echo "   $table: OK ({$count['c']} rows)\n";
    } catch (Throwable $e) {
        echo "   $table: MISSING - " . $e->getMessage() . "\n";
    }
}

// Test 4: Try password_hash
echo "\n4. Testing password_hash...\n";
try {
    $hash = password_hash('test123', PASSWORD_BCRYPT, ['cost' => 12]);
    echo "   OK - hash: " . substr($hash, 0, 30) . "...\n";
} catch (Throwable $e) {
    echo "   FAIL: " . $e->getMessage() . "\n";
}

// Test 5: Try inserting a test user
echo "\n5. Testing user insert...\n";
try {
    $stmt = $db->prepare("SELECT id FROM users WHERE username = 'debugtest'");
    $stmt->execute();
    $existing = $stmt->fetch();
    if ($existing) {
        echo "   User 'debugtest' already exists (id: {$existing['id']}), deleting...\n";
        $db->prepare("DELETE FROM users WHERE username = 'debugtest'")->execute();
    }

    $hash = password_hash('test123', PASSWORD_BCRYPT, ['cost' => 12]);
    $stmt = $db->prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)");
    $stmt->execute(['debugtest', 'debug@test.com', $hash]);
    $userId = $db->lastInsertId();
    echo "   OK - Created user id: $userId\n";

    // Clean up
    $db->prepare("DELETE FROM users WHERE id = ?")->execute([$userId]);
    echo "   Cleaned up test user\n";
} catch (Throwable $e) {
    echo "   FAIL: " . $e->getMessage() . "\n";
}

// Test 6: Load helpers
echo "\n6. Testing helpers.php...\n";
try {
    require_once __DIR__ . '/../helpers.php';
    $token = generate_token();
    echo "   OK - token: " . substr($token, 0, 20) . "...\n";
} catch (Throwable $e) {
    echo "   FAIL: " . $e->getMessage() . "\n";
}

echo "\n=== Debug complete ===\n";
