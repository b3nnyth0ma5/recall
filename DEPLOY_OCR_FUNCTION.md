
# Deploying the OCR Edge Function

This document provides step-by-step instructions for deploying the OCR image processing edge function to your Supabase project.

## Prerequisites

1. Supabase CLI installed: https://supabase.com/docs/guides/cli
2. OpenAI API key: https://platform.openai.com/api-keys
3. Access to your Supabase project

## Deployment Steps

### Step 1: Login to Supabase CLI

```bash
supabase login
```

### Step 2: Link Your Project

```bash
supabase link --project-ref cesmsdnblkdjkskmiqib
```

### Step 3: Set OpenAI API Key

```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here --project-ref cesmsdnblkdjkskmiqib
```

Replace `your_openai_api_key_here` with your actual OpenAI API key.

### Step 4: Deploy the Edge Function

```bash
supabase functions deploy ocr-image --project-ref cesmsdnblkdjkskmiqib
```

### Step 5: Apply Database Migration

You have two options:

**Option A: Using Supabase CLI**
```bash
supabase db push --project-ref cesmsdnblkdjkskmiqib
```

**Option B: Using Supabase Dashboard**
1. Go to https://supabase.com/dashboard/project/cesmsdnblkdjkskmiqib/sql
2. Copy the contents of `supabase/migrations/add_ocr_columns_webhook.sql`
3. Paste and run the SQL

### Step 6: Set Up Database Webhook

1. Go to https://supabase.com/dashboard/project/cesmsdnblkdjkskmiqib/database/hooks
2. Click "Create a new hook"
3. Select "Database Webhook"
4. Configure:
   - **Name**: `ocr-image-processing`
   - **Schema**: `public`
   - **Table**: `recall_images`
   - **Events**: Check `INSERT`
   - **Type**: `HTTP Request`
   - **Method**: `POST`
   - **URL**: `https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/ocr-image`
   - **HTTP Headers**:
     ```
     Content-Type: application/json
     Authorization: Bearer [YOUR_SERVICE_ROLE_KEY]
     ```
     (Get your service role key from: Project Settings → API → service_role key)
   - **HTTP Params**: Leave empty
   - **Payload Template**:
     ```json
     {
       "record": {
         "id": "{{ record.id }}",
         "recall_id": "{{ record.recall_id }}",
         "user_id": "{{ record.user_id }}",
         "content_type": "{{ record.content_type }}"
       }
     }
     ```
5. Click "Create webhook"

### Step 7: Test the Function

Test the function manually:

```bash
curl -X POST \
  https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/ocr-image \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"record": {"id": "test-image-id"}}'
```

Or test by uploading an image through the app and checking if the OCR results appear.

### Step 8: Monitor Logs

View function logs:

```bash
supabase functions logs ocr-image --project-ref cesmsdnblkdjkskmiqib
```

Or in the dashboard:
https://supabase.com/dashboard/project/cesmsdnblkdjkskmiqib/functions/ocr-image/logs

## Verification

After deployment, verify everything is working:

1. Upload an image through the app
2. Wait 5-10 seconds for processing
3. Check the `recall_images` table for the new columns:
   - `ocr_text` should contain extracted text
   - `image_explanation` should contain the AI description
   - `processed_at` should have a timestamp

## Troubleshooting

### Function not deploying
- Ensure you're logged in: `supabase login`
- Verify project link: `supabase projects list`
- Check function syntax: Review `supabase/functions/ocr-image/index.ts`

### OpenAI API errors
- Verify API key is set: `supabase secrets list --project-ref cesmsdnblkdjkskmiqib`
- Check OpenAI API key is valid and has credits
- Review function logs for specific error messages

### Webhook not triggering
- Verify webhook is enabled in dashboard
- Check webhook URL is correct
- Ensure Authorization header has correct service role key
- Test webhook manually from dashboard

### Database errors
- Verify migration was applied successfully
- Check table structure: `SELECT * FROM information_schema.columns WHERE table_name = 'recall_images';`
- Ensure RLS policies allow the function to update records

## Cost Optimization

To reduce costs:

1. **Use gpt-4o-mini** (already configured) - cheaper than gpt-4-vision
2. **Implement rate limiting** - limit OCR requests per user
3. **Add image size limits** - resize large images before processing
4. **Cache results** - don't reprocess the same image
5. **Monitor usage** - set up billing alerts in OpenAI dashboard

## Next Steps

- Add OCR results display to your note cards
- Implement search functionality using OCR text
- Add user feedback mechanism for OCR accuracy
- Consider adding language detection and translation
