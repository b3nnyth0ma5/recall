
# CDN Implementation Guide

## Overview

This guide explains the CDN implementation for faster image fetching in your React Native app. The implementation uses Supabase Edge Functions to serve images with aggressive caching headers, significantly improving load times.

## Architecture

### Components

1. **Supabase Edge Function (`serve-image`)**: Serves images with CDN-like caching headers
2. **Updated `utils/supabase.ts`**: New functions for CDN URL generation and caching
3. **Updated `utils/imageOptimization.ts`**: Integration with CDN URLs

### How It Works

1. Images are stored as base64 strings in the `recall_images` table
2. The `serve-image` Edge Function converts base64 to binary and serves with caching headers
3. Browser/native cache stores images for up to 1 year (immutable)
4. In-memory cache prevents redundant URL generation
5. ETag-based validation for efficient cache revalidation

## Deployment Steps

### 1. Deploy the Edge Function

```bash
# Navigate to your project directory
cd /path/to/your/project

# Deploy the serve-image function
npx supabase functions deploy serve-image --project-ref cesmsdnblkdjkskmiqib
```

### 2. Verify Deployment

Test the function with a sample image ID:

```bash
curl "https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/serve-image?id=YOUR_IMAGE_ID"
```

### 3. Enable CORS (if needed)

The function already includes CORS headers, but verify in Supabase dashboard:
- Go to Edge Functions → serve-image → Settings
- Ensure CORS is enabled for your app domains

## Features

### 1. CDN URL Generation

```typescript
import { getImageCDNUrl } from '@/utils/supabase';

// Basic usage
const url = getImageCDNUrl(imageId);

// With optimization parameters
const optimizedUrl = getImageCDNUrl(imageId, {
  width: 400,
  height: 400,
  quality: 80
});
```

### 2. Predefined Size Presets

```typescript
import { getOptimizedImageUrl } from '@/utils/supabase';

// Use predefined sizes
const thumbnailUrl = getOptimizedImageUrl(imageId, 'thumbnail'); // 150x150, 70% quality
const cardUrl = getOptimizedImageUrl(imageId, 'card');           // 400x400, 80% quality
const previewUrl = getOptimizedImageUrl(imageId, 'preview');     // 800x800, 85% quality
const fullUrl = getOptimizedImageUrl(imageId, 'full');           // 1200x1200, 90% quality
```

### 3. Image Preloading

```typescript
import { preloadImages } from '@/utils/supabase';

// Preload multiple images
await preloadImages(['image-id-1', 'image-id-2', 'image-id-3']);
```

### 4. Cache Management

```typescript
import { clearImageCache } from '@/utils/supabase';

// Clear cache for specific image
clearImageCache(imageId);

// Clear entire cache
clearImageCache();
```

## Caching Strategy

### Browser/Native Cache
- **Max-Age**: 1 year (31536000 seconds)
- **Cache-Control**: `public, max-age=31536000, immutable`
- **ETag**: Image ID for cache validation
- **304 Not Modified**: Returned when client has cached version

### In-Memory Cache
- Stores generated URLs to prevent redundant processing
- Automatically cleared on image deletion
- Can be manually cleared with `clearImageCache()`

## Performance Benefits

### Before CDN Implementation
- Images loaded as base64 data URLs
- No browser caching
- Full image data transferred on every load
- Slow initial load times

### After CDN Implementation
- Images served via CDN with caching headers
- Browser caches images for 1 year
- 304 responses for cached images (minimal data transfer)
- Significantly faster load times
- Reduced bandwidth usage

## Configuration

### Toggle CDN Usage

In `utils/supabase.ts`, you can toggle CDN usage:

```typescript
const CDN_ENABLED = true; // Set to false to use legacy data URLs
```

### Customize Cache Duration

In `supabase/functions/serve-image/index.ts`:

```typescript
const cacheHeaders = {
  'Cache-Control': 'public, max-age=31536000, immutable', // Modify max-age as needed
  // ...
};
```

## Monitoring

### Check Edge Function Logs

```bash
npx supabase functions logs serve-image --project-ref cesmsdnblkdjkskmiqib
```

### Monitor Performance

1. Check browser DevTools Network tab
2. Look for 304 responses (cache hits)
3. Monitor response times
4. Check cache headers in response

## Troubleshooting

### Images Not Loading

1. Verify Edge Function is deployed:
   ```bash
   npx supabase functions list --project-ref cesmsdnblkdjkskmiqib
   ```

2. Check function logs for errors:
   ```bash
   npx supabase functions logs serve-image --project-ref cesmsdnblkdjkskmiqib
   ```

3. Test function directly:
   ```bash
   curl "https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/serve-image?id=YOUR_IMAGE_ID"
   ```

### Cache Not Working

1. Check response headers in browser DevTools
2. Verify `Cache-Control` header is present
3. Clear browser cache and test again
4. Check if CDN_ENABLED is set to true

### Slow Initial Load

1. Use `preloadImages()` for critical images
2. Consider using smaller image sizes for thumbnails
3. Implement progressive loading (thumbnail → full size)

## Migration from Legacy System

The implementation is backward compatible. The `getImageDataUrl()` function now returns CDN URLs by default, so existing code continues to work without changes.

To explicitly use legacy data URLs:
1. Set `CDN_ENABLED = false` in `utils/supabase.ts`
2. Or fetch directly from database using the legacy method

## Best Practices

1. **Use Appropriate Sizes**: Don't load full-size images for thumbnails
2. **Preload Critical Images**: Use `preloadImages()` for above-the-fold content
3. **Clear Cache on Updates**: Call `clearImageCache()` when images are modified
4. **Monitor Performance**: Regularly check Edge Function logs and metrics
5. **Test on Real Devices**: Test caching behavior on actual mobile devices

## Future Enhancements

Potential improvements for the CDN implementation:

1. **Image Transformation**: Add server-side image resizing and optimization
2. **WebP Support**: Serve WebP format for supported browsers
3. **Lazy Loading**: Implement intersection observer for lazy loading
4. **Progressive Images**: Serve low-quality placeholders first
5. **CDN Provider**: Integrate with Cloudflare or AWS CloudFront for global distribution

## Support

For issues or questions:
1. Check Edge Function logs
2. Review browser console for errors
3. Test with curl to isolate client vs server issues
4. Verify Supabase project configuration
