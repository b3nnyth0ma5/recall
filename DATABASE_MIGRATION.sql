
-- ============================================================================
-- DEPRECATED: This migration file is outdated
-- ============================================================================
-- The recall_images table now uses cdn_url instead of image_data.
-- All images are stored in Cloudflare CDN, not in the database.
-- 
-- Current schema:
-- - cdn_url (TEXT): Cloudflare CDN URL for the image
-- - image_data field has been removed
-- 
-- For the current schema, see the Supabase dashboard or run:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'recall_images';
-- ============================================================================

-- ============================================================================
-- OCR Image Processing - Complete Database Setup (LEGACY)
-- ============================================================================
-- This migration ensures the recall_images table has all necessary columns
-- for OCR text extraction and AI-powered image explanations.
--
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/cesmsdnblkdjkskmiqib/sql
-- ============================================================================

-- Step 1: Ensure the recalls table exists (parent table)
CREATE TABLE IF NOT EXISTS recalls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location TEXT
);

-- Enable RLS on recalls table
ALTER TABLE recalls ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for recalls if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'recalls' AND policyname = 'Users can view their own recalls'
  ) THEN
    CREATE POLICY "Users can view their own recalls" 
      ON recalls FOR SELECT 
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'recalls' AND policyname = 'Users can insert their own recalls'
  ) THEN
    CREATE POLICY "Users can insert their own recalls" 
      ON recalls FOR INSERT 
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'recalls' AND policyname = 'Users can update their own recalls'
  ) THEN
    CREATE POLICY "Users can update their own recalls" 
      ON recalls FOR UPDATE 
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'recalls' AND policyname = 'Users can delete their own recalls'
  ) THEN
    CREATE POLICY "Users can delete their own recalls" 
      ON recalls FOR DELETE 
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Step 2: Create or update the recall_images table
-- NOTE: Modern schema uses cdn_url instead of image_data
CREATE TABLE IF NOT EXISTS recall_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_id UUID NOT NULL REFERENCES recalls(id) ON DELETE CASCADE,
  cdn_url TEXT, -- Cloudflare CDN URL (replaces image_data)
  content_type TEXT DEFAULT 'image/jpeg',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ocr_text TEXT,
  image_explanation TEXT,
  processed_at TIMESTAMPTZ
);

-- Add OCR columns if they don't exist (for existing tables)
DO $$ 
BEGIN
  -- Add cdn_url column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'recall_images' AND column_name = 'cdn_url'
  ) THEN
    ALTER TABLE recall_images ADD COLUMN cdn_url TEXT;
    COMMENT ON COLUMN recall_images.cdn_url IS 'Cloudflare CDN URL for the image';
  END IF;

  -- Add ocr_text column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'recall_images' AND column_name = 'ocr_text'
  ) THEN
    ALTER TABLE recall_images ADD COLUMN ocr_text TEXT;
    COMMENT ON COLUMN recall_images.ocr_text IS 'Extracted text from the image using OCR';
  END IF;
  
  -- Add image_explanation column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'recall_images' AND column_name = 'image_explanation'
  ) THEN
    ALTER TABLE recall_images ADD COLUMN image_explanation TEXT;
    COMMENT ON COLUMN recall_images.image_explanation IS 'AI-generated explanation of the image content (under 120 words)';
  END IF;
  
  -- Add processed_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'recall_images' AND column_name = 'processed_at'
  ) THEN
    ALTER TABLE recall_images ADD COLUMN processed_at TIMESTAMPTZ;
    COMMENT ON COLUMN recall_images.processed_at IS 'Timestamp when the image was processed by the OCR edge function';
  END IF;
END $$;

-- Step 3: Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_recall_images_recall_id 
  ON recall_images(recall_id);

CREATE INDEX IF NOT EXISTS idx_recall_images_user_id 
  ON recall_images(user_id);

CREATE INDEX IF NOT EXISTS idx_recall_images_processed_at 
  ON recall_images(processed_at);

CREATE INDEX IF NOT EXISTS idx_recall_images_created_at 
  ON recall_images(created_at);

-- Index for finding unprocessed images
CREATE INDEX IF NOT EXISTS idx_recall_images_unprocessed 
  ON recall_images(created_at) 
  WHERE processed_at IS NULL;

-- Step 4: Enable Row Level Security
ALTER TABLE recall_images ENABLE ROW LEVEL SECURITY;

-- Step 5: Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own images" ON recall_images;
DROP POLICY IF EXISTS "Users can insert their own images" ON recall_images;
DROP POLICY IF EXISTS "Users can update their own images" ON recall_images;
DROP POLICY IF EXISTS "Users can delete their own images" ON recall_images;

-- Step 6: Create RLS policies
CREATE POLICY "Users can view their own images" 
  ON recall_images FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own images" 
  ON recall_images FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own images" 
  ON recall_images FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own images" 
  ON recall_images FOR DELETE 
  USING (auth.uid() = user_id);

-- Step 7: Add helpful comments
COMMENT ON TABLE recall_images IS 'Stores images associated with recalls/notes with OCR and AI analysis';
COMMENT ON COLUMN recall_images.id IS 'Unique identifier for the image record';
COMMENT ON COLUMN recall_images.recall_id IS 'Foreign key to the parent recall/note';
COMMENT ON COLUMN recall_images.cdn_url IS 'Cloudflare CDN URL for the image';
COMMENT ON COLUMN recall_images.content_type IS 'MIME type of the image (e.g., image/jpeg, image/png)';
COMMENT ON COLUMN recall_images.user_id IS 'Foreign key to the user who owns this image';
COMMENT ON COLUMN recall_images.created_at IS 'Timestamp when the image was uploaded';

-- Step 8: Create a view for easy querying of processed images
CREATE OR REPLACE VIEW processed_images_view AS
SELECT 
  ri.id,
  ri.recall_id,
  ri.user_id,
  ri.content_type,
  ri.cdn_url,
  ri.created_at,
  ri.processed_at,
  ri.ocr_text,
  ri.image_explanation,
  CASE 
    WHEN ri.processed_at IS NOT NULL THEN 'completed'
    WHEN ri.created_at > NOW() - INTERVAL '5 minutes' THEN 'processing'
    ELSE 'failed'
  END as processing_status,
  LENGTH(ri.ocr_text) as ocr_text_length,
  LENGTH(ri.image_explanation) as explanation_length
FROM recall_images ri;

-- Grant access to the view
GRANT SELECT ON processed_images_view TO authenticated;

-- Step 9: Create a function to get unprocessed images count
CREATE OR REPLACE FUNCTION get_unprocessed_images_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM recall_images
  WHERE user_id = p_user_id
    AND processed_at IS NULL
    AND created_at > NOW() - INTERVAL '1 hour'; -- Only count recent uploads
  
  RETURN v_count;
END;
$$;

-- Step 10: Create a function to clean up old unprocessed images
CREATE OR REPLACE FUNCTION cleanup_failed_ocr_processing()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Mark images as failed if they haven't been processed within 10 minutes
  UPDATE recall_images
  SET 
    ocr_text = 'Processing failed - please retry',
    image_explanation = 'This image could not be processed automatically.',
    processed_at = NOW()
  WHERE 
    processed_at IS NULL
    AND created_at < NOW() - INTERVAL '10 minutes'
  RETURNING COUNT(*) INTO v_deleted_count;
  
  RETURN v_deleted_count;
END;
$$;

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- Run these to verify the migration was successful:

-- Check table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'recall_images' 
ORDER BY ordinal_position;

-- Check indexes
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'recall_images';

-- Check RLS policies
SELECT 
  policyname, 
  cmd, 
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'recall_images';

-- Check for unprocessed images
SELECT 
  COUNT(*) as unprocessed_count,
  MIN(created_at) as oldest_unprocessed
FROM recall_images 
WHERE processed_at IS NULL;

-- Check processing statistics
SELECT 
  COUNT(*) as total_images,
  COUNT(processed_at) as processed_images,
  COUNT(*) - COUNT(processed_at) as unprocessed_images,
  ROUND(AVG(LENGTH(ocr_text))) as avg_ocr_length,
  ROUND(AVG(LENGTH(image_explanation))) as avg_explanation_length
FROM recall_images;

-- ============================================================================
-- Success!
-- ============================================================================
-- Your database is now ready for OCR image processing with Cloudflare CDN.
-- Next steps:
-- 1. Deploy the edge function: supabase functions deploy ocr-image
-- 2. Set the OPENAI_API_KEY secret in your Supabase dashboard
-- 3. Set the Cloudflare credentials in your Supabase dashboard
-- 4. Test by uploading an image through your app
-- ============================================================================
