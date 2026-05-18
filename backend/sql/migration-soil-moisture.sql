-- Sentinel-1 Soil Moisture: relative SM from SAR backscatter + NDVI vegetation correction

CREATE TABLE IF NOT EXISTS soil_moisture_readings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    field_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    vv_db DECIMAL(7,3) DEFAULT NULL,
    vh_db DECIMAL(7,3) DEFAULT NULL,
    vv_raw_db DECIMAL(7,3) DEFAULT NULL,
    ndvi_used DECIMAL(5,4) DEFAULT NULL,
    sm_relative DECIMAL(5,2) DEFAULT NULL,
    vv_dry DECIMAL(7,3) DEFAULT NULL,
    vv_wet DECIMAL(7,3) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_field_date (field_id, date),
    INDEX idx_field_sm (field_id, date),
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
