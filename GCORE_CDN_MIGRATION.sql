
-- Gcore CDN Migration
-- This migration adds support for storing images on Gcore CDN
-- instead of base64 in the database

-- Add cdn_url column to store Gcore CDN URLs
ALTER TABLE recall_images 
ADD COLUMN IF NOT EXISTS cdn_url TEXT;

-- Add index for faster lookups when filtering by CDN URL
CREATE INDEX IF NOT EXISTS idx_recall_images_cdn_url 
ON recall_images(cdn_url) 
WHERE cdn_url IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN recall_images.cdn_url IS 'Gcore CDN URL for the image. If null, image_data contains base64 data (fallback).';

-- Note: We keep the image_data column for backward compatibility
-- and as a fallback if CDN upload fails
-- The app will prioritize cdn_url over image_data when both exist
