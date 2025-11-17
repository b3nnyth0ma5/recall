
# Embed Null Images - One-Time Script Guide

## Overview

This guide explains how to run the one-time script to generate embeddings for all `recall_images` records where `recall_image_embedding` is NULL.

## Current Status

- **Total images with NULL embeddings**: 72 images
- **Edge Function**: `embedding-image` (already deployed)
- **Utility Functions**: `embedNullImages()` and `embedNullImagesInBatches()` (already implemented)
- **Admin Screen**: `app/admin-embed-images.tsx` (already created)

## How to Run the Script

### Option 1: Using the Admin Screen (Recommended)

1. **Navigate to the Admin Screen**:
   - In your app, navigate to `/admin-embed-images`
   - You can do this by adding a temporary button in your app or directly typing the URL

2. **Choose Processing Mode**:
   - **Process All Images**: Processes all 72 images in one go
   - **Process in Batches**: Processes images in batches of 10 (recommended for stability)

3. **Monitor Progress**:
   - The screen will show a loading indicator while processing
   - Check the console logs for detailed progress
   - Each image will be logged with its status (Success, Failed, or Skipped)

4. **Review Results**:
   - After completion, you'll see a summary with:
     - Total Processed
     - Successful
     - Failed
     - Skipped
   - Detailed results for each image with error messages (if any)

### Option 2: Using the Console (Alternative)

If you prefer to run the script directly from the console:

```typescript
import { embedNullImages } from '@/utils/embedNullImages';

// Run the script
const result = await embedNullImages();
console.log('Results:', result);
```

Or for batch processing:

```typescript
import { embedNullImagesInBatches } from '@/utils/embedNullImages';

// Run in batches of 10
const result = await embedNullImagesInBatches(10);
console.log('Results:', result);
```

## What the Script Does

1. **Fetches Images**: Queries `recall_images` table for all records where `recall_image_embedding IS NULL`

2. **Validates Content**: For each image, checks if there's text content to embed:
   - Concatenates `ocr_text` and `image_explanation`
   - Skips images with no text content

3. **Invokes Edge Function**: Calls the `embedding-image` edge function with:
   ```json
   {
     "recall_image_id": "uuid",
     "ocr_text": "extracted text",
     "image_explanation": "AI explanation"
   }
   ```

4. **Stores Embeddings**: The edge function:
   - Calls OpenAI's `text-embedding-3-small` model
   - Uses `base64` encoding format
   - Decodes and stores the embedding in `recall_images.recall_image_embedding`

5. **Handles Errors**: Comprehensive error handling for:
   - Network failures
   - API rate limits (with automatic retry)
   - Invalid data
   - Database errors

## Processing Details

### Single Mode (`embedNullImages`)
- Processes all images sequentially
- 500ms delay between each image
- Best for: Small to medium datasets (< 50 images)
- Estimated time: ~72 images × 2-3 seconds = 2-4 minutes

### Batch Mode (`embedNullImagesInBatches`)
- Processes images in configurable batches (default: 10)
- 500ms delay between images, 2 seconds between batches
- Best for: Large datasets or when you want more control
- Estimated time: ~72 images × 2-3 seconds = 2-4 minutes

## Expected Results

For each image, you'll see one of three outcomes:

1. **Success**: Embedding generated and stored successfully
   - Status: ✅ SUCCESS
   - Includes: Processing time, embedding dimensions (1536)

2. **Skipped**: Image already has an embedding or no text content
   - Status: ⏭️ SKIPPED
   - Reason: "Embedding already exists" or "No text content available"

3. **Failed**: Error occurred during processing
   - Status: ❌ FAILED
   - Includes: Error message for debugging

## Troubleshooting

### Issue: "No text content available"
- **Cause**: Both `ocr_text` and `image_explanation` are NULL or empty
- **Solution**: These images need OCR processing first. Run the OCR edge function for these images.

### Issue: "OpenAI API request failed"
- **Cause**: Rate limiting or API key issues
- **Solution**: The script has automatic retry logic. If it persists, check:
  - OpenAI API key is valid
  - Account has sufficient credits
  - Wait a few minutes and try again

### Issue: "Failed to update database with embedding"
- **Cause**: Database connection or permission issues
- **Solution**: Check:
  - Supabase connection is active
  - Service role key has proper permissions
  - Database is not under maintenance

## Verification

After running the script, verify the results:

```sql
-- Check how many images still have NULL embeddings
SELECT COUNT(*) as null_embedding_count 
FROM recall_images 
WHERE recall_image_embedding IS NULL;

-- Check how many images now have embeddings
SELECT COUNT(*) as embedded_count 
FROM recall_images 
WHERE recall_image_embedding IS NOT NULL;

-- View sample embeddings
SELECT id, 
       ocr_text, 
       image_explanation,
       array_length(recall_image_embedding, 1) as embedding_dimensions
FROM recall_images 
WHERE recall_image_embedding IS NOT NULL
LIMIT 5;
```

## Important Notes

1. **One-Time Script**: This script is designed to be run once to backfill embeddings for existing images. New images will automatically get embeddings through the OCR pipeline.

2. **Idempotent**: The script is safe to run multiple times. It will skip images that already have embeddings.

3. **Cost**: Each embedding costs approximately $0.00002 (OpenAI text-embedding-3-small pricing). For 72 images, total cost ≈ $0.0014.

4. **Performance**: The script includes delays to avoid overwhelming the edge function and OpenAI API. Don't remove these delays.

5. **Monitoring**: Always monitor the console logs for detailed progress and any errors.

## Next Steps

After running this script:

1. **Verify Results**: Check that all images have embeddings (see Verification section)

2. **Test Search**: Try searching for images using the search functionality to ensure embeddings are working

3. **Monitor New Images**: Ensure new images automatically get embeddings through the OCR pipeline

4. **Clean Up**: You can optionally remove the admin screen after running the script once

## File Locations

- **Admin Screen**: `app/admin-embed-images.tsx`
- **Utility Functions**: `utils/embedNullImages.ts`
- **Edge Function**: `supabase/functions/embedding-image/index.ts`
- **Supabase Utils**: `utils/supabase.ts`

## Support

If you encounter any issues:

1. Check the console logs for detailed error messages
2. Review the edge function logs in Supabase dashboard
3. Verify the OpenAI API key is configured correctly
4. Ensure the database schema matches expectations

---

**Last Updated**: January 2025
**Status**: Ready to run
**Estimated Time**: 2-4 minutes for 72 images
