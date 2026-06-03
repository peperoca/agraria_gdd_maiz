-- Migration: Add station change tracking columns to fields
-- Run on cPanel phpMyAdmin

ALTER TABLE fields
  ADD COLUMN previous_station_mac VARCHAR(20) DEFAULT NULL AFTER station_mac,
  ADD COLUMN station_changed_at DATE DEFAULT NULL AFTER previous_station_mac;
