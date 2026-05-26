-- Migration: Add serial_number and report_url to irrigation_equipment table
-- The irrigation_equipment, irrigation_readings, and irrigation_assignments tables
-- were already created in migration-phase2.sql. This adds AgSense-specific columns.

ALTER TABLE irrigation_equipment
  ADD COLUMN serial_number VARCHAR(50) DEFAULT NULL AFTER name,
  ADD COLUMN report_url TEXT DEFAULT NULL AFTER serial_number;
