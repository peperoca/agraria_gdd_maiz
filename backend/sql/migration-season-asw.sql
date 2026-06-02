-- Add per-season initial ASW so the water balance carries over between seasons
ALTER TABLE seasons ADD COLUMN initial_asw_mm DECIMAL(7,2) DEFAULT NULL AFTER is_active;
