<?php
/**
 * GET /api/me.php
 * Requires: Authorization: Bearer <token>
 * Returns: { "id": N, "username": "...", "email": "..." }
 */

require_once __DIR__ . '/../helpers.php';

cors_headers();
require_method('GET');

$user = authenticate();

json_response($user);
