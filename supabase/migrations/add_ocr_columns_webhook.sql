
-- Add columns to store OCR results and image explanation
ALTER TABLE recall_images 
ADD COLUMN IF NOT EXISTS ocr_text TEXT,
ADD COLUMN IF NOT EXISTS image_explanation TEXT,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Create an index on processed_at for efficient querying
CREATE INDEX IF NOT EXISTS idx_recall_images_processed_at ON recall_images(processed_at);

-- Add a comment to the table
COMMENT ON COLUMN recall_images.ocr_text IS 'Extracted text from the image using OCR';
COMMENT ON COLUMN recall_images.image_explanation IS 'AI-generated explanation of the image content (under 120 words)';
COMMENT ON COLUMN recall_images.processed_at IS 'Timestamp when the image was processed by the OCR edge function';
