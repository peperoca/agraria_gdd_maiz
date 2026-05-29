-- Phase 7: Farm & Field Sharing
-- Run once to create the shares table

CREATE TABLE IF NOT EXISTS shares (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    entity_type ENUM('farm','field') NOT NULL,
    entity_id INT UNSIGNED NOT NULL,
    owner_id INT UNSIGNED NOT NULL,
    shared_with_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_share (entity_type, entity_id, shared_with_id),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_with_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_shared_with (shared_with_id, entity_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
