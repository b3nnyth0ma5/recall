
# Migration Guide: Cloudflare CDN Integration

This guide explains the changes made to integrate Cloudflare CDN for image storage and how to migrate from the previous implementation.

## What Changed?

### Before (Gcore CDN / Database Storage)
- Images were stored as base64 strings in the `recall_images.image_data` column
- Optional Gcore CDN integration was available
- Images were retrieved directly from the database

### After (Cloudflare CDN)
- Images are uploaded to Cloudflare CDN
- CDN URLs are stored in the `recall_images.cdn_url` column
- Images are retrieved from Cloudflare CDN (with database fallback)
- Automatic image optimization and transformations
- Better performance and lower bandwidth costs

## Database Schema

The `recall_images` table already has the `cdn_url` column from the previous Gcore CDN implementation. No database migration is needed.

```sql
-- The cdn_url column already exists
ALTER TABLE recall_images 
ADD COLUMN IF NOT EXISTS cdn_url TEXT;
```

## Code Changes

### 1. New Utility File: `utils/cloudflareCDN.ts`

This file contains all Cloudflare CDN-related functions:

- `uploadImageToCloudflare()` - Upload images to Cloudflare
- `deleteImageFromCloudflare()` - Delete images from Cloudflare
- `getOptimizedCloudflareUrl()` - Generate optimized image URLs
- `getCloudflareImagePresets()` - Get predefined image variants
- `isCloudflareCDNConfigured()` - Check if Cloudflare is configured

### 2. Updated: `utils/supabase.ts`

**`uploadImageToDatabase()`**:
- Now uploads images to Cloudflare CDN first
- Stores the CDN URL in the database
- Falls back to base64 storage if CDN upload fails
- Automatically triggers OCR processing

**`getImageDataUrl()`**:
- Prioritizes CDN URL if available
- Falls back to base64 data if CDN URL is not available
- Seamless transition between storage methods

**`deleteImageRecord()`**:
- Deletes images from Cloudflare CDN before deleting database record
- Ensures no orphaned images in CDN

### 3. New Edge Functions

Three new Supabase Edge Functions were created:

**`cloudflare-upload`**:
- Handles image uploads to Cloudflare Images API
- Converts base64 to binary
- Returns CDN URL

**`cloudflare-delete`**:
- Handles image deletion from Cloudflare Images API
- Requires image ID extracted from CDN URL

**`cloudflare-check-config`**:
- Verifies Cloudflare credentials are configured
- Useful for debugging

### 4. Updated: `supabase/functions/ocr-image/index.ts`

- Now supports both CDN URLs and base64 data
- Prioritizes CDN URL for OCR processing
- Falls back to base64 if CDN URL is not available

## Setup Required

To use Cloudflare CDN, you need to:

1. **Create a Cloudflare account** and enable Cloudflare Images
2. **Get your credentials**:
   - Account ID
   - API Token
   - Account Hash
3. **Set environment variables** in Supabase:
   ```
   CLOUDFLARE_ACCOUNT_ID=your_account_id
   CLOUDFLARE_API_TOKEN=your_api_token
   CLOUDFLARE_ACCOUNT_HASH=your_account_hash
   ```
4. **Deploy edge functions**:
   ```bash
   supabase functions deploy cloudflare-upload
   supabase functions deploy cloudflare-delete
   supabase functions deploy cloudflare-check-config
   ```

See `CLOUDFLARE_CDN_SETUP.md` for detailed setup instructions.

## Migration Path

### For New Images
- All new images will automatically be uploaded to Cloudflare CDN
- No action required

### For Existing Images
Existing images stored as base64 in the database will continue to work:

1. **No immediate action required** - The app supports both storage methods
2. **Gradual migration** - As users view/edit notes, images can be migrated
3. **Manual migration** (optional) - You can write a script to migrate all images:

```typescript
// Example migration script (not included in the app)
async function migrateImagesToCloudflare() {
  // 1. Fetch all images without cdn_url
  const { data: images } = await supabase
    .from('recall_images')
    .select('id, image_data, content_type')
    .is('cdn_url', null)
    .not('image_data', 'eq', '');

  // 2. Upload each to Cloudflare
  for (const image of images) {
    const fileName = `migrated-${image.id}.jpg`;
    const cdnUrl = await uploadImageToCloudflare(
      image.image_data,
      fileName,
      image.content_type
    );

    // 3. Update database with CDN URL
    if (cdnUrl) {
      await supabase
        .from('recall_images')
        .update({ 
          cdn_url: cdnUrl,
          image_data: '' // Clear base64 to save space
        })
        .eq('id', image.id);
    }
  }
}
```

## Backward Compatibility

The implementation is fully backward compatible:

- **Old images** (base64 in database) continue to work
- **New images** are stored in Cloudflare CDN
- **Mixed storage** is supported seamlessly
- **No breaking changes** to the app UI or functionality

## Performance Benefits

### Before
- Large database queries (base64 strings are huge)
- High bandwidth usage
- Slower image loading
- No automatic optimization

### After
- Small database queries (just URLs)
- Lower bandwidth usage (CDN handles delivery)
- Faster image loading (CDN edge locations)
- Automatic image optimization and transformations
- Better caching

## Cost Comparison

### Database Storage (Before)
- Supabase database storage: ~$0.125/GB/month
- Bandwidth: ~$0.09/GB
- Average image: ~500KB base64 = ~0.5MB
- 1000 images: ~500MB = ~$62.50/month storage + bandwidth

### Cloudflare CDN (After)
- Free tier: 100,000 images, 500,000 transformations/month
- Paid tier: $5/month for 100,000 images
- 1000 images: **FREE** (well within free tier)

## Troubleshooting

### Images not uploading to CDN
1. Check environment variables are set correctly
2. Verify API token has correct permissions
3. Check edge function logs for errors
4. Ensure Cloudflare Images is enabled

### Images not displaying
1. Verify CDN URL format is correct
2. Check image exists in Cloudflare dashboard
3. Verify Account Hash is correct
4. Check browser console for CORS errors

### Fallback to database storage
If CDN upload fails, images are automatically stored in the database as base64. Check:
1. Cloudflare API status
2. Rate limits
3. Account quotas
4. Edge function logs

## Rollback Plan

If you need to rollback to database-only storage:

1. **Disable CDN uploads**:
   - Remove Cloudflare environment variables from Supabase
   - The app will automatically fall back to database storage

2. **Keep existing CDN images**:
   - CDN images will continue to work
   - New images will be stored in database

3. **Full rollback**:
   - Revert changes to `utils/supabase.ts`
   - Remove `utils/cloudflareCDN.ts`
   - Remove Cloudflare edge functions

## Testing Checklist

- [ ] Upload a new image - verify it goes to Cloudflare CDN
- [ ] View an existing image - verify it displays correctly
- [ ] Delete an image - verify it's removed from both CDN and database
- [ ] Test with Cloudflare credentials not set - verify fallback works
- [ ] Test OCR processing - verify it works with CDN URLs
- [ ] Test image transformations - verify optimized URLs work
- [ ] Check Cloudflare dashboard - verify images appear there

## Support

For issues or questions:
1. Check `CLOUDFLARE_CDN_SETUP.md` for setup instructions
2. Review edge function logs in Supabase dashboard
3. Check Cloudflare Images documentation
4. Verify environment variables are set correctly

## Next Steps

1. Complete the setup in `CLOUDFLARE_CDN_SETUP.md`
2. Deploy the edge functions
3. Test image upload and retrieval
4. Monitor usage in Cloudflare dashboard
5. Consider migrating existing images (optional)
