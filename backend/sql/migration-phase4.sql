-- Phase 4 Migration: NDVI Readings
-- Run this in phpMyAdmin AFTER Phase 3 migration

CREATE TABLE IF NOT EXISTS ndvi_readings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    field_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    ndvi_mean DECIMAL(5,4) DEFAULT NULL,
    kc DECIMAL(5,4) DEFAULT NULL,
    cloud_pct DECIMAL(5,2) DEFAULT NULL,
    scene_id VARCHAR(100) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_field_date (field_id, date),
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
