
# Migration Summary - Image Storage Changes

## Overview
This document summarizes the changes made to migrate from Supabase Storage to direct database storage for images.

## Key Changes

### 1. Image Storage Method
**Before:** Images were stored in Supabase Storage bucket (`media`) with file paths stored in the database.

**After:** Images are now stored directly in the `recall_images` table as base64-encoded data.

### 2. Database Schema Changes

The `recall_images` table now uses:
- `image_data` (TEXT) - Base64-encoded image data
- `content_type` (TEXT) - MIME type (e.g., 'image/jpeg')
- `user_id` (UUID) - Reference to auth.users
- `recall_id` (UUID) - Reference to recalls table

**Migration SQL:**
```sql
-- If you have existing data with image_path, you'll need to migrate it
-- This is a one-way migration - backup your data first!

-- Add image_data column if it doesn't exist
ALTER TABLE recall_images ADD COLUMN IF NOT EXISTS image_data TEXT;

-- Remove image_path column (after migrating data)
-- ALTER TABLE recall_images DROP COLUMN IF EXISTS image_path;

-- Ensure proper RLS policies
ALTER TABLE recall_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own images"
  ON recall_images FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own images"
  ON recall_images FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own images"
  ON recall_images FOR DELETE
  USING (auth.uid() = user_id);
```

### 3. Code Changes

#### utils/supabase.ts
- Removed: `uploadImageToStorage()`, `getImageUrl()`, `deleteImageFromStorage()`, `saveImageRecord()`, `getImagePath()`, `initializeStorageBucket()`
- Updated: `uploadImageToDatabase()` - Now stores base64 data directly
- Updated: `getImageDataUrl()` - Returns data URLs instead of storage URLs
- Kept: `deleteImageRecord()` - Still needed for cleanup

#### app/note-editor.tsx
- Removed storage bucket initialization checks
- Updated image upload to use `uploadImageToDatabase()`
- Removed `storagePath` from ImageData interface
- Simplified image deletion (no storage cleanup needed)

#### hooks/useNotes.ts
- Updated to fetch images using `getImageDataUrl()`
- Removed storage path handling
- Simplified image deletion

#### components/NoteCard.tsx
- No changes needed - still displays images from data URLs

### 4. Removed Files
- `app/storage-test.tsx` - Storage testing page removed
- Updated `app/(tabs)/profile.tsx` - Removed "Storage Test" menu item
- Updated `app/_layout.tsx` - Removed storage-test route

### 5. Location Search Improvements

#### Auto-Search
- Location search now automatically triggers as the user types (500ms debounce)
- Removed manual "Search" button for better UX

#### Location Extraction
- Implemented smart location extraction from OpenStreetMap results
- Extracts "business name, suburb" if available
- Falls back to "suburb, city" format
- Updates the `location` field in the `recalls` table

### 6. Font Updates

#### Geist Sans Typography
- Added Geist Sans font family configuration in `styles/commonStyles.ts`
- Uses system fonts on native platforms (iOS: System, Android: Roboto)
- Uses web fonts on web platform with Geist-like characteristics
- Applied font family to all text styles throughout the app

## Benefits of New Approach

### Advantages
1. **Simpler Architecture** - No need to manage storage buckets
2. **Atomic Operations** - Images and metadata stored together
3. **Easier Backup** - Everything in one database
4. **No Storage Policies** - Only need database RLS policies
5. **Faster Development** - No storage bucket setup required

### Considerations
1. **Database Size** - Base64 encoding increases size by ~33%
2. **Query Performance** - Large images may slow down queries
3. **Best for** - Small to medium-sized images (< 2MB each)

## Recommendations

### Image Optimization
- Always convert images to JPEG format
- Compress images to 80% quality
- Resize images to max 2048px on longest side
- These are already implemented in `convertImageToSuitableFormat()`

### Database Maintenance
- Monitor database size regularly
- Consider implementing image cleanup for deleted recalls
- Set up automated backups

### Future Improvements
- Implement lazy loading for images
- Add image caching on client side
- Consider pagination for notes with many images

## Testing Checklist

- [ ] Create new note with images
- [ ] Edit existing note and add/remove images
- [ ] Delete note with images
- [ ] Search for notes with images
- [ ] Test location search auto-complete
- [ ] Verify location extraction format
- [ ] Test on iOS device
- [ ] Test on Android device
- [ ] Test on web browser

## Rollback Plan

If you need to rollback to storage-based approach:

1. Restore the previous version of `utils/supabase.ts`
2. Restore the previous version of `app/note-editor.tsx`
3. Restore the previous version of `hooks/useNotes.ts`
4. Re-add the storage bucket setup
5. Migrate data from `image_data` back to storage files

## Support

For issues or questions about this migration:
1. Check the console logs for detailed error messages
2. Verify database schema matches the expected structure
3. Ensure RLS policies are correctly configured
4. Check that images are being converted to JPEG format
