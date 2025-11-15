
# Share Intent Implementation Guide

This document describes the implementation of native share functionality that allows other apps to share content (text and images) into the Recall app.

## Overview

The app now supports receiving shared content from other apps through the native share menu on both iOS and Android. When users share content from another app, they can select "Recall" from the share menu, and the content will be imported into a new recall.

## Features

### 1. Native Share Integration
- **iOS**: Configured through `CFBundleDocumentTypes` in `app.json`
- **Android**: Configured through `intentFilters` in `app.json`
- Supports text and images (single or multiple)

### 2. CreateRecallFromShare Component
A beautiful slide-up panel that displays:
- Imported images with carousel navigation
- Text input for notes
- Remove image functionality
- Save/Cancel actions
- Loading states

### 3. Toast Notifications
Custom-styled toast notifications that:
- Confirm successful save
- Allow navigation to the newly created recall
- Match the app's dark theme design
- Use blur effects for a modern look

## File Structure

### New Files
- `components/CreateRecallFromShare.tsx` - Slide-up panel UI component
- `components/CustomToast.tsx` - Custom toast configuration
- `app/share-intent.tsx` - Route handler for share intents
- `utils/shareIntentHandler.ts` - Utility functions for parsing share data

### Modified Files
- `app.json` - Added intent filters and document types
- `app/_layout.tsx` - Added Toast component and share intent handling
- `app/(tabs)/(home)/index.tsx` - Added share intent detection on app launch
- `app/(tabs)/(home)/index.web.tsx` - Web version (share intents not supported)

## Configuration

### iOS Configuration (app.json)
```json
"ios": {
  "infoPlist": {
    "CFBundleDocumentTypes": [
      {
        "CFBundleTypeName": "Text",
        "LSHandlerRank": "Alternate",
        "LSItemContentTypes": ["public.plain-text", "public.text"]
      },
      {
        "CFBundleTypeName": "Images",
        "LSHandlerRank": "Alternate",
        "LSItemContentTypes": ["public.image", "public.jpeg", "public.png"]
      }
    ]
  }
}
```

### Android Configuration (app.json)
```json
"android": {
  "intentFilters": [
    {
      "action": "android.intent.action.SEND",
      "category": ["android.intent.category.DEFAULT"],
      "data": [{"mimeType": "text/plain"}]
    },
    {
      "action": "android.intent.action.SEND",
      "category": ["android.intent.category.DEFAULT"],
      "data": [{"mimeType": "image/*"}]
    },
    {
      "action": "android.intent.action.SEND_MULTIPLE",
      "category": ["android.intent.category.DEFAULT"],
      "data": [{"mimeType": "image/*"}]
    }
  ]
}
```

## User Flow

1. **Share from Another App**
   - User opens another app (e.g., Photos, Notes, Browser)
   - Taps the share button
   - Selects "Recall" from the share menu

2. **Import Content**
   - App opens with the CreateRecallFromShare panel
   - Shared content (text/images) is displayed
   - User can edit the text or remove images

3. **Save Recall**
   - User taps "Save Recall"
   - App creates a new recall with:
     - Shared text
     - Uploaded images
     - Current location (if permission granted)
     - OCR processing triggered for images
     - Category matching triggered

4. **Confirmation**
   - Toast notification appears: "Recall Saved"
   - User can tap the toast to view the new recall
   - App returns to home screen

## Technical Details

### Share Intent Detection
The app checks for share intents on launch in the home screen:
```typescript
const shareData = await getShareIntentData();
if (shareData && (shareData.text || shareData.images)) {
  router.push({
    pathname: '/share-intent',
    params: {
      text: shareData.text || '',
      images: JSON.stringify(shareData.images) || '[]',
    },
  });
}
```

### Data Flow
1. Share intent received → `getShareIntentData()`
2. Navigate to `/share-intent` with params
3. Display `CreateRecallFromShare` panel
4. User edits and saves
5. Create recall in database
6. Upload images to Cloudflare CDN
7. Trigger OCR and category matching
8. Show success toast
9. Navigate to home

### Image Handling
- Images are displayed in a horizontal carousel
- Users can remove individual images
- Images are uploaded to Cloudflare CDN
- OCR processing is triggered automatically
- Supports multiple images

### Location Handling
- Automatically captures current location when saving
- Reverse geocodes to get location name
- Falls back gracefully if location permission denied

## Dependencies

### New Dependencies
- `react-native-toast-message` - Toast notifications

### Existing Dependencies Used
- `expo-linking` - Deep linking and URL parsing
- `expo-blur` - Blur effects for UI
- `react-native-reanimated` - Animations
- `expo-location` - Location services
- `@supabase/supabase-js` - Database operations

## Styling

The UI follows the app's design system:
- Dark theme with `colors.card` background
- Blur effects for modern look
- Smooth animations with react-native-reanimated
- Consistent spacing and typography
- Primary color (`colors.primary`) for CTAs

## Testing

### iOS Testing
1. Build the app with `expo prebuild -p ios`
2. Open in Xcode and run on device/simulator
3. Open Photos app
4. Select an image
5. Tap share → Select "Recall"
6. Verify the share panel opens with the image

### Android Testing
1. Build the app with `expo prebuild -p android`
2. Run on device/emulator
3. Open any app with share functionality
4. Share text or image
5. Select "Recall" from share menu
6. Verify the share panel opens with content

### Web Testing
Note: Share intents are not supported on web. The functionality is mobile-only.

## Limitations

1. **Web Support**: Share intents are not supported on web browsers
2. **File Types**: Currently supports text and images only (no videos, PDFs, etc.)
3. **Image Size**: Large images may take time to upload
4. **Location**: Requires location permission for automatic location tagging

## Future Enhancements

Potential improvements:
- Support for video files
- Support for PDF documents
- Support for URLs with metadata extraction
- Batch processing for multiple images
- Image compression before upload
- Share extension for iOS (requires native code)
- Quick share widget

## Troubleshooting

### Share Option Not Appearing
- Ensure the app is properly built with `expo prebuild`
- Check that intent filters are correctly configured in `app.json`
- Rebuild the app after configuration changes

### Images Not Loading
- Check network connectivity
- Verify Cloudflare CDN configuration
- Check console logs for upload errors

### Location Not Captured
- Ensure location permissions are granted
- Check that location services are enabled on device
- Verify `expo-location` is properly configured

## Security Considerations

- All uploads go through authenticated Supabase endpoints
- Images are stored in Cloudflare CDN with proper access controls
- User must be logged in to save recalls
- RLS policies protect user data in database

## Performance

- Images are uploaded asynchronously
- OCR processing happens in background
- Category matching is non-blocking
- UI remains responsive during uploads
- Toast notifications don't block navigation

## Conclusion

The share intent functionality provides a seamless way for users to capture content from other apps into Recall. The implementation follows platform conventions and provides a polished user experience with proper error handling and feedback.
