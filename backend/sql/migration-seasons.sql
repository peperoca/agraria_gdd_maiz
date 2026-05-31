-- Phase 11: Field/Season Split — Multiple crop seasons per physical field
-- Run this migration on the production database

-- 1. Create seasons table
CREATE TABLE IF NOT EXISTS seasons (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    field_id INT UNSIGNED NOT NULL,
    crop_type VARCHAR(30) NOT NULL DEFAULT 'corn',
    sowing_date DATE NOT NULL,
    end_date DATE DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_field_sowing (field_id, sowing_date),
    INDEX idx_field_active (field_id, is_active),
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Migrate existing field crop data → seasons (one season per existing field)
INSERT IGNORE INTO seasons (field_id, crop_type, sowing_date, is_active)
SELECT id, COALESCE(crop_type, 'corn'), sowing_date, 1
FROM fields
WHERE sowing_date IS NOT NULL;

-- 3. Add season_id to satellite/override tables for scoping
ALTER TABLE ndvi_readings ADD COLUMN season_id INT UNSIGNED DEFAULT NULL;
ALTER TABLE soil_moisture_readings ADD COLUMN season_id INT UNSIGNED DEFAULT NULL;
ALTER TABLE field_daily_overrides ADD COLUMN season_id INT UNSIGNED DEFAULT NULL;

-- 4. Backfill season_id from field_id (all existing data belongs to the active season)
UPDATE ndvi_readings nr
JOIN seasons s ON s.field_id = nr.field_id AND s.is_active = 1
SET nr.season_id = s.id;

UPDATE soil_moisture_readings sm
JOIN seasons s ON s.field_id = sm.field_id AND s.is_active = 1
SET sm.season_id = s.id;

UPDATE field_daily_overrides fo
JOIN seasons s ON s.field_id = fo.field_id AND s.is_active = 1
SET fo.season_id = s.id;

-- Note: fields.sowing_date and fields.crop_type columns remain for backward compatibility
-- They can be dropped in a future cleanup migration
