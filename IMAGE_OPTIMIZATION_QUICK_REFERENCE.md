
# Image Optimization Quick Reference Guide

## Quick Links

- **Edge Function**: `supabase/functions/cloudflare-upload/index.ts`
- **Image Cache**: `utils/imageCache.ts`
- **CDN Utils**: `utils/cloudflareCDN.ts`
- **NoteCard**: `components/NoteCard.tsx`
- **Database Migration**: `optimize_image_operations_indexes`

---

## Common Tasks

### 1. Upload an Image

```typescript
import { uploadImageToCloudflare } from '@/utils/cloudflareCDN';

const cdnUrl = await uploadImageToCloudflare(
  base64Data,
  'image-123.jpg',
  'image/jpeg'
);

if (cdnUrl) {
  console.log('Upload successful:', cdnUrl);
} else {
  console.error('Upload failed');
}
```

### 2. Get Cached Image

```typescript
import { getCachedImage } from '@/utils/imageCache';

const imageUrl = await getCachedImage(imageId);
if (imageUrl) {
  // Use the image URL
}
```

### 3. Prefetch Images

```typescript
import { prefetchImages } from '@/utils/imageCache';

// Prefetch with default concurrency (5)
await prefetchImages(imageIds);

// Prefetch with custom concurrency
await prefetchImages(imageIds, 3);
```

### 4. Warm Cache on Startup

```typescript
import { warmImageCache } from '@/utils/imageCache';

// Warm cache with high priority
await warmImageCache(recentImageIds, 8);
```

### 5. Get Cache Statistics

```typescript
import { logImageCacheStats, getImageCacheStats } from '@/utils/imageCache';

// Log to console
logImageCacheStats();

// Get stats object
const stats = getImageCacheStats();
console.log('Hit rate:', stats.hitRate);
console.log('Memory usage:', stats.memoryUsageMB);
```

### 6. Clear Cache

```typescript
import { clearImageCache } from '@/utils/imageCache';

clearImageCache();
```

### 7. Get Optimized CDN URL

```typescript
import { getOptimizedCloudflareUrl } from '@/utils/cloudflareCDN';

const optimizedUrl = getOptimizedCloudflareUrl(cdnUrl, {
  width: 600,
  height: 600,
  quality: 80,
  format: 'webp',
  fit: 'cover'
});
```

### 8. Use Predefined Presets

```typescript
import { getCloudflareImagePresets } from '@/utils/cloudflareCDN';

const presets = getCloudflareImagePresets(cdnUrl);
// presets.thumbnail - 200x200, 70% quality
// presets.card - 600x600, 80% quality
// presets.preview - 1200x1200, 85% quality
// presets.full - original
```

### 9. Batch Upload Images

```typescript
import { batchUploadImages } from '@/utils/cloudflareCDN';

const images = [
  { base64Data: '...', fileName: 'img1.jpg', contentType: 'image/jpeg' },
  { base64Data: '...', fileName: 'img2.jpg', contentType: 'image/jpeg' },
];

const results = await batchUploadImages(images, 3);
// results is an array of CDN URLs (null for failed uploads)
```

### 10. Delete Image from CDN

```typescript
import { deleteImageFromCloudflare } from '@/utils/cloudflareCDN';

const success = await deleteImageFromCloudflare(cdnUrl);
if (success) {
  console.log('Image deleted successfully');
}
```

---

## Performance Tips

### 1. Always Use Cache

```typescript
// ✅ Good - uses cache
const url = await getCachedImage(imageId);

// ❌ Bad - bypasses cache
const url = await getImageDataUrl(imageId);
```

### 2. Prefetch Adjacent Images

```typescript
// ✅ Good - prefetch next images
const nextImageIds = imageIds.slice(currentIndex + 1, currentIndex + 3);
prefetchImages(nextImageIds);

// ❌ Bad - load on demand only
// (causes loading delays)
```

### 3. Use Optimized URLs

```typescript
// ✅ Good - optimized for display size
const url = getOptimizedCloudflareUrl(cdnUrl, {
  width: 600,
  height: 600,
  quality: 80,
  format: 'webp'
});

// ❌ Bad - full resolution
const url = cdnUrl;
```

### 4. Batch Operations

```typescript
// ✅ Good - batch upload
const results = await batchUploadImages(images, 3);

// ❌ Bad - sequential upload
for (const img of images) {
  await uploadImageToCloudflare(...);
}
```

### 5. Monitor Cache Performance

```typescript
// ✅ Good - regular monitoring
setInterval(() => {
  const stats = getImageCacheStats();
  if (stats.hitRate < 60) {
    console.warn('Low cache hit rate:', stats.hitRate);
  }
}, 60000);
```

---

## Database Query Patterns

### 1. Fetch Images for Recall

```sql
-- ✅ Good - uses covering index
SELECT id, cdn_url, content_type
FROM recall_images
WHERE recall_id = $1 AND cdn_url IS NOT NULL
ORDER BY created_at ASC;
```

### 2. Get User's Recent Images

```sql
-- ✅ Good - uses user_recent index
SELECT id, recall_id, cdn_url
FROM recall_images
WHERE user_id = $1 AND cdn_url IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
```

### 3. Count Images per Recall

```sql
-- ✅ Good - uses count index
SELECT COUNT(*)
FROM recall_images
WHERE recall_id = $1 AND cdn_url IS NOT NULL;
```

### 4. Get OCR Queue

```sql
-- ✅ Good - uses OCR queue index
SELECT id, recall_id
FROM recall_images
WHERE processed_at IS NULL AND cdn_url IS NOT NULL
ORDER BY created_at ASC
LIMIT 10;
```

### 5. Delete Recall Images

```sql
-- ✅ Good - uses delete optimization index
DELETE FROM recall_images
WHERE recall_id = $1 AND user_id = $2;
```

---

## Troubleshooting

### Cache Not Working

```typescript
// Check cache stats
logImageCacheStats();

// Clear and rebuild cache
clearImageCache();
await warmImageCache(imageIds);
```

### Upload Failures

```typescript
// Check error details
try {
  const url = await uploadImageToCloudflare(base64, fileName, contentType);
} catch (error) {
  console.error('Upload error:', error);
  // Check error.name for specific error type
  // Check error.message for details
}
```

### Slow Image Loading

```typescript
// 1. Check cache hit rate
const stats = getImageCacheStats();
console.log('Hit rate:', stats.hitRate);

// 2. Prefetch more aggressively
await prefetchImages(imageIds, 5); // Increase concurrency

// 3. Use optimized URLs
const url = getOptimizedCloudflareUrl(cdnUrl, {
  width: 600,
  quality: 80,
  format: 'webp'
});
```

### Memory Issues

```typescript
// 1. Check memory usage
const stats = getImageCacheStats();
console.log('Memory usage:', stats.memoryUsageMB, 'MB');

// 2. Clear cache if needed
if (stats.memoryUsageMB > 40) {
  clearImageCache();
}

// 3. Reduce cache size (in imageCache.ts)
// const MAX_CACHE_SIZE = 50; // Reduce from 100
// const MAX_CACHE_MEMORY_MB = 25; // Reduce from 50
```

### Database Performance

```sql
-- Check index usage
EXPLAIN ANALYZE
SELECT id, cdn_url
FROM recall_images
WHERE recall_id = 'xxx';

-- Analyze tables
ANALYZE recall_images;
ANALYZE recalls;

-- Check index sizes
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

---

## Configuration

### Cache Configuration (imageCache.ts)

```typescript
const MAX_CACHE_SIZE = 100; // Max number of images
const MAX_CACHE_MEMORY_MB = 50; // Max memory in MB
const CACHE_CLEANUP_INTERVAL = 60000; // Cleanup interval (ms)
const PREFETCH_BATCH_SIZE = 5; // Concurrent prefetch
```

### Upload Configuration (cloudflareCDN.ts)

```typescript
// Retry attempts
const retries = 2; // Default retry count

// Timeout
const timeout = 30000; // 30 seconds

// Batch concurrency
const maxConcurrent = 3; // Default concurrent uploads
```

### NoteCard Configuration (NoteCard.tsx)

```typescript
const IMAGE_WIDTH = SCREEN_WIDTH - (CARD_PADDING * 5);
const IMAGE_HEIGHT = IMAGE_WIDTH * 1.1;
const IMAGE_SPACING = 12;
```

---

## Monitoring Queries

### Cache Performance

```typescript
// Get detailed stats
const stats = getImageCacheStats();
console.log({
  hitRate: stats.hitRate.toFixed(2) + '%',
  avgAccessTime: stats.avgAccessTime.toFixed(2) + 'ms',
  memoryUsage: stats.memoryUsageMB.toFixed(2) + ' MB',
  cacheSize: stats.cacheSize,
  evictions: stats.evictions
});
```

### Database Performance

```sql
-- Slow queries
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE query LIKE '%recall_images%'
ORDER BY mean_time DESC
LIMIT 10;

-- Index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename = 'recall_images'
ORDER BY idx_scan DESC;
```

---

## Best Practices

1. ✅ **Always use the global cache** for image operations
2. ✅ **Prefetch adjacent images** for smooth scrolling
3. ✅ **Use optimized CDN URLs** for appropriate sizes
4. ✅ **Monitor cache hit rates** regularly
5. ✅ **Batch operations** when possible
6. ✅ **Handle errors gracefully** with retries
7. ✅ **Clean up resources** on unmount
8. ✅ **Use covering indexes** for queries
9. ✅ **Log performance metrics** for monitoring
10. ✅ **Follow linting rules** for code quality

---

## Performance Targets

- **Cache Hit Rate**: >75%
- **Image Load Time (cached)**: <10ms
- **Image Load Time (uncached)**: <300ms
- **Upload Time**: <1s
- **Memory Usage**: <50 MB
- **Database Query Time**: <50ms
- **Scroll Performance**: 60 FPS

---

**Quick Reference Version**: 2.0
**Last Updated**: 2024
