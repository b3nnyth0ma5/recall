
-- Add columns to store OCR results and image explanation
ALTER TABLE recall_images 
ADD COLUMN IF NOT EXISTS ocr_text TEXT,
ADD COLUMN IF NOT EXISTS image_explanation TEXT,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Create an index on processed_at for efficient querying
CREATE INDEX IF NOT EXISTS idx_recall_images_processed_at ON recall_images(processed_at);

-- Create a function to trigger the OCR edge function
CREATE OR REPLACE FUNCTION trigger_ocr_processing()
RETURNS TRIGGER AS $$
DECLARE
  function_url TEXT;
  payload JSON;
  response TEXT;
BEGIN
  -- Only process if the image hasn't been processed yet
  IF NEW.processed_at IS NULL THEN
    -- Get the Supabase project URL
    function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/ocr-image';
    
    -- Prepare the payload
    payload := json_build_object('record', row_to_json(NEW));
    
    -- Call the edge function asynchronously using pg_net extension
    -- Note: This requires the pg_net extension to be enabled
    PERFORM
      net.http_post(
        url := function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := payload::jsonb
      );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_image_insert_trigger_ocr ON recall_images;
CREATE TRIGGER on_image_insert_trigger_ocr
  AFTER INSERT ON recall_images
  FOR EACH ROW
  EXECUTE FUNCTION trigger_ocr_processing();

-- Add a comment to document the trigger
COMMENT ON TRIGGER on_image_insert_trigger_ocr ON recall_images IS 
  'Automatically triggers OCR processing when a new image is inserted';
