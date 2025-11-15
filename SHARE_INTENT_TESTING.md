
# Share Intent Testing Guide

Quick reference for testing the share intent functionality.

## Prerequisites

1. App must be built with native code:
   ```bash
   expo prebuild -p ios
   # or
   expo prebuild -p android
   ```

2. App must be installed on a physical device or simulator

3. User must be logged in

## Test Scenarios

### 1. Share Text from Notes App

**iOS:**
1. Open Notes app
2. Create or open a note with text
3. Tap the share button (square with arrow)
4. Scroll and tap "Recall"
5. ✅ Verify: Share panel opens with text pre-filled

**Android:**
1. Open any text app (Keep, Notes, etc.)
2. Select text
3. Tap share
4. Select "Recall"
5. ✅ Verify: Share panel opens with text pre-filled

### 2. Share Single Image from Photos

**iOS:**
1. Open Photos app
2. Select an image
3. Tap share button
4. Tap "Recall"
5. ✅ Verify: Share panel opens with image displayed

**Android:**
1. Open Gallery/Photos app
2. Select an image
3. Tap share
4. Select "Recall"
5. ✅ Verify: Share panel opens with image displayed

### 3. Share Multiple Images

**iOS:**
1. Open Photos app
2. Tap "Select"
3. Select 2-3 images
4. Tap share button
5. Tap "Recall"
6. ✅ Verify: Share panel opens with all images in carousel

**Android:**
1. Open Gallery app
2. Long press to select multiple images
3. Tap share
4. Select "Recall"
5. ✅ Verify: Share panel opens with all images in carousel

### 4. Share URL from Browser

**iOS/Android:**
1. Open Safari/Chrome
2. Navigate to any webpage
3. Tap share
4. Select "Recall"
5. ✅ Verify: Share panel opens with URL as text

### 5. Edit and Save

1. Open share panel with any content
2. Edit the text
3. Tap "Save Recall"
4. ✅ Verify: Toast appears "Recall Saved"
5. ✅ Verify: App navigates to home
6. ✅ Verify: New recall appears in list

### 6. Remove Images

1. Share multiple images
2. Tap X button on an image
3. ✅ Verify: Image is removed
4. ✅ Verify: Carousel updates correctly
5. Save the recall
6. ✅ Verify: Only remaining images are saved

### 7. Cancel Share

1. Open share panel with content
2. Tap "Cancel"
3. ✅ Verify: Panel closes
4. ✅ Verify: App returns to home
5. ✅ Verify: No recall was created

### 8. Toast Navigation

1. Share and save content
2. When toast appears, tap it
3. ✅ Verify: Navigates to the new recall
4. ✅ Verify: Recall shows correct content

### 9. Location Capture

1. Ensure location permission is granted
2. Share and save content
3. Open the new recall
4. ✅ Verify: Location is captured and displayed

### 10. OCR Processing

1. Share an image with text
2. Save the recall
3. Wait a few seconds
4. Open the recall
5. ✅ Verify: OCR text is extracted and displayed

## Expected Behaviors

### Success Cases
- ✅ Share panel opens smoothly with animation
- ✅ Content is displayed correctly
- ✅ Images load properly
- ✅ Text is editable
- ✅ Save creates recall in database
- ✅ Toast appears with success message
- ✅ Navigation works correctly

### Error Cases
- ❌ If not logged in: Should show error alert
- ❌ If network error: Should show error alert
- ❌ If upload fails: Should show error alert
- ❌ If no content: Save button should be disabled

## Common Issues

### "Recall" Not in Share Menu

**Solution:**
1. Rebuild the app with `expo prebuild`
2. Reinstall the app
3. Check `app.json` configuration
4. Verify intent filters are correct

### Images Not Loading

**Solution:**
1. Check network connectivity
2. Verify Cloudflare CDN is configured
3. Check console logs for errors
4. Try with smaller images

### Location Not Captured

**Solution:**
1. Grant location permission in Settings
2. Enable location services
3. Try again in an area with good GPS signal

### Toast Not Appearing

**Solution:**
1. Check that Toast component is in _layout.tsx
2. Verify react-native-toast-message is installed
3. Check console for errors

## Debug Logs

Enable debug logging by checking the console for:
- "Share intent data:" - Shows parsed share data
- "Saving recall from shared content..." - Save initiated
- "Recall created:" - Database insert successful
- "Image uploaded:" - Image upload successful
- "Recall saved successfully" - Complete success

## Performance Benchmarks

Expected timings:
- Panel open: < 300ms
- Image display: < 500ms
- Save recall (no images): < 1s
- Save recall (1 image): < 3s
- Save recall (3 images): < 8s
- Toast display: Immediate

## Accessibility

Test with:
- VoiceOver (iOS) / TalkBack (Android)
- Large text sizes
- Reduced motion settings
- High contrast mode

## Platform Differences

### iOS
- Uses document types for share configuration
- Share sheet has native iOS design
- Blur effects work perfectly

### Android
- Uses intent filters for share configuration
- Share menu has native Android design
- Blur effects may vary by device

## Reporting Issues

When reporting issues, include:
1. Platform (iOS/Android) and version
2. Device model
3. App version
4. Steps to reproduce
5. Console logs
6. Screenshots/video if possible

## Success Criteria

All tests pass when:
- ✅ Share option appears in all tested apps
- ✅ Content imports correctly
- ✅ UI is responsive and smooth
- ✅ Saves work reliably
- ✅ Toast notifications appear
- ✅ Navigation works correctly
- ✅ No crashes or errors
- ✅ Performance is acceptable
