-- Corn GDD Tracker - Database Schema
-- Run this in phpMyAdmin or MySQL CLI to set up the database

CREATE TABLE IF NOT EXISTS stations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    mac VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL DEFAULT '',
    api_key VARCHAR(255) NOT NULL,
    application_key VARCHAR(255) NOT NULL,
    latitude DECIMAL(9,6) NOT NULL DEFAULT -34.500000,
    longitude DECIMAL(9,6) NOT NULL DEFAULT -56.000000,
    elevation_m INT NOT NULL DEFAULT 50,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS weather_readings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    station_id INT UNSIGNED NOT NULL,
    dateutc BIGINT NOT NULL,
    tempf DECIMAL(6,2) DEFAULT NULL,
    humidity DECIMAL(5,2) DEFAULT NULL,
    windspeedmph DECIMAL(6,2) DEFAULT NULL,
    solarradiation DECIMAL(8,2) DEFAULT NULL,
    baromrelin DECIMAL(6,4) DEFAULT NULL,
    dewpoint DECIMAL(6,2) DEFAULT NULL,
    dailyrainin DECIMAL(6,3) DEFAULT NULL,
    hourlyrainin DECIMAL(6,3) DEFAULT NULL,
    date_iso VARCHAR(30) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_station_dateutc (station_id, dateutc),
    INDEX idx_station_dateutc (station_id, dateutc),
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('user','admin') NOT NULL DEFAULT 'user',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_tokens (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_token (token),
    INDEX idx_expires (expires_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fields (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    sowing_date DATE NOT NULL,
    station_mac VARCHAR(20) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_stations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    station_id INT UNSIGNED NOT NULL,
    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_station (user_id, station_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert the initial weather station
INSERT INTO stations (mac, name, api_key, application_key, latitude, longitude, elevation_m)
VALUES ('E8:DB:84:E6:C4:B8', 'Agraria Uruguay', '9ebc5fab112c4eeca8526d24e9d9c63f1463e31c491f445ca56691e52f4b6743', '4783a9370d1d4da7be74376b345bfb4fd044e66052194d978d885270e304bab3', -34.738, -56.583, 50);
