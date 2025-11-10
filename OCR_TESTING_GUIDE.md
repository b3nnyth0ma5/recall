
# OCR Edge Function Testing Guide

This guide will help you test the OCR edge function to ensure it's working correctly.

## Prerequisites

1. ✅ Database migration completed (run `DATABASE_MIGRATION.sql`)
2. ✅ Edge function deployed (`supabase functions deploy ocr-image`)
3. ✅ `OPENAI_API_KEY` environment variable set in Supabase Edge Functions secrets
4. ✅ At least one test image uploaded to the `recall_images` table

## Testing Methods

### Method 1: Test via App (Recommended)

This is the most realistic test as it simulates actual user behavior.

1. **Open the app** and log in
2. **Create a new note** or edit an existing one
3. **Add an image** that contains text (e.g., a photo of a document, sign, or book page)
4. **Save the note**
5. **Wait 2-5 seconds** for processing
6. **View the note** - you should see the OCR results displayed

**Expected Result:**
- The image should display normally
- Below the image, you should see:
  - "Extracted Text" section with the OCR results
  - "AI Explanation" section with a description of the image
  - Processing timestamp

### Method 2: Test via Supabase Dashboard

1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/cesmsdnblkdjkskmiqib
2. Navigate to **Edge Functions** > **ocr-image**
3. Click **Invoke Function**
4. Use this test payload (replace `YOUR_IMAGE_ID` with an actual image ID from your database):

```json
{
  "record": {
    "id": "YOUR_IMAGE_ID"
  }
}
```

5. Click **Invoke**

**Expected Response:**
```json
{
  "success": true,
  "imageId": "YOUR_IMAGE_ID",
  "processingTimeMs": 2500,
  "ocrTextLength": 150,
  "explanationLength": 95,
  "ocrTextPreview": "This is the extracted text from the image...",
  "explanationPreview": "The image shows a document with text..."
}
```

### Method 3: Test via cURL

```bash
# Replace YOUR_ANON_KEY and YOUR_IMAGE_ID with actual values
curl -i --location --request POST \
  'https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/ocr-image' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "record": {
      "id": "YOUR_IMAGE_ID"
    }
  }'
```

**Expected Response:**
```
HTTP/2 200
content-type: application/json

{"success":true,"imageId":"...","processingTimeMs":2500,...}
```

### Method 4: Test via SQL

You can manually trigger processing and check results using SQL:

```sql
-- 1. Find an image to test
SELECT id, recall_id, created_at, processed_at 
FROM recall_images 
WHERE processed_at IS NULL 
LIMIT 1;

-- 2. Check the current state
SELECT 
  id,
  ocr_text,
  image_explanation,
  processed_at
FROM recall_images 
WHERE id = 'YOUR_IMAGE_ID';

-- 3. After triggering via app or API, verify the results
SELECT 
  id,
  LENGTH(ocr_text) as ocr_length,
  LENGTH(image_explanation) as explanation_length,
  processed_at,
  created_at,
  EXTRACT(EPOCH FROM (processed_at - created_at)) as processing_seconds
FROM recall_images 
WHERE id = 'YOUR_IMAGE_ID';
```

## Monitoring and Debugging

### View Edge Function Logs

**Via CLI:**
```bash
supabase functions logs ocr-image --follow
```

**Via Dashboard:**
1. Go to **Edge Functions** > **ocr-image**
2. Click the **Logs** tab
3. Set time range to "Last hour"

### Check for Errors

```sql
-- Find images that failed to process (older than 10 minutes, no processed_at)
SELECT 
  id,
  recall_id,
  created_at,
  NOW() - created_at as age
FROM recall_images 
WHERE processed_at IS NULL 
  AND created_at < NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
```

### View Processing Statistics

```sql
-- Overall statistics
SELECT 
  COUNT(*) as total_images,
  COUNT(processed_at) as processed,
  COUNT(*) - COUNT(processed_at) as unprocessed,
  ROUND(100.0 * COUNT(processed_at) / COUNT(*), 2) as success_rate,
  AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_seconds
FROM recall_images;

-- Recent processing activity
SELECT 
  DATE_TRUNC('hour', processed_at) as hour,
  COUNT(*) as images_processed,
  AVG(LENGTH(ocr_text)) as avg_ocr_length,
  AVG(LENGTH(image_explanation)) as avg_explanation_length
FROM recall_images 
WHERE processed_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', processed_at)
ORDER BY hour DESC;
```

## Common Issues and Solutions

### Issue 1: "OpenAI API key not configured"

**Solution:**
1. Go to Supabase Dashboard > Project Settings > Edge Functions
2. Add secret: `OPENAI_API_KEY` with your OpenAI API key
3. Redeploy the function: `supabase functions deploy ocr-image`

### Issue 2: "Failed to fetch image data from database"

**Solution:**
- Verify the image ID exists: `SELECT * FROM recall_images WHERE id = 'YOUR_IMAGE_ID'`
- Check RLS policies allow reading: `SELECT * FROM pg_policies WHERE tablename = 'recall_images'`
- Ensure the image_data column is not null

### Issue 3: Images not processing automatically

**Solution:**
1. Check if automatic triggering is set up (database webhook or trigger)
2. Manually trigger for now: Use the `triggerOCRProcessing()` function in the app
3. Set up a webhook in Supabase Dashboard > Database > Webhooks

### Issue 4: "Rate limit exceeded" from OpenAI

**Solution:**
- Wait a few minutes and retry
- Check your OpenAI account tier and rate limits
- Consider implementing a queue system for high-volume processing

### Issue 5: OCR results are empty or incorrect

**Solution:**
- Verify the image contains visible text
- Check image quality (resolution, clarity)
- Try with a different image
- Review the OpenAI API response in the logs

## Performance Benchmarks

Expected performance metrics:

| Metric | Expected Value |
|--------|---------------|
| Processing Time | 2-5 seconds |
| OCR Accuracy | 95%+ for clear text |
| Explanation Quality | Concise, under 120 words |
| Success Rate | 98%+ |
| Cost per Image | ~$0.00015 (gpt-4o-mini) |

## Test Images

Good test images should have:
- ✅ Clear, readable text
- ✅ Good lighting and contrast
- ✅ Reasonable resolution (at least 800x600)
- ✅ Common formats (JPEG, PNG)

Examples:
- Photo of a book page
- Screenshot of text
- Picture of a sign or menu
- Document scan
- Handwritten note (may have lower accuracy)

## Success Criteria

A successful test should show:

1. ✅ Function executes without errors
2. ✅ Processing completes within 5 seconds
3. ✅ OCR text is extracted (if text is present in image)
4. ✅ Explanation is generated (under 120 words)
5. ✅ `processed_at` timestamp is set in database
6. ✅ Results are visible in the app

## Next Steps After Testing

Once testing is successful:

1. **Enable automatic processing** via database webhook
2. **Monitor costs** in OpenAI dashboard
3. **Set up alerts** for failed processing
4. **Optimize prompts** if needed for better results
5. **Consider batch processing** for multiple images

## Support

If you encounter issues:

1. Check the edge function logs
2. Review the database for error patterns
3. Test with different images
4. Verify all environment variables are set
5. Ensure OpenAI account has sufficient credits

## Useful SQL Queries

```sql
-- Get the most recent OCR results
SELECT 
  id,
  SUBSTRING(ocr_text, 1, 100) as ocr_preview,
  SUBSTRING(image_explanation, 1, 100) as explanation_preview,
  processed_at
FROM recall_images 
WHERE processed_at IS NOT NULL
ORDER BY processed_at DESC
LIMIT 5;

-- Find images with long processing times
SELECT 
  id,
  created_at,
  processed_at,
  EXTRACT(EPOCH FROM (processed_at - created_at)) as processing_seconds
FROM recall_images 
WHERE processed_at IS NOT NULL
  AND EXTRACT(EPOCH FROM (processed_at - created_at)) > 10
ORDER BY processing_seconds DESC;

-- Count images by processing status
SELECT 
  CASE 
    WHEN processed_at IS NOT NULL THEN 'completed'
    WHEN created_at > NOW() - INTERVAL '5 minutes' THEN 'processing'
    ELSE 'failed'
  END as status,
  COUNT(*) as count
FROM recall_images
GROUP BY status;
```

Happy testing! 🚀
