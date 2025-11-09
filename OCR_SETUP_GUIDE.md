
# OCR Image Processing Setup Guide

This guide explains how to set up and use the OCR image processing feature that automatically extracts text and generates explanations for images uploaded to the app.

## Overview

When an image is uploaded to the `recall_images` table, a Supabase Edge Function is triggered that:
1. Uses OpenAI's Vision API (GPT-4 Vision) to perform OCR on the image
2. Generates a concise explanation of the image content (under 120 words)
3. Stores the results back in the database

## Setup Instructions

### 1. Deploy the Edge Function

Deploy the OCR edge function to your Supabase project:

```bash
# Navigate to your project directory
cd supabase/functions

# Deploy the function
supabase functions deploy ocr-image --project-ref cesmsdnblkdjkskmiqib
```

### 2. Set Environment Variables

The edge function requires an OpenAI API key. Set it in your Supabase project:

```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here --project-ref cesmsdnblkdjkskmiqib
```

You can get an OpenAI API key from: https://platform.openai.com/api-keys

### 3. Apply Database Migration

Apply the migration to add the necessary columns to the `recall_images` table:

```bash
# Using Supabase CLI
supabase db push --project-ref cesmsdnblkdjkskmiqib
```

Or manually run the SQL from `supabase/migrations/add_ocr_columns_webhook.sql` in the Supabase SQL Editor.

### 4. Set Up Database Webhook (Recommended)

To automatically trigger OCR processing when images are uploaded:

1. Go to your Supabase Dashboard
2. Navigate to Database → Webhooks
3. Create a new webhook with:
   - **Name**: `ocr-image-processing`
   - **Table**: `recall_images`
   - **Events**: `INSERT`
   - **Type**: `HTTP Request`
   - **Method**: `POST`
   - **URL**: `https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/ocr-image`
   - **Headers**: 
     - `Content-Type`: `application/json`
     - `Authorization`: `Bearer [YOUR_SERVICE_ROLE_KEY]`
   - **Payload**: 
     ```json
     {
       "record": {
         "id": "{{ record.id }}"
       }
     }
     ```

## Usage

### Automatic Processing

Once the webhook is set up, OCR processing happens automatically when images are uploaded. The results are stored in:
- `ocr_text`: Extracted text from the image
- `image_explanation`: AI-generated explanation (under 120 words)
- `processed_at`: Timestamp when processing completed

### Manual Processing

You can also manually trigger OCR processing for an image:

```typescript
import { triggerOCRProcessing, getImageOCRResults } from '@/utils/supabase';

// Trigger OCR processing
const result = await triggerOCRProcessing(imageId);

if (result.success) {
  console.log('OCR processing started');
  
  // Wait a few seconds for processing to complete
  setTimeout(async () => {
    const ocrResults = await getImageOCRResults(imageId);
    if (ocrResults) {
      console.log('OCR Text:', ocrResults.ocrText);
      console.log('Explanation:', ocrResults.explanation);
    }
  }, 5000);
}
```

### Displaying OCR Results

You can display OCR results in your note cards or image viewers:

```typescript
const { data: imageRecord } = await supabase
  .from('recall_images')
  .select('*')
  .eq('id', imageId)
  .single();

if (imageRecord?.ocr_text) {
  console.log('Extracted text:', imageRecord.ocr_text);
}

if (imageRecord?.image_explanation) {
  console.log('Explanation:', imageRecord.image_explanation);
}
```

## Cost Considerations

- OpenAI Vision API costs approximately $0.01 per image (for gpt-4o-mini model)
- Consider implementing rate limiting or user quotas for production use
- Monitor your OpenAI API usage in the OpenAI dashboard

## Troubleshooting

### Check Edge Function Logs

View logs for the OCR function:

```bash
supabase functions logs ocr-image --project-ref cesmsdnblkdjkskmiqib
```

Or in the Supabase Dashboard: Edge Functions → ocr-image → Logs

### Common Issues

1. **"OpenAI API key not configured"**
   - Make sure you've set the OPENAI_API_KEY secret
   - Verify the secret is set: `supabase secrets list --project-ref cesmsdnblkdjkskmiqib`

2. **"Failed to fetch image data"**
   - Ensure the image was uploaded successfully to the database
   - Check that the `image_data` column contains valid base64 data

3. **Webhook not triggering**
   - Verify the webhook is enabled in the Supabase Dashboard
   - Check that the webhook URL is correct
   - Ensure the Authorization header includes your service role key

## API Reference

### Edge Function Endpoint

**POST** `https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/ocr-image`

**Request Body:**
```json
{
  "record": {
    "id": "image-id-here"
  }
}
```

**Response:**
```json
{
  "success": true,
  "imageId": "image-id-here",
  "ocrText": "Extracted text preview...",
  "explanation": "Image explanation preview..."
}
```

## Database Schema

The `recall_images` table includes these OCR-related columns:

```sql
CREATE TABLE recall_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recall_id UUID REFERENCES recalls(id) ON DELETE CASCADE,
  image_data TEXT NOT NULL,
  content_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ocr_text TEXT,
  image_explanation TEXT,
  processed_at TIMESTAMPTZ
);
```
