
# Gcore CDN Implementation Summary

## What Was Implemented

I've successfully integrated Gcore CDN for image storage in your React Native app. This replaces the previous base64 storage method with a scalable CDN solution.

## Key Changes

### 1. New Files Created

#### `utils/gcoreCDN.ts`
- `uploadImageToGcore()` - Upload images to Gcore Storage
- `deleteImageFromGcore()` - Delete images from Gcore Storage
- `getOptimizedGcoreUrl()` - Generate optimized image URLs with transformations
- `getGcoreImagePresets()` - Get predefined image sizes (thumbnail, card, preview, full)
- `isGcoreCDNConfigured()` - Check if Gcore API key is configured

#### Supabase Edge Functions
- `supabase/functions/gcore-upload/index.ts` - Handles image uploads to Gcore
- `supabase/functions/gcore-delete/index.ts` - Handles image deletions from Gcore
- `supabase/functions/gcore-check-config/index.ts` - Verifies Gcore configuration

### 2. Modified Files

#### `utils/supabase.ts`
- **`uploadImageToDatabase()`**: Now uploads to Gcore CDN first, falls back to base64 if CDN fails
- **`getImageDataUrl()`**: Returns CDN URL if available, otherwise converts base64 to data URL
- **`deleteImageRecord()`**: Deletes from both CDN and database
- Added `USE_GCORE_CDN` toggle to enable/disable CDN usage

#### `supabase/functions/ocr-image/index.ts`
- Updated to support both CDN URLs and base64 data
- OpenAI Vision API can now process images from CDN URLs directly

### 3. Database Schema Changes

New column added to `recall_images` table:
- `cdn_url` (TEXT, nullable) - Stores the Gcore CDN URL for the image

The `image_data` column is retained for:
- Backward compatibility with existing images
- Fallback when CDN upload fails
- Migration period

## How It Works

### Upload Flow

```
User selects image
    ↓
Convert to base64
    ↓
Check if Gcore CDN is configured
    ↓
┌─────────────────┐
│ CDN Configured? │
└────────┬────────┘
         │
    ┌────┴────┐
    │   YES   │   NO
    ↓         ↓
Upload to    Store
Gcore CDN    base64
    ↓         ↓
Store CDN    Store in
URL in DB    database
    ↓         ↓
Success! ← Fallback if CDN fails
```

### Retrieval Flow

```
Request image by ID
    ↓
Fetch from database
    ↓
┌──────────────┐
│ Has CDN URL? │
└──────┬───────┘
       │
   ┌───┴───┐
   │  YES  │  NO
   ↓       ↓
Return    Convert
CDN URL   base64 to
          data URL
   ↓       ↓
Display image
```

### Deletion Flow

```
Delete image request
    ↓
Fetch image record
    ↓
┌──────────────┐
│ Has CDN URL? │
└──────┬───────┘
       │
   ┌───┴───┐
   │  YES  │  NO
   ↓       ↓
Delete    Skip CDN
from CDN  deletion
   ↓       ↓
Delete from database
   ↓
Success!
```

## Setup Required

### Step 1: Get Gcore API Key

1. Sign up at https://gcore.com
2. Create a Storage bucket
3. Generate an API key with Storage permissions
4. Note your storage name (e.g., "natively-images")

### Step 2: Configure Supabase

Set environment variables in Supabase Edge Functions:

```bash
# Using Supabase CLI
npx supabase secrets set GCORE_API_KEY=your_api_key_here --project-ref cesmsdnblkdjkskmiqib
npx supabase secrets set GCORE_STORAGE_NAME=natively-images --project-ref cesmsdnblkdjkskmiqib
```

Or via Supabase Dashboard:
- Go to Edge Functions → Settings
- Add `GCORE_API_KEY` and `GCORE_STORAGE_NAME`

### Step 3: Update Database

Run this SQL in Supabase SQL Editor:

```sql
-- Add cdn_url column
ALTER TABLE recall_images 
ADD COLUMN IF NOT EXISTS cdn_url TEXT;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_recall_images_cdn_url 
ON recall_images(cdn_url) 
WHERE cdn_url IS NOT NULL;

-- Add documentation
COMMENT ON COLUMN recall_images.cdn_url IS 'Gcore CDN URL for the image. If null, image_data contains base64 data (fallback).';
```

### Step 4: Deploy Edge Functions

```bash
# Deploy all three functions
npx supabase functions deploy gcore-upload --project-ref cesmsdnblkdjkskmiqib
npx supabase functions deploy gcore-delete --project-ref cesmsdnblkdjkskmiqib
npx supabase functions deploy gcore-check-config --project-ref cesmsdnblkdjkskmiqib
```

### Step 5: Test

Upload a new image in the app and verify:
1. Image appears in Gcore Storage dashboard
2. Database record has `cdn_url` populated
3. Image loads quickly in the app

## Benefits

### Performance
- **Faster loading**: Images served from global CDN
- **Reduced latency**: Edge locations closer to users
- **Better caching**: Browser/native caching with CDN headers

### Scalability
- **No database bloat**: URLs instead of base64 data
- **Unlimited storage**: Gcore handles storage scaling
- **Better for large images**: No database size limits

### Cost
- **Reduced database costs**: Less storage in Supabase
- **Pay-as-you-go**: Only pay for what you use
- **Bandwidth optimization**: CDN caching reduces transfers

### Features
- **Image transformations**: Resize, optimize, format conversion via URL
- **Global distribution**: Fast access worldwide
- **Professional CDN**: Enterprise-grade infrastructure

## Configuration

### Toggle CDN Usage

In `utils/supabase.ts`:

```typescript
// Set to false to disable CDN and use base64 storage
const USE_GCORE_CDN = true;
```

### Image Optimization

Use predefined presets:

```typescript
import { getGcoreImagePresets } from '@/utils/gcoreCDN';

const presets = getGcoreImagePresets(cdnUrl);
// presets.thumbnail - 150x150, 70% quality
// presets.card - 400x400, 80% quality
// presets.preview - 800x800, 85% quality
// presets.full - Original image
```

Or custom optimization:

```typescript
import { getOptimizedGcoreUrl } from '@/utils/gcoreCDN';

const optimized = getOptimizedGcoreUrl(cdnUrl, {
  width: 600,
  height: 400,
  quality: 85,
  format: 'webp'
});
```

## Backward Compatibility

The implementation is fully backward compatible:

- ✅ Existing base64 images continue to work
- ✅ New images use CDN automatically
- ✅ Fallback to base64 if CDN fails
- ✅ No breaking changes to existing code
- ✅ Gradual migration as users upload new images

## Monitoring

### Check Configuration

```bash
curl -X POST \
  https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/gcore-check-config \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### View Edge Function Logs

```bash
# Upload function
npx supabase functions logs gcore-upload --project-ref cesmsdnblkdjkskmiqib

# Delete function
npx supabase functions logs gcore-delete --project-ref cesmsdnblkdjkskmiqib
```

### Check Database

```sql
-- See how many images use CDN vs base64
SELECT 
  COUNT(*) FILTER (WHERE cdn_url IS NOT NULL) as cdn_images,
  COUNT(*) FILTER (WHERE cdn_url IS NULL) as base64_images,
  COUNT(*) as total_images
FROM recall_images;
```

## Troubleshooting

### Images Not Uploading

1. Check if API key is set:
   ```bash
   npx supabase secrets list --project-ref cesmsdnblkdjkskmiqib
   ```

2. Check Edge Function logs:
   ```bash
   npx supabase functions logs gcore-upload --project-ref cesmsdnblkdjkskmiqib
   ```

3. Verify Gcore storage exists and API key has permissions

### Images Not Loading

1. Check if CDN URL is accessible:
   ```bash
   curl -I "YOUR_CDN_URL"
   ```

2. Check database for CDN URLs:
   ```sql
   SELECT id, cdn_url, image_data IS NOT NULL as has_base64 
   FROM recall_images 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

3. Check app logs for errors

### Fallback to Base64

If CDN upload fails, the app automatically falls back to base64 storage. Check logs to see why:

```
"Failed to upload to Gcore CDN, falling back to base64 storage"
```

Common reasons:
- API key not configured
- Storage name incorrect
- Network issues
- Gcore API rate limits

## Next Steps

1. **Provide API Key**: Share your Gcore API key so I can configure it
2. **Test Upload**: Upload a new image to verify CDN integration
3. **Monitor Performance**: Check image loading times
4. **Optimize Usage**: Use image presets for different contexts
5. **Consider Migration**: Optionally migrate existing base64 images to CDN

## API Reference

### Gcore API Documentation

Full documentation: https://gcore.com/docs/api-reference/overview

Key endpoints used:
- Upload: `POST /storage/v1/storage/{storage_name}/upload`
- Delete: `DELETE /storage/v1/storage/{storage_name}/files/{file_name}`

### App Functions

```typescript
// Upload image to CDN
import { uploadImageToGcore } from '@/utils/gcoreCDN';
const cdnUrl = await uploadImageToGcore(base64Data, fileName, contentType);

// Delete image from CDN
import { deleteImageFromGcore } from '@/utils/gcoreCDN';
await deleteImageFromGcore(cdnUrl);

// Get optimized URL
import { getOptimizedGcoreUrl } from '@/utils/gcoreCDN';
const optimized = getOptimizedGcoreUrl(cdnUrl, { width: 400, quality: 80 });

// Check configuration
import { isGcoreCDNConfigured } from '@/utils/gcoreCDN';
const configured = await isGcoreCDNConfigured();
```

## Security

- ✅ API key stored server-side only (Edge Functions)
- ✅ Never exposed to client
- ✅ All uploads authenticated via Supabase
- ✅ RLS policies still apply to image records
- ✅ User can only access their own images

## Cost Estimation

Typical costs for 1000 users:
- **Storage**: ~$0.02/GB/month
- **Bandwidth**: ~$0.05/GB transferred
- **Requests**: Usually negligible

Example: 1000 users, 10 images each, 2MB average:
- Storage: 20GB × $0.02 = $0.40/month
- Bandwidth: 100GB × $0.05 = $5.00/month
- **Total**: ~$5.40/month

Compare to Supabase database storage costs for base64 data!

## Support

For issues:
1. Check Edge Function logs
2. Verify Gcore dashboard for uploads
3. Test API directly with curl
4. Review app console logs

## Conclusion

Gcore CDN is now integrated and ready to use! Once you provide the API key and complete the setup steps, all new images will be stored on the CDN for faster, more scalable image delivery.

The implementation includes:
- ✅ Automatic CDN upload
- ✅ Fallback to base64
- ✅ Backward compatibility
- ✅ Image optimization
- ✅ Secure API key handling
- ✅ Comprehensive error handling
- ✅ Easy monitoring and debugging

Ready to provide your Gcore API key to complete the setup!
