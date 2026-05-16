-- Weather gap-fill records: stores estimated data for station blackouts
-- Both carry-forward and fallback-station data stored in parallel

CREATE TABLE IF NOT EXISTS weather_gap_fills (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    station_id INT UNSIGNED NOT NULL,
    dateutc BIGINT NOT NULL,
    source ENUM('carry_forward','fallback') NOT NULL,
    source_station_id INT UNSIGNED DEFAULT NULL,
    tempf DECIMAL(6,2) DEFAULT NULL,
    humidity DECIMAL(5,2) DEFAULT NULL,
    windspeedmph DECIMAL(6,2) DEFAULT NULL,
    solarradiation DECIMAL(8,2) DEFAULT NULL,
    baromrelin DECIMAL(6,4) DEFAULT NULL,
    dewpoint DECIMAL(6,2) DEFAULT NULL,
    dailyrainin DECIMAL(6,3) DEFAULT NULL,
    hourlyrainin DECIMAL(6,3) DEFAULT NULL,
    date_iso VARCHAR(30) NOT NULL,
    gap_date DATE NOT NULL,
    replaced_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_station_ts_source (station_id, dateutc, source),
    INDEX idx_station_gap (station_id, gap_date),
    INDEX idx_replaced (replaced_at),
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE,
    FOREIGN KEY (source_station_id) REFERENCES stations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Track which dates have been gap-filled and their status
CREATE TABLE IF NOT EXISTS weather_gap_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    station_id INT UNSIGNED NOT NULL,
    gap_date DATE NOT NULL,
    has_carry_forward TINYINT(1) NOT NULL DEFAULT 0,
    has_fallback TINYINT(1) NOT NULL DEFAULT 0,
    fallback_station_id INT UNSIGNED DEFAULT NULL,
    resolved_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_station_date (station_id, gap_date),
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
