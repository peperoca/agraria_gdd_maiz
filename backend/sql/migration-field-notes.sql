-- Add notes column to fields
ALTER TABLE fields ADD COLUMN notes TEXT DEFAULT NULL;
ALTER TABLE fields ADD COLUMN notes_updated_at DATETIME DEFAULT NULL;

-- Field photos table
CREATE TABLE IF NOT EXISTS field_photos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    field_id INT UNSIGNED NOT NULL,
    filename VARCHAR(255) NOT NULL,
    caption VARCHAR(255) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE,
    INDEX idx_field (field_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
