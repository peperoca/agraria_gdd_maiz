-- Phase 3 Migration: Field Polygon
-- Run this in phpMyAdmin AFTER Phase 2 migration

ALTER TABLE fields ADD COLUMN polygon JSON DEFAULT NULL AFTER crop_type;
