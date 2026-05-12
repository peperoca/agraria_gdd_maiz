<?php
/**
 * Configuration file - NEVER expose this to the web
 * Update DB credentials after creating the MySQL database in cPanel
 */

// Database credentials - UPDATE THESE after creating the DB in cPanel
define('DB_HOST', 'localhost');
define('DB_NAME', 'YOUR_CPANEL_USER_gdd');    // e.g., valleyc_gdd
define('DB_USER', 'YOUR_CPANEL_USER_gdd');    // e.g., valleyc_gdd
define('DB_PASS', 'YOUR_DB_PASSWORD');         // Set in cPanel MySQL

// CORS - allowed origins (add localhost for development)
define('CORS_ORIGINS', [
    'https://agraria-gdd-maiz.vercel.app',
    'https://corn-gdd-tracker.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
]);

// Auth settings
define('TOKEN_EXPIRY_DAYS', 30);

// Ambient Weather API base URL
define('AMBIENT_API_URL', 'https://rt.ambientweather.net/v1/devices');

// Copernicus Data Space Ecosystem (CDSE) — Sentinel Hub
define('CDSE_CLIENT_ID', '');     // Fill with your CDSE client ID
define('CDSE_CLIENT_SECRET', ''); // Fill with your CDSE client secret
define('CDSE_TOKEN_URL', 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token');
define('SENTINEL_HUB_STATS_URL', 'https://sh.dataspace.copernicus.eu/api/v1/statistics');

// Cron secret key for web triggers
define('CRON_SECRET', 'CHANGE_THIS_TO_A_RANDOM_STRING');
