
# Developer Reference: Image Storage & Search

## Quick Reference

### Image Storage Functions

```typescript
// Upload image to Supabase Storage
const storagePath = await uploadImageToStorage(localUri, recallId);

// Get public URL for image
const publicUrl = getImageUrl(storagePath);

// Delete image from storage
await deleteImageFromStorage(storagePath);

// Save image record to database
const imageId = await saveImageRecord(recallId, storagePath, contentType);

// Delete image record from database
await deleteImageRecord(imageId);

// Get storage path from database
const path = await getImagePath(imageId);
```

### Storage Structure

```
recall-images/
  └── {recall_id}/
      └── {timestamp}-{random}.{ext}
```

Example:
```
recall-images/
  └── 123e4567-e89b-12d3-a456-426614174000/
      ├── 1704067200000-abc123.jpg
      └── 1704067201000-def456.png
```

### Database Schema

```sql
-- recall_images table
{
  id: uuid,
  recall_id: uuid,
  image_path: text,        -- "recall_id/timestamp-random.ext"
  image_data: bytea,       -- DEPRECATED
  content_type: text,      -- "image/jpeg", "image/png", etc.
  created_at: timestamp
}
```

### Image Upload Flow

```
1. User selects image
   ↓
2. Read file as base64 (File API)
   ↓
3. Convert to binary (decode base64)
   ↓
4. Upload to Storage (uploadImageToStorage)
   ↓
5. Get storage path
   ↓
6. Save record to database (saveImageRecord)
   ↓
7. Display using public URL (getImageUrl)
```

### Image Deletion Flow

```
1. Get image record from database
   ↓
2. Extract storage path
   ↓
3. Delete from storage (deleteImageFromStorage)
   ↓
4. Delete record from database (deleteImageRecord)
```

### Search Implementation

```typescript
// Search bar with icon button
<View style={styles.searchBar}>
  <IconSymbol name="magnifyingglass" />
  <TextInput
    value={searchQuery}
    onChangeText={setSearchQuery}
    onSubmitEditing={handleSearch}  // Enter key
  />
  <Pressable onPress={handleSearch}>  // Search button
    <IconSymbol name="magnifyingglass" />
  </Pressable>
</View>
```

### RLS Policies

```sql
-- Users can only access their own images
-- Folder structure: {user_id}/{recall_id}/...

-- Upload policy
auth.uid()::text = (storage.foldername(name))[1]

-- View policy
auth.uid()::text = (storage.foldername(name))[1]

-- Delete policy
auth.uid()::text = (storage.foldername(name))[1]
```

## Code Examples

### Creating Recall with Images

```typescript
// 1. Create recall
const recallId = await addNote({
  text: 'My recall',
  location: 'San Francisco',
  latitude: 37.7749,
  longitude: -122.4194,
});

// 2. Upload images
for (const image of selectedImages) {
  const storagePath = await uploadImageToStorage(
    image.uri,
    recallId
  );
  
  if (storagePath) {
    await saveImageRecord(
      recallId,
      storagePath,
      image.contentType
    );
  }
}
```

### Displaying Images

```typescript
// Load recall with images
const { data: recall } = await supabase
  .from('recalls')
  .select('*')
  .eq('id', recallId)
  .single();

const { data: images } = await supabase
  .from('recall_images')
  .select('image_path')
  .eq('recall_id', recallId);

// Convert to public URLs
const imageUrls = images.map(img => 
  getImageUrl(img.image_path)
);

// Display in component
{imageUrls.map(url => (
  <Image source={{ uri: url }} />
))}
```

### Deleting Recall with Images

```typescript
// 1. Get all images
const { data: images } = await supabase
  .from('recall_images')
  .select('id, image_path')
  .eq('recall_id', recallId);

// 2. Delete from storage and database
for (const img of images) {
  await deleteImageFromStorage(img.image_path);
  await deleteImageRecord(img.id);
}

// 3. Delete recall
await supabase
  .from('recalls')
  .delete()
  .eq('id', recallId);
```

### Search with Icon

```typescript
const [searchQuery, setSearchQuery] = useState('');
const [hasSearched, setHasSearched] = useState(false);

const handleSearch = () => {
  if (searchQuery.trim()) {
    setHasSearched(true);
    searchNotes(searchQuery);
  }
};

// In render
<TextInput
  value={searchQuery}
  onChangeText={setSearchQuery}
  onSubmitEditing={handleSearch}
  returnKeyType="search"
/>
<Pressable 
  onPress={handleSearch}
  disabled={!searchQuery.trim()}
>
  <IconSymbol name="magnifyingglass" />
</Pressable>
```

## Environment Variables

No additional environment variables needed. Uses existing Supabase config:

```typescript
const supabaseUrl = 'https://cesmsdnblkdjkskmiqib.supabase.co';
const supabaseAnonKey = 'eyJhbGc...';
```

## Error Handling

```typescript
try {
  const path = await uploadImageToStorage(uri, recallId);
  if (!path) {
    throw new Error('Upload failed');
  }
} catch (error) {
  console.error('Error uploading image:', error);
  Alert.alert('Error', 'Failed to upload image');
}
```

## Performance Tips

1. **Compress images before upload**
   ```typescript
   const result = await ImagePicker.launchImageLibraryAsync({
     quality: 0.8,  // 80% quality
   });
   ```

2. **Use loading indicators**
   ```typescript
   const [uploading, setUploading] = useState(false);
   
   setUploading(true);
   await uploadImageToStorage(uri, recallId);
   setUploading(false);
   ```

3. **Batch operations**
   ```typescript
   await Promise.all(
     images.map(img => uploadImageToStorage(img.uri, recallId))
   );
   ```

4. **Cache image URLs**
   ```typescript
   const [imageCache, setImageCache] = useState<Map<string, string>>(new Map());
   
   const getCachedUrl = (path: string) => {
     if (imageCache.has(path)) {
       return imageCache.get(path);
     }
     const url = getImageUrl(path);
     setImageCache(prev => new Map(prev).set(path, url));
     return url;
   };
   ```

## Debugging

### Check Storage Upload

```typescript
console.log('Uploading image:', uri);
const path = await uploadImageToStorage(uri, recallId);
console.log('Upload result:', path);
```

### Check Public URL

```typescript
const url = getImageUrl(path);
console.log('Public URL:', url);
// Test in browser: https://...supabase.co/storage/v1/object/public/recall-images/...
```

### Check Database Record

```sql
select * from recall_images where recall_id = 'your-recall-id';
```

### Check Storage Files

```sql
select * from storage.objects where bucket_id = 'recall-images';
```

## Common Patterns

### Loading State

```typescript
const [loading, setLoading] = useState(false);

const handleUpload = async () => {
  setLoading(true);
  try {
    await uploadImageToStorage(uri, recallId);
  } finally {
    setLoading(false);
  }
};
```

### Error Boundary

```typescript
const [error, setError] = useState<string | null>(null);

try {
  await uploadImageToStorage(uri, recallId);
  setError(null);
} catch (err) {
  setError('Failed to upload image');
  console.error(err);
}
```

### Retry Logic

```typescript
const uploadWithRetry = async (uri: string, recallId: string, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await uploadImageToStorage(uri, recallId);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};
```

## Security Considerations

1. **RLS Policies**: Ensure users can only access their own images
2. **File Size Limits**: Implement client-side validation
3. **File Type Validation**: Only allow image types
4. **Rate Limiting**: Prevent abuse of upload endpoint
5. **Content Moderation**: Consider implementing image scanning

## Monitoring

Track these metrics:
- Upload success rate
- Average upload time
- Storage usage per user
- Failed uploads
- Image load times
- Search query performance

## Resources

- [Supabase Storage Docs](https://supabase.com/docs/guides/storage)
- [RLS Policies](https://supabase.com/docs/guides/auth/row-level-security)
- [Expo Image Picker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- [Expo File System](https://docs.expo.dev/versions/latest/sdk/filesystem/)
