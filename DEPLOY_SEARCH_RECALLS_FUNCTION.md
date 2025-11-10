
# Deploy search-recalls Edge Function

## Overview
The `search-recalls` edge function has been updated to include OCR text and image explanations in the search results. This allows users to search not just the note text and location, but also the content extracted from images.

## Deployment Steps

### 1. Install Supabase CLI (if not already installed)
```bash
npm install -g supabase
```

### 2. Login to Supabase
```bash
supabase login
```

### 3. Link to your project
```bash
supabase link --project-ref cesmsdnblkdjkskmiqib
```

### 4. Deploy the function
```bash
supabase functions deploy search-recalls
```

### 5. Verify deployment
Check the Supabase Dashboard:
- Go to https://supabase.com/dashboard/project/cesmsdnblkdjkskmiqib/functions
- Verify that `search-recalls` appears in the list
- Check the deployment logs for any errors

## Environment Variables Required

The function requires the following environment variables (should already be set):
- `OPENAI_API_KEY` - Your OpenAI API key
- `SUPABASE_URL` - Automatically provided by Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Automatically provided by Supabase

To set the OpenAI API key (if not already set):
```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
```

## What's New

The updated function now:
1. **Fetches OCR data**: Retrieves `ocr_text` and `image_explanation` from the `recall_images` table
2. **Includes in search**: Sends OCR data to OpenAI for analysis alongside note text and location
3. **Better matching**: Can find notes based on image content, not just text
4. **Enhanced relevance**: Scoring considers OCR text and explanations as important factors

## Testing

After deployment, test the search functionality:

1. **Create a note with images** that contain text (e.g., a photo of a receipt, sign, or document)
2. **Wait for OCR processing** (should take 5-10 seconds)
3. **Search for text** that appears in the image but not in the note text
4. **Verify results** include the note with the matching image

Example test:
- Upload a photo of a "Starbucks" receipt
- Don't mention "Starbucks" in the note text
- Search for "Starbucks"
- The note should appear in results with high relevance score

## Troubleshooting

### Function not found
```bash
# Re-deploy the function
supabase functions deploy search-recalls
```

### Authentication errors
```bash
# Re-login to Supabase
supabase login
```

### OpenAI API errors
```bash
# Verify the API key is set
supabase secrets list

# Set it if missing
supabase secrets set OPENAI_API_KEY=your_key_here
```

### Check logs
```bash
# View function logs
supabase functions logs search-recalls
```

Or check in the dashboard:
https://supabase.com/dashboard/project/cesmsdnblkdjkskmiqib/logs/edge-functions

## Cost Considerations

The updated function may use slightly more OpenAI tokens because:
- OCR text is included in the prompt
- Image explanations are included in the prompt

However, the impact should be minimal since:
- Only the user's own notes are analyzed (not the entire database)
- Results are limited to top 10
- The efficient `gpt-4o-mini` model is used

## Success!

Once deployed, users can:
- Search for text that appears in images
- Find notes based on image content
- Get more accurate search results
- Discover notes they might have forgotten about

The sparkle icon on the note editor screen also allows users to view OCR results for their images.
