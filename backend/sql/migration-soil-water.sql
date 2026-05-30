-- Phase 8: Soil Water Balance — CONEAT soil data + field water parameters
-- Run this migration on the production database before deploying

-- Pre-processed CONEAT soil polygons (188 groups, GeoJSON in WGS84)
CREATE TABLE IF NOT EXISTS coneat_soils (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    gc_code VARCHAR(10) NOT NULL,
    geometry JSON NOT NULL,
    mm DECIMAL(6,2) NOT NULL,
    apdn DECIMAL(6,2) NOT NULL,
    ip INT UNSIGNED NOT NULL DEFAULT 0,
    UNIQUE KEY uq_gc (gc_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add soil/water balance columns to fields
ALTER TABLE fields ADD COLUMN taw_mm DECIMAL(7,2) DEFAULT NULL;
ALTER TABLE fields ADD COLUMN mad_pct DECIMAL(5,2) DEFAULT NULL;
ALTER TABLE fields ADD COLUMN taw_source ENUM('coneat_mm','coneat_apdn','manual') DEFAULT NULL;
ALTER TABLE fields ADD COLUMN coneat_gc VARCHAR(10) DEFAULT NULL;
ALTER TABLE fields ADD COLUMN initial_asw_mm DECIMAL(7,2) DEFAULT NULL;
