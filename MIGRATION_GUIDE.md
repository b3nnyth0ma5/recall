
# Migration Guide: Supabase Storage for Images

This guide explains how to migrate from storing images as binary data in the database to using Supabase Storage.

## Database Migration

Run the following SQL in your Supabase SQL Editor:

```sql
-- 1. Create storage bucket for recall images
insert into storage.buckets (id, name, public)
values ('recall-images', 'recall-images', true)
on conflict (id) do nothing;

-- 2. Enable RLS on storage.objects (if not already enabled)
alter table storage.objects enable row level security;

-- 3. Create RLS policies for storage bucket
create policy "Users can upload their own images"
on storage.objects for insert
with check (
  bucket_id = 'recall-images' 
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can view their own images"
on storage.objects for select
using (
  bucket_id = 'recall-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can update their own images"
on storage.objects for update
using (
  bucket_id = 'recall-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can delete their own images"
on storage.objects for delete
using (
  bucket_id = 'recall-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- 4. Public access policy for images (since bucket is public)
create policy "Public images are viewable by everyone"
on storage.objects for select
using (bucket_id = 'recall-images');

-- 5. Alter recall_images table to use image_path instead of image_data
alter table recall_images add column if not exists image_path text;

-- 6. Add comments for clarity
comment on column recall_images.image_path is 'Path to image in Supabase Storage';
comment on column recall_images.image_data is 'Deprecated: Legacy binary image data';
```

## Storage Bucket Configuration

After running the SQL migration:

1. Go to your Supabase Dashboard
2. Navigate to Storage
3. Verify that the `recall-images` bucket exists
4. Ensure the bucket is set to **Public**
5. Check that RLS policies are properly configured

## Migration Notes

- The `image_data` column is kept for backward compatibility during migration
- New images will be stored in Supabase Storage using `image_path`
- Old images with `image_data` will continue to work but won't be migrated automatically
- To fully migrate old images, you would need to:
  1. Read the binary data from `image_data`
  2. Upload it to Supabase Storage
  3. Update the `image_path` column
  4. Delete the `image_data` (optional)

## Testing

After migration:

1. Create a new recall with images
2. Verify images are uploaded to Storage (check Storage dashboard)
3. Verify images display correctly in the app
4. Test editing and deleting recalls with images
5. Test search functionality with the new search icon

## Rollback

If you need to rollback:

```sql
-- Remove storage policies
drop policy if exists "Users can upload their own images" on storage.objects;
drop policy if exists "Users can view their own images" on storage.objects;
drop policy if exists "Users can update their own images" on storage.objects;
drop policy if exists "Users can delete their own images" on storage.objects;
drop policy if exists "Public images are viewable by everyone" on storage.objects;

-- Remove bucket (this will delete all images!)
delete from storage.buckets where id = 'recall-images';

-- Remove image_path column
alter table recall_images drop column if exists image_path;
```

## Key Changes in Code

### utils/supabase.ts
- `uploadImageToStorage()`: Uploads images to Supabase Storage
- `getImageUrl()`: Gets public URL for stored images
- `deleteImageFromStorage()`: Deletes images from storage
- `saveImageRecord()`: Saves image metadata to database
- `deleteImageRecord()`: Deletes image records from database

### hooks/useNotes.ts
- Updated to fetch image paths and convert to URLs
- Updated delete logic to remove from both storage and database

### app/note-editor.tsx
- Updated to upload images to storage instead of database
- Simplified image handling with storage paths

### app/search.tsx
- Added search icon button
- Search only triggers when button is clicked
- Improved UX with visual feedback
