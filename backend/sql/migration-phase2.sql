-- Phase 2 Migration: Farms + Crop Type
-- Run this in phpMyAdmin AFTER Phase 1 migration

-- 1. Create farms table
CREATE TABLE IF NOT EXISTS farms (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    latitude DECIMAL(9,6) DEFAULT NULL,
    longitude DECIMAL(9,6) DEFAULT NULL,
    station_id INT UNSIGNED DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Add crop_type and farm_id to fields
ALTER TABLE fields ADD COLUMN crop_type VARCHAR(30) NOT NULL DEFAULT 'corn' AFTER sowing_date;
ALTER TABLE fields ADD COLUMN farm_id INT UNSIGNED DEFAULT NULL AFTER crop_type;
ALTER TABLE fields ADD FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;

-- 3. Create a default farm per user, using the first active station
INSERT INTO farms (user_id, name, station_id)
    SELECT DISTINCT f.user_id, 'My Farm', (SELECT id FROM stations WHERE is_active = 1 LIMIT 1)
    FROM fields f
    WHERE NOT EXISTS (SELECT 1 FROM farms fm WHERE fm.user_id = f.user_id);

-- 4. Assign existing fields to their user's default farm
UPDATE fields f
    JOIN farms fm ON fm.user_id = f.user_id
    SET f.farm_id = fm.id
    WHERE f.farm_id IS NULL;

-- 5. Future: irrigation tables (create now, use later)
CREATE TABLE IF NOT EXISTS irrigation_equipment (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    farm_id INT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    type ENUM('pivot','drip','sprinkler','flood','other') NOT NULL DEFAULT 'other',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS irrigation_readings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    depth_mm DECIMAL(6,2) NOT NULL,
    source ENUM('manual','sensor','api') NOT NULL DEFAULT 'manual',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_equip_date (equipment_id, date),
    FOREIGN KEY (equipment_id) REFERENCES irrigation_equipment(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS irrigation_assignments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT UNSIGNED NOT NULL,
    field_id INT UNSIGNED NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (equipment_id) REFERENCES irrigation_equipment(id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
