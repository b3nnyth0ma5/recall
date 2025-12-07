
# Image Optimization Quick Reference

## 🚀 Quick Start

### Using the Global Image Cache

```typescript
import { getCachedImage, prefetchImages, logImageCacheStats } from '@/utils/imageCache';

// Get a single image (from cache or fetch)
const imageUrl = await getCachedImage(imageId);

// Prefetch multiple images
await prefetchImages([imageId1, imageId2, imageId3], 3); // max 3 concurrent

// View cache statistics
logImageCacheStats();
```

## 📊 Performance Metrics

### Expected Performance
| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Initial Load | 2-3s | 1-1.5s | 40-50% faster |
| Image Load (cached) | 500-1000ms | 0-100ms | 80-90% faster |
| Image Load (uncached) | 500-1000ms | 100-500ms | 50-80% faster |
| Deletion | 1-2s | 200-400ms | 3-5x faster |
| Memory Usage | 80-120MB | 50-80MB | 30-40% less |

### Cache Hit Rates
- **Cold Start**: 0% (no cache)
- **After 1 minute**: 40-60%
- **After 5 minutes**: 60-80%
- **Steady State**: 70-85%

## 🗄️ Database Indexes

### New Indexes (Automatically Applied)
1. **idx_recall_images_delete_optimization** - Faster deletion
2. **idx_recall_images_fetch_with_cdn** - Faster fetching (covering index)
3. **idx_recall_images_batch_fetch** - Faster batch operations
4. **idx_recall_people_fetch_optimization** - Faster people loading

### Query Performance
```sql
-- Fast deletion (uses idx_recall_images_delete_optimization)
DELETE FROM recall_images WHERE recall_id = ? AND user_id = ?;

-- Fast fetching (uses idx_recall_images_fetch_with_cdn)
SELECT id, recall_id, cdn_url FROM recall_images WHERE recall_id IN (...);

-- Fast batch fetch (uses idx_recall_images_batch_fetch)
SELECT * FROM recall_images WHERE recall_id IN (...) AND cdn_url IS NOT NULL;
```

## 🔧 Troubleshooting

### Cache Not Working?
```typescript
// Check cache statistics
import { logImageCacheStats } from '@/utils/imageCache';
logImageCacheStats();

// Expected output:
// === Image Cache Statistics ===
// Cache Size: 45/100
// Memory Usage: 23.45/50 MB
// Total Requests: 150
// Cache Hits: 105 (70.00%)
// Cache Misses: 45
// Evictions: 5
```

### Images Loading Slowly?
1. Check network connection
2. Verify Cloudflare CDN is configured
3. Check if CDN URLs are being used (faster than base64)
4. Monitor cache hit rate (should be >60% after warm-up)

### Memory Issues?
```typescript
// Clear cache manually
import { clearImageCache } from '@/utils/imageCache';
clearImageCache();

// Cache will auto-evict when:
// - Size exceeds 100 images
// - Memory exceeds 50MB
// - Items haven't been accessed in 10 minutes
```

## 📝 Code Examples

### NoteCard Component
```typescript
// Images are automatically cached and prefetched
// First 2 images load immediately
// Remaining images prefetch in background
// Adjacent images prefetch on scroll

// No changes needed - optimization is automatic!
```

### useNotes Hook
```typescript
// Optimized image loading with global cache
const { notes, loading, refreshNotes } = useNotes();

// Refresh clears all caches
await refreshNotes();

// Single note refresh (preserves other caches)
await refreshSingleNote(noteId);
```

### Manual Image Upload
```typescript
import { uploadImageToCloudflare } from '@/utils/cloudflareCDN';

// Upload with automatic retry
const cdnUrl = await uploadImageToCloudflare(
  base64Data,
  fileName,
  contentType,
  2 // retry count
);

// Batch upload with concurrency control
import { batchUploadImages } from '@/utils/cloudflareCDN';

const results = await batchUploadImages(
  [
    { base64Data: data1, fileName: 'img1.jpg', contentType: 'image/jpeg' },
    { base64Data: data2, fileName: 'img2.jpg', contentType: 'image/jpeg' },
  ],
  3 // max concurrent uploads
);
```

## 🎯 Best Practices

### DO ✅
- Use `getCachedImage()` for all image fetching
- Prefetch images that will be needed soon
- Monitor cache statistics in development
- Use CDN URLs when available (much faster)
- Let the cache auto-manage memory

### DON'T ❌
- Don't create local image caches (use global cache)
- Don't fetch the same image multiple times
- Don't store base64 images in component state
- Don't manually manage cache eviction
- Don't bypass the cache system

## 🔍 Monitoring

### Development
```typescript
// Log cache stats every 30 seconds
setInterval(() => {
  logImageCacheStats();
}, 30000);
```

### Production
- Monitor cache hit rate (should be >60%)
- Monitor memory usage (should be <50MB)
- Monitor image load times (should be <200ms with cache)
- Monitor upload times (should be <1s for typical images)

## 📚 Related Files

### Core Files
- `utils/imageCache.ts` - Global cache system
- `utils/cloudflareCDN.ts` - Upload/delete functions
- `components/NoteCard.tsx` - Optimized image display
- `hooks/useNotes.ts` - Optimized data fetching

### Documentation
- `IMAGE_UPLOAD_OPTIMIZATION_SUMMARY.md` - Detailed optimization guide
- `IMAGE_OPTIMIZATION_QUICK_REFERENCE.md` - This file

## 🆘 Support

### Common Issues

**Issue**: Images not loading
- Check: Network connection
- Check: Cloudflare CDN configuration
- Check: Image IDs are valid
- Solution: Clear cache and refresh

**Issue**: High memory usage
- Check: Cache size (should be <100 images)
- Check: Memory usage (should be <50MB)
- Solution: Cache will auto-evict, or manually clear

**Issue**: Slow uploads
- Check: Image size (compress if >5MB)
- Check: Network speed
- Check: Cloudflare CDN status
- Solution: Use batch upload with concurrency control

**Issue**: Low cache hit rate
- Check: Are images being requested multiple times?
- Check: Is cache being cleared too often?
- Solution: Reduce cache clears, increase cache size if needed

## 🎉 Success Metrics

Your optimization is working well if you see:
- ✅ Cache hit rate >60% after 5 minutes
- ✅ Image load time <200ms (cached)
- ✅ Memory usage <50MB for 50 notes
- ✅ Smooth scrolling with no loading delays
- ✅ Fast deletion (<500ms)
- ✅ Initial page load <2 seconds
