-- Phase 9: Manual overrides for daily rain and irrigation per field
-- Run this migration on the production database before deploying

CREATE TABLE IF NOT EXISTS field_daily_overrides (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    field_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    rain_mm DECIMAL(7,2) DEFAULT NULL,
    irrigation_mm DECIMAL(7,2) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_field_date (field_id, date),
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
