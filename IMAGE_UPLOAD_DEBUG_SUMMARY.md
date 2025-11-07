
# Image Upload Debug Summary

## Issues Identified and Fixed

### 1. **Enhanced Error Logging**
- Added comprehensive console logging throughout the upload process
- Each step now logs its progress and any errors
- Error messages include full error details for easier debugging

### 2. **Storage Bucket Verification**
- Added `initializeStorageBucket()` function to check if the bucket exists
- App now checks bucket availability on mount
- Shows user-friendly alert if bucket is not configured

### 3. **Authentication Check**
- Added explicit check for active user session before upload
- Prevents upload attempts when user is not logged in
- Logs user ID for debugging

### 4. **File URI Handling**
- Improved URI cleaning to handle `file://` prefix
- Better content type detection from file extensions
- Handles query parameters in URIs

### 5. **User ID in Database Records**
- Updated `saveImageRecord()` to include `user_id`
- Ensures RLS policies work correctly
- Prevents permission errors when saving records

### 6. **User Feedback**
- Added alerts when storage is not ready
- Shows upload success/failure counts
- Provides actionable error messages

## Setup Required

### Create Storage Bucket

You need to create a storage bucket in your Supabase Dashboard:

1. Go to: https://supabase.com/dashboard/project/cesmsdnblkdjkskmiqib/storage/buckets
2. Click "Create a new bucket"
3. Name: `recall-images`
4. Make it **Public** or configure RLS policies

### Configure Storage Policies (If Private Bucket)

If you made the bucket private, add these policies:

```sql
-- Allow authenticated users to upload
CREATE POLICY "Allow authenticated users to upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'recall-images');

-- Allow users to read images
CREATE POLICY "Allow users to read images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'recall-images');

-- Allow users to delete images
CREATE POLICY "Allow users to delete their own images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'recall-images');
```

### Update Database Table

Run this SQL in your Supabase SQL Editor:

```sql
-- Add user_id column if it doesn't exist
ALTER TABLE recall_images 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE recall_images ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own images"
ON recall_images FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own images"
ON recall_images FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own images"
ON recall_images FOR DELETE
TO authenticated
USING (user_id = auth.uid());
```

## Testing Steps

1. **Check Console Logs**
   - Open the app with developer console visible
   - Look for messages starting with `===`
   - Check for any error messages

2. **Verify Bucket Exists**
   - When you open the note editor, check console for:
     - "Bucket 'recall-images' exists and is accessible" ✅
     - OR "Bucket 'recall-images' does not exist" ❌

3. **Test Image Upload**
   - Create a new recall
   - Add an image (camera or gallery)
   - Save the recall
   - Check console for upload progress:
     - "=== Starting image upload ==="
     - "User authenticated: [user-id]"
     - "Base64 conversion successful"
     - "Uploading to storage..."
     - "=== Upload successful ==="

4. **Verify in Supabase**
   - Go to Storage > recall-images in Supabase Dashboard
   - You should see uploaded images organized by recall ID
   - Check the recall_images table for records

## Common Error Messages and Solutions

### "Bucket 'recall-images' does not exist"
**Solution:** Create the bucket in Supabase Dashboard (see Setup Required above)

### "No active session - user must be logged in"
**Solution:** Make sure you're logged in to the app

### "Error uploading image to storage: [permission denied]"
**Solution:** 
- Check if bucket is public OR
- Add storage policies (see Setup Required above)

### "Error saving image record: new row violates row-level security policy"
**Solution:** 
- Add user_id column to recall_images table
- Create RLS policies (see Setup Required above)

### "Method readAsStringAsync is deprecated"
**Solution:** Already fixed - now using new File API with `file.base64()`

## What Changed in the Code

### `utils/supabase.ts`
- Enhanced `uploadImageToStorage()` with detailed logging
- Added authentication check before upload
- Improved URI handling and content type detection
- Added bucket existence verification
- Updated `saveImageRecord()` to include user_id
- Added `initializeStorageBucket()` helper function

### `app/note-editor.tsx`
- Added storage readiness check on mount
- Shows alert if storage is not configured
- Prevents image selection when storage is not ready
- Displays upload success/failure counts
- Better error messages for users

## Next Steps

1. Create the `recall-images` bucket in Supabase Dashboard
2. Configure bucket permissions (public or RLS policies)
3. Run the SQL to update the recall_images table
4. Test image upload with console logs open
5. Verify images appear in both the app and Supabase Dashboard

## Additional Resources

- See `STORAGE_SETUP_GUIDE.md` for detailed setup instructions
- Check Supabase Storage docs: https://supabase.com/docs/guides/storage
- Check RLS docs: https://supabase.com/docs/guides/auth/row-level-security
