
# Supabase Storage Setup Guide

This guide will help you set up the Supabase Storage bucket for image uploads.

## Issue: Images Not Uploading

If images aren't uploading to Supabase Storage, it's likely because:

1. The storage bucket doesn't exist
2. The bucket has incorrect permissions
3. Row Level Security (RLS) policies are blocking uploads

## Step-by-Step Setup

### 1. Create the Storage Bucket

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project (ID: cesmsdnblkdjkskmiqib)
3. Navigate to **Storage** in the left sidebar
4. Click **Create a new bucket**
5. Enter the bucket name: `recall-images`
6. Choose **Public bucket** (or configure RLS policies if you want private storage)
7. Click **Create bucket**

### 2. Configure Bucket Policies (If Using Private Bucket)

If you chose to make the bucket private, you need to set up RLS policies:

1. In the Storage section, click on your `recall-images` bucket
2. Go to the **Policies** tab
3. Click **New Policy**

#### Policy 1: Allow Authenticated Users to Upload

```sql
CREATE POLICY "Allow authenticated users to upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'recall-images');
```

#### Policy 2: Allow Users to Read Their Own Images

```sql
CREATE POLICY "Allow users to read images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'recall-images');
```

#### Policy 3: Allow Users to Delete Their Own Images

```sql
CREATE POLICY "Allow users to delete their own images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'recall-images');
```

### 3. Verify the Setup

After creating the bucket, the app will automatically check if it exists when you open the note editor. If the bucket is properly configured, you should be able to:

- Take photos with the camera
- Pick images from your gallery
- Upload them to Supabase Storage
- See them displayed in your notes

### 4. Troubleshooting

#### Check Console Logs

The app now includes detailed logging. Check your console for messages like:

- `=== Starting image upload ===`
- `User authenticated: [user-id]`
- `Available buckets: [bucket-names]`
- `=== Upload successful ===`

#### Common Issues

**Issue: "Bucket 'recall-images' does not exist"**
- Solution: Create the bucket in Supabase Dashboard (see Step 1)

**Issue: "No active session - user must be logged in"**
- Solution: Make sure you're logged in to the app

**Issue: "Error uploading image to storage: [permission denied]"**
- Solution: Check your bucket policies (see Step 2)

**Issue: "Error message: new row violates row-level security policy"**
- Solution: Check RLS policies on the `recall_images` table

### 5. Database Table Setup

Make sure your `recall_images` table exists and has proper RLS policies:

```sql
-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS recall_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recall_id UUID NOT NULL REFERENCES recalls(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

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

### 6. Testing

1. Open the app and log in
2. Create a new recall
3. Try adding an image using the camera or gallery
4. Check the console logs for any errors
5. Save the recall
6. Verify the image appears in the recall list

## Additional Resources

- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
