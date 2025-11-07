
# Testing Guide: Image Storage & Search Updates

## Prerequisites

Before testing, ensure:
1. SQL migration has been run (see MIGRATION_GUIDE.md)
2. Storage bucket `recall-images` exists and is public
3. RLS policies are configured correctly
4. App is running on a device/simulator

## Test Scenarios

### 1. Image Upload Tests

#### Test 1.1: Upload Single Image from Gallery
**Steps:**
1. Open the app and tap "+" to create new recall
2. Tap the photo gallery icon
3. Select one image
4. Add some text
5. Tap save (checkmark)

**Expected:**
- Image appears in preview
- Image uploads to Supabase Storage
- Recall saves successfully
- Image displays on home screen

**Verify in Supabase:**
- Go to Storage > recall-images
- Find folder with recall ID
- Verify image file exists

#### Test 1.2: Upload Multiple Images
**Steps:**
1. Create new recall
2. Tap photo gallery icon
3. Select multiple images (2-3)
4. Add text
5. Save

**Expected:**
- All images appear in preview
- All images upload to storage
- Image carousel works on home screen
- Indicators show correct count

#### Test 1.3: Take Photo with Camera
**Steps:**
1. Create new recall
2. Tap camera icon
3. Take a photo
4. Accept photo
5. Save recall

**Expected:**
- Photo appears in preview
- Photo uploads to storage
- Photo displays correctly

### 2. Image Editing Tests

#### Test 2.1: Add Images to Existing Recall
**Steps:**
1. Open existing recall (without images)
2. Tap photo gallery icon
3. Add 1-2 images
4. Save

**Expected:**
- Images upload successfully
- Recall updates with new images
- Images display on home screen

#### Test 2.2: Remove Images from Recall
**Steps:**
1. Open recall with images
2. Tap X button on image preview
3. Save

**Expected:**
- Image removed from preview
- Image deleted from storage
- Image record deleted from database
- Recall updates successfully

**Verify in Supabase:**
- Check Storage - image file should be deleted
- Check recall_images table - record should be deleted

#### Test 2.3: Replace All Images
**Steps:**
1. Open recall with images
2. Remove all existing images
3. Add new images
4. Save

**Expected:**
- Old images deleted from storage
- New images uploaded
- Recall displays new images only

### 3. Image Deletion Tests

#### Test 3.1: Delete Recall with Images
**Steps:**
1. Open recall with images
2. Tap trash icon
3. Confirm deletion

**Expected:**
- Recall deleted from database
- All images deleted from storage
- All image records deleted from database

**Verify in Supabase:**
- Check Storage - folder should be empty or deleted
- Check recall_images table - no records for that recall_id

### 4. Search Functionality Tests

#### Test 4.1: Search with Icon Button
**Steps:**
1. Go to Search screen
2. Type search query
3. Tap search icon button (magnifying glass)

**Expected:**
- Search executes
- Results display
- Search saved to history

#### Test 4.2: Search with Enter Key
**Steps:**
1. Go to Search screen
2. Type search query
3. Press Enter/Return on keyboard

**Expected:**
- Search executes (same as icon button)
- Results display
- Search saved to history

#### Test 4.3: Search Icon Disabled State
**Steps:**
1. Go to Search screen
2. Observe search icon (no text entered)

**Expected:**
- Search icon appears dimmed/disabled
- Tapping does nothing

**Then:**
3. Type some text
4. Observe search icon

**Expected:**
- Search icon becomes active/bright
- Tapping executes search

#### Test 4.4: Clear Search
**Steps:**
1. Enter search query
2. Tap X button (clear)

**Expected:**
- Search query clears
- Search history displays
- No search results shown

#### Test 4.5: Search History
**Steps:**
1. Perform 2-3 searches
2. Clear search
3. View search history

**Expected:**
- Recent searches display
- Tapping history item executes search
- Most recent searches at top

### 5. Image Display Tests

#### Test 5.1: Image Carousel
**Steps:**
1. View recall with multiple images
2. Swipe through images

**Expected:**
- Images swipe smoothly
- Indicators update correctly
- All images display properly

#### Test 5.2: Image Loading
**Steps:**
1. Create recall with images
2. Close app
3. Reopen app
4. View recall

**Expected:**
- Images load from storage
- No errors in console
- Images display correctly

#### Test 5.3: Image Error Handling
**Steps:**
1. Manually delete image from storage (via Supabase dashboard)
2. View recall in app

**Expected:**
- App handles missing image gracefully
- No crash
- Other images still display

### 6. Performance Tests

#### Test 6.1: Large Image Upload
**Steps:**
1. Select large image (5-10MB)
2. Upload to recall

**Expected:**
- Upload completes successfully
- Loading indicator shows
- Image displays correctly

#### Test 6.2: Multiple Recalls with Images
**Steps:**
1. Create 10+ recalls with images
2. Scroll through home screen

**Expected:**
- Smooth scrolling
- Images load efficiently
- No memory issues

### 7. Edge Cases

#### Test 7.1: No Internet Connection
**Steps:**
1. Disable internet
2. Try to create recall with image

**Expected:**
- Error message displays
- Graceful failure
- No crash

#### Test 7.2: Storage Quota Exceeded
**Steps:**
1. Upload many large images
2. Exceed storage quota

**Expected:**
- Error message displays
- User informed of issue
- App doesn't crash

#### Test 7.3: Concurrent Edits
**Steps:**
1. Open recall on two devices
2. Edit images on both
3. Save both

**Expected:**
- Last save wins
- No data corruption
- Proper conflict handling

## Verification Checklist

After each test, verify:

- [ ] No errors in console
- [ ] No crashes
- [ ] Images display correctly
- [ ] Storage bucket updated correctly
- [ ] Database records correct
- [ ] RLS policies working
- [ ] Search functionality works
- [ ] UI responsive and smooth

## Common Issues & Solutions

### Issue: Images not uploading
**Check:**
- Storage bucket exists
- Bucket is public
- RLS policies configured
- User authenticated
- Internet connection

### Issue: Images not displaying
**Check:**
- Image path in database
- Public URL accessible
- Image file exists in storage
- Content type correct

### Issue: Search not working
**Check:**
- Search query not empty
- Database connection
- RLS policies allow read
- Console for errors

### Issue: Storage quota exceeded
**Solution:**
- Upgrade Supabase plan
- Delete old images
- Implement image compression

## Performance Benchmarks

Expected performance:
- Image upload: < 3 seconds (for 2MB image)
- Image load: < 1 second (with good connection)
- Search: < 500ms
- Recall creation: < 2 seconds

## Reporting Issues

When reporting issues, include:
1. Device/platform (iOS/Android/Web)
2. Steps to reproduce
3. Expected vs actual behavior
4. Console errors
5. Screenshots if applicable
6. Supabase logs (if relevant)
