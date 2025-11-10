
# Deploy OCR Edge Function - Step by Step Guide

## Overview
This guide will help you deploy the enhanced OCR edge function that uses OpenAI's Vision API to perform OCR and generate image explanations.

## Prerequisites
1. Supabase CLI installed (`npm install -g supabase`)
2. Supabase project ID: `cesmsdnblkdjkskmiqib`
3. OpenAI API key

## Step 1: Set Environment Variables

In your Supabase dashboard, go to **Project Settings > Edge Functions** and add the following secret:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

The following are automatically available:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Step 2: Ensure Database Schema is Correct

Run this SQL in your Supabase SQL Editor:

```sql
-- Ensure recall_images table has OCR columns
ALTER TABLE recall_images 
ADD COLUMN IF NOT EXISTS ocr_text TEXT,
ADD COLUMN IF NOT EXISTS image_explanation TEXT,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_recall_images_processed_at ON recall_images(processed_at);
CREATE INDEX IF NOT EXISTS idx_recall_images_recall_id ON recall_images(recall_id);

-- Add helpful comments
COMMENT ON COLUMN recall_images.ocr_text IS 'Extracted text from the image using OCR';
COMMENT ON COLUMN recall_images.image_explanation IS 'AI-generated explanation of the image content (under 120 words)';
COMMENT ON COLUMN recall_images.processed_at IS 'Timestamp when the image was processed by the OCR edge function';
```

## Step 3: Deploy the Edge Function

From your project root directory, run:

```bash
# Login to Supabase (if not already logged in)
supabase login

# Link to your project
supabase link --project-ref cesmsdnblkdjkskmiqib

# Deploy the edge function
supabase functions deploy ocr-image --no-verify-jwt
```

The `--no-verify-jwt` flag is important because this function is called by database webhooks, not directly by authenticated users.

## Step 4: Test the Edge Function

You can test the function manually:

```bash
curl -i --location --request POST 'https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/ocr-image' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"record":{"id":"YOUR_IMAGE_ID"}}'
```

Or test from the Supabase dashboard:
1. Go to **Edge Functions** > **ocr-image**
2. Click **Invoke Function**
3. Use this test payload:
```json
{
  "record": {
    "id": "your-test-image-id-here"
  }
}
```

## Step 5: Set Up Automatic Triggering (Optional)

If you want the function to run automatically when images are uploaded, you can set up a database webhook:

1. Go to **Database** > **Webhooks** in Supabase dashboard
2. Click **Create a new hook**
3. Configure:
   - **Name**: `trigger-ocr-on-image-insert`
   - **Table**: `recall_images`
   - **Events**: `INSERT`
   - **Type**: `HTTP Request`
   - **Method**: `POST`
   - **URL**: `https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/ocr-image`
   - **Headers**: 
     ```
     Content-Type: application/json
     Authorization: Bearer YOUR_SERVICE_ROLE_KEY
     ```
   - **Body**: 
     ```json
     {
       "record": {
         "id": "{{ record.id }}",
         "recall_id": "{{ record.recall_id }}",
         "user_id": "{{ record.user_id }}"
       }
     }
     ```

## Step 6: Monitor Function Logs

View logs in real-time:

```bash
supabase functions logs ocr-image --follow
```

Or view in the Supabase dashboard:
1. Go to **Edge Functions** > **ocr-image**
2. Click **Logs** tab

## Troubleshooting

### Function not deploying
- Ensure you're logged in: `supabase login`
- Ensure project is linked: `supabase link --project-ref cesmsdnblkdjkskmiqib`
- Check for TypeScript errors in the function code

### OpenAI API errors
- Verify your API key is set correctly in Edge Function secrets
- Check your OpenAI account has sufficient credits
- Review rate limits on your OpenAI account

### Database errors
- Ensure the `recall_images` table exists
- Verify RLS policies allow the service role to update records
- Check that the image_id exists in the database

### No results appearing
- Check the function logs for errors
- Verify the `processed_at` timestamp is being set
- Ensure the image data is valid base64

## Cost Optimization

The function uses `gpt-4o-mini` which is cost-effective:
- ~$0.00015 per image (150 tokens input + 300 tokens output)
- For 1000 images: ~$0.15

To reduce costs further:
- Adjust `max_tokens` to 300 if explanations can be shorter
- Use `detail: 'low'` instead of `'high'` for smaller images
- Implement caching to avoid reprocessing the same images

## Security Notes

- The function uses the service role key to bypass RLS when updating records
- Never expose the service role key in client-side code
- The function validates all inputs before processing
- CORS is configured to allow requests from any origin (adjust if needed)

## Next Steps

After deployment:
1. Test with a real image upload from the app
2. Monitor the logs for any errors
3. Check the database to verify OCR results are being saved
4. Adjust the prompt in the function if needed for better results
