
# Gcore CDN Setup Guide

This guide will help you set up Gcore CDN for image storage in your React Native app.

## Overview

The app now supports Gcore CDN for storing and serving images. This provides:

- **Faster image loading** via global CDN network
- **Reduced database storage** (URLs instead of base64)
- **Image transformations** (resize, optimize, format conversion)
- **Better scalability** for large image collections

## Prerequisites

1. A Gcore account (sign up at https://gcore.com)
2. Gcore Storage configured
3. Gcore API key

## Step 1: Get Your Gcore API Key

1. Log in to your Gcore account at https://gcore.com
2. Navigate to **Account Settings** → **API Tokens**
3. Click **Create API Token**
4. Give it a name (e.g., "Natively Images")
5. Select the required permissions:
   - Storage: Read, Write, Delete
6. Copy the generated API key (you won't be able to see it again!)

## Step 2: Create Gcore Storage

1. In your Gcore dashboard, go to **Storage**
2. Click **Create Storage**
3. Choose a name (e.g., "natively-images")
4. Select your preferred region
5. Configure access settings (recommend: Private with API access)
6. Note the storage name for later

## Step 3: Configure Supabase Environment Variables

You need to add the Gcore API key to your Supabase Edge Functions:

### Option A: Using Supabase Dashboard

1. Go to https://supabase.com/dashboard/project/cesmsdnblkdjkskmiqib
2. Navigate to **Edge Functions** → **Settings**
3. Add the following environment variables:
   - `GCORE_API_KEY`: Your Gcore API key
   - `GCORE_STORAGE_NAME`: Your storage name (e.g., "natively-images")

### Option B: Using Supabase CLI

```bash
# Set the API key
npx supabase secrets set GCORE_API_KEY=your_api_key_here --project-ref cesmsdnblkdjkskmiqib

# Set the storage name
npx supabase secrets set GCORE_STORAGE_NAME=natively-images --project-ref cesmsdnblkdjkskmiqib
```

## Step 4: Update Database Schema

Add the `cdn_url` column to the `recall_images` table:

```sql
-- Add cdn_url column to store Gcore CDN URLs
ALTER TABLE recall_images 
ADD COLUMN IF NOT EXISTS cdn_url TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_recall_images_cdn_url 
ON recall_images(cdn_url) 
WHERE cdn_url IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN recall_images.cdn_url IS 'Gcore CDN URL for the image. If null, image_data contains base64.';
```

You can run this SQL in the Supabase SQL Editor or use the migration tool.

## Step 5: Deploy Edge Functions

Deploy the three new Gcore-related Edge Functions:

```bash
# Deploy the upload function
npx supabase functions deploy gcore-upload --project-ref cesmsdnblkdjkskmiqib

# Deploy the delete function
npx supabase functions deploy gcore-delete --project-ref cesmsdnblkdjkskmiqib

# Deploy the config check function
npx supabase functions deploy gcore-check-config --project-ref cesmsdnblkdjkskmiqib
```

## Step 6: Verify Setup

Test that everything is working:

### Test 1: Check Configuration

```bash
curl -X POST \
  https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/gcore-check-config \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response:
```json
{
  "configured": true,
  "message": "Gcore CDN is properly configured"
}
```

### Test 2: Upload Test Image

Create a test base64 image and upload it:

```bash
curl -X POST \
  https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/gcore-upload \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "base64Data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "fileName": "test-image.png",
    "contentType": "image/png"
  }'
```

Expected response:
```json
{
  "success": true,
  "cdnUrl": "https://cdn.gcore.com/...",
  "fileName": "test-image.png"
}
```

## Step 7: Enable CDN in App

The CDN is enabled by default. To toggle it, edit `utils/supabase.ts`:

```typescript
// Toggle to use Gcore CDN or fallback to base64 storage
const USE_GCORE_CDN = true; // Set to false to disable
```

## How It Works

### Image Upload Flow

1. User selects/takes a photo
2. Image is converted to base64
3. If Gcore CDN is enabled and configured:
   - Image is uploaded to Gcore Storage via Edge Function
   - CDN URL is stored in database
4. If CDN fails or is disabled:
   - Base64 data is stored in database (fallback)

### Image Retrieval Flow

1. App requests image by ID
2. Database returns either:
   - CDN URL (if available) → Direct CDN access
   - Base64 data (fallback) → Converted to data URL

### Image Deletion Flow

1. App requests image deletion
2. If CDN URL exists:
   - Image is deleted from Gcore Storage
3. Database record is deleted

## Image Optimization

Gcore CDN supports URL-based image transformations:

```typescript
import { getOptimizedGcoreUrl, getGcoreImagePresets } from '@/utils/gcoreCDN';

// Custom optimization
const optimizedUrl = getOptimizedGcoreUrl(cdnUrl, {
  width: 400,
  height: 400,
  quality: 80,
  format: 'webp'
});

// Predefined presets
const presets = getGcoreImagePresets(cdnUrl);
// presets.thumbnail - 150x150, 70% quality
// presets.card - 400x400, 80% quality
// presets.preview - 800x800, 85% quality
// presets.full - Original image
```

## Monitoring

### Check Edge Function Logs

```bash
# Upload function logs
npx supabase functions logs gcore-upload --project-ref cesmsdnblkdjkskmiqib

# Delete function logs
npx supabase functions logs gcore-delete --project-ref cesmsdnblkdjkskmiqib
```

### Monitor Gcore Usage

1. Log in to Gcore dashboard
2. Go to **Storage** → Your storage
3. View:
   - Storage usage
   - Bandwidth usage
   - Request statistics

## Troubleshooting

### Images Not Uploading

1. **Check API key**: Verify `GCORE_API_KEY` is set correctly
   ```bash
   npx supabase secrets list --project-ref cesmsdnblkdjkskmiqib
   ```

2. **Check Edge Function logs**:
   ```bash
   npx supabase functions logs gcore-upload --project-ref cesmsdnblkdjkskmiqib
   ```

3. **Verify storage name**: Ensure `GCORE_STORAGE_NAME` matches your Gcore storage

4. **Test API directly**: Use curl to test Gcore API
   ```bash
   curl -X GET \
     https://api.gcore.com/storage/v1/storage \
     -H "Authorization: APIKey YOUR_API_KEY"
   ```

### Images Not Loading

1. **Check CDN URL**: Verify the URL is accessible
   ```bash
   curl -I "YOUR_CDN_URL"
   ```

2. **Check database**: Verify `cdn_url` column exists and has data
   ```sql
   SELECT id, cdn_url, image_data IS NOT NULL as has_base64 
   FROM recall_images 
   LIMIT 10;
   ```

3. **Check CORS**: Ensure Gcore storage has CORS enabled for your app domain

### Fallback to Base64

If CDN upload fails, the app automatically falls back to base64 storage. Check logs to see why:

```bash
# App logs will show:
# "Failed to upload to Gcore CDN, falling back to base64 storage"
```

## Migration from Base64 to CDN

If you have existing images stored as base64, you can migrate them:

1. **Create migration script** (run in Supabase SQL Editor):

```sql
-- This is a manual process - you'll need to:
-- 1. Fetch images with base64 data
-- 2. Upload to Gcore via Edge Function
-- 3. Update cdn_url column
-- 4. Optionally clear image_data to save space

-- Example query to find images to migrate:
SELECT id, recall_id, LENGTH(image_data) as size_bytes
FROM recall_images
WHERE cdn_url IS NULL 
AND image_data IS NOT NULL
ORDER BY created_at DESC;
```

2. **Use app to re-upload**: The easiest way is to let users naturally re-upload images over time

## Cost Considerations

### Gcore Pricing

- Storage: Pay per GB stored
- Bandwidth: Pay per GB transferred
- Requests: Pay per request (usually minimal)

Check current pricing at: https://gcore.com/pricing/storage

### Optimization Tips

1. **Use image transformations** to serve smaller images
2. **Enable browser caching** (already configured)
3. **Delete unused images** regularly
4. **Monitor usage** in Gcore dashboard

## Security

### API Key Security

- ✅ API key is stored in Supabase Edge Functions (server-side)
- ✅ Never exposed to client
- ✅ All uploads go through authenticated Edge Functions

### Image Access

- Configure Gcore storage access settings:
  - **Public**: Anyone can access images (faster, cheaper)
  - **Private**: Requires signed URLs (more secure)

### RLS Policies

The existing RLS policies on `recall_images` table still apply:

```sql
-- Users can only access their own images
SELECT * FROM pg_policies WHERE tablename = 'recall_images';
```

## Support

For issues:

1. **Gcore Support**: https://gcore.com/support
2. **Gcore API Docs**: https://gcore.com/docs/api-reference/overview
3. **Supabase Support**: https://supabase.com/support

## Next Steps

After setup is complete:

1. Test uploading a new image in the app
2. Verify it appears in Gcore Storage dashboard
3. Check that images load quickly
4. Monitor Edge Function logs for any errors
5. Consider migrating existing base64 images

## API Reference

### Gcore API Endpoints

The implementation uses these Gcore API endpoints:

- **Upload**: `POST https://api.gcore.com/storage/v1/storage/{storage_name}/upload`
- **Delete**: `DELETE https://api.gcore.com/storage/v1/storage/{storage_name}/files/{file_name}`
- **List**: `GET https://api.gcore.com/storage/v1/storage/{storage_name}/files`

For full API documentation, visit: https://gcore.com/docs/api-reference/overview

## Conclusion

You now have Gcore CDN integrated for fast, scalable image storage! The app will automatically use CDN for new uploads while maintaining backward compatibility with existing base64 images.
