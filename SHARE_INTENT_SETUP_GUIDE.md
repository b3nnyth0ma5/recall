
# Share Intent Setup Guide for Recall App

This guide explains how to set up and use the share intent functionality in the Recall app, allowing users to share content from Instagram, Safari, Photos, and other apps directly to Recall.

## Overview

The Recall app now supports receiving share intents from other apps on both iOS and Android. Users can share:
- **Text** - Notes, captions, messages
- **Images** - Photos from gallery or camera
- **URLs** - Web links, social media posts

## Architecture

### iOS Implementation
- Uses **iOS Share Extension** via `@bacons/apple-targets`
- Shares data through **App Group** container (`group.com.anonymous.Natively`)
- Opens main app via deep link (`natively://share-intent`)

### Android Implementation
- Uses **Android Intent Filters** configured in `app.json`
- Handles `SEND` and `SEND_MULTIPLE` actions
- Supports multiple MIME types (text, images, videos)

### Flow
```
Other App → Share Sheet → Recall → Create Recall Screen → Save with Edge Functions
```

## Configuration

### 1. App Configuration (app.json)

The app is already configured with:

**iOS:**
- Share Extension target with App Group entitlement
- URL schemes: `natively://` and `recall://`
- Deep link handling for share intents

**Android:**
- Intent filters for `SEND` and `SEND_MULTIPLE` actions
- MIME types: `text/plain`, `image/*`, `video/*`

### 2. Required Files

All necessary files have been created:

- `utils/shareExtensionModule.ts` - Handles reading shared data from iOS Share Extension
- `utils/nativeShareReceiver.ts` - Unified interface for receiving share intents
- `app/create-recall-from-share.tsx` - UI screen for creating recalls from shared content
- `components/CreateRecallFromShare.tsx` - Reusable component for share UI
- `types/ShareExtension.ts` - TypeScript type definitions

### 3. App Layout Integration

The `app/_layout.tsx` has been updated to:
- Check for pending share data on app launch
- Navigate to create-recall-from-share screen when share data is detected
- Handle share intents while app is running

## Building the App

### iOS Build

For iOS, you need to prebuild the native project to generate the Share Extension:

```bash
# Clean prebuild
npx expo prebuild -p ios --clean

# Open in Xcode
open ios/Recall.xcworkspace

# Build and run on device or simulator
```

**Important iOS Notes:**
- The Share Extension will be created automatically by `@bacons/apple-targets`
- App Groups must be enabled in your Apple Developer account
- Test on a real device for best results (Share Extensions have limitations in simulator)

### Android Build

For Android, the intent filters are configured automatically:

```bash
# Prebuild Android
npx expo prebuild -p android --clean

# Build and run
npx expo run:android
```

### EAS Build

For production builds:

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

## Testing

### iOS Testing

1. **Safari URL Sharing:**
   - Open Safari and navigate to any website
   - Tap the Share button
   - Scroll and find "Recall" in the share sheet
   - Tap Recall - the app should open with the URL pre-filled

2. **Photos App Image Sharing:**
   - Open Photos app
   - Select one or more photos
   - Tap Share button
   - Select Recall
   - Images should appear in the create recall screen

3. **Instagram Sharing:**
   - Open Instagram
   - View a post
   - Tap the three dots menu
   - Select "Share to..." or "Copy Link"
   - If copying link, paste in Recall
   - If sharing directly, select Recall from share sheet

### Android Testing

1. **Text Sharing:**
   - Select text in any app
   - Tap Share
   - Select Recall
   - Text should appear in create recall screen

2. **Image Sharing:**
   - Open Gallery or Photos
   - Select images
   - Tap Share
   - Select Recall
   - Images should appear in create recall screen

3. **Instagram Sharing:**
   - Open Instagram
   - View a post
   - Tap the paper airplane icon (Share)
   - Select "Share to..." or "Copy Link"
   - Select Recall from the list

## User Experience

### Share Flow

1. **User shares content from another app**
   - Selects Recall from share sheet
   - App opens automatically

2. **Create Recall screen appears**
   - Shared content is pre-filled (text, images, URLs)
   - User can edit the text
   - User can add/remove images
   - User can add a location (optional)

3. **User saves the recall**
   - Recall is created in database
   - Images are uploaded to Cloudflare CDN
   - Edge functions run automatically:
     - OCR processing for images
     - People detection
     - Category matching
     - Embedding generation

4. **User returns to home screen**
   - New recall appears in the feed
   - All processing happens in background

### Features

- ✅ Pre-filled content from share
- ✅ Edit text before saving
- ✅ Add/remove images
- ✅ Add location
- ✅ All edge functions run automatically
- ✅ Background image processing
- ✅ Seamless navigation

## Troubleshooting

### iOS Issues

**Share Extension not appearing:**
- Rebuild the app completely: `npx expo prebuild -p ios --clean`
- Check that App Groups are enabled in Xcode
- Verify bundle identifiers are correct
- Test on a real device (simulator has limitations)

**No content received:**
- Check console logs for errors
- Verify App Group identifier matches in both targets
- Ensure deep link URL scheme is registered
- Check file permissions in shared container

**Images not loading:**
- Verify images are being copied to shared container
- Check file paths are correct
- Ensure sufficient storage space
- Review file system logs

### Android Issues

**Share option not appearing:**
- Rebuild the app: `npx expo prebuild -p android --clean`
- Check intent filters in AndroidManifest.xml
- Verify MIME types are correct
- Test with different apps

**Content not received:**
- Check console logs for errors
- Verify intent handling code is correct
- Test with simple text sharing first
- Check permissions

### General Issues

**App crashes on share:**
- Check console logs for error messages
- Verify all required files are present
- Test with minimal content first (just text)
- Check memory usage

**Edge functions not running:**
- Verify Supabase connection
- Check edge function logs
- Ensure recall is created successfully
- Test edge functions manually

## Manual Configuration Steps

### iOS Share Extension (if needed)

If the Share Extension doesn't work automatically, you may need to:

1. **Open Xcode:**
   ```bash
   open ios/Recall.xcworkspace
   ```

2. **Verify Share Extension Target:**
   - Check that "ShareExtension" target exists
   - Verify bundle identifier: `com.anonymous.Natively.ShareExtension`
   - Check deployment target: iOS 15.1+

3. **Verify App Groups:**
   - Select main app target
   - Go to "Signing & Capabilities"
   - Ensure "App Groups" capability is enabled
   - Verify group: `group.com.anonymous.Natively`
   - Repeat for ShareExtension target

4. **Verify Info.plist:**
   - Check ShareExtension's Info.plist
   - Verify NSExtension configuration
   - Check activation rules

### Android Intent Filters (if needed)

If Android sharing doesn't work, verify in `android/app/src/main/AndroidManifest.xml`:

```xml
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/plain" />
</intent-filter>

<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="image/*" />
</intent-filter>

<intent-filter>
    <action android:name="android.intent.action.SEND_MULTIPLE" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="image/*" />
</intent-filter>
```

## Limitations

### iOS
- Maximum 10 attachments per share (iOS limitation)
- File size limited by iOS (typically 50MB)
- Share Extension cannot access network directly
- Some apps may not support all content types

### Android
- Intent data format varies by app
- Some apps may not include all metadata
- File URIs may require special permissions
- Video sharing may be limited by file size

### General
- Web version doesn't support share intents (browser limitation)
- Large files may take time to process
- Network required for saving recalls
- Edge functions run asynchronously

## Future Enhancements

Potential improvements:
- [ ] Add preview in Share Extension (iOS)
- [ ] Support more document types (PDF, Word, etc.)
- [ ] Add category selection before saving
- [ ] Implement quick note feature in extension
- [ ] Add offline support with sync
- [ ] Improve error handling and user feedback
- [ ] Add analytics for share usage
- [ ] Support sharing to specific categories

## Support

If you encounter issues:

1. **Check the logs:**
   - iOS: Xcode console or device logs
   - Android: `adb logcat` or Android Studio
   - Look for `[ShareExtension]`, `[NativeShareReceiver]`, or `[CreateRecallFromShare]` tags

2. **Verify configuration:**
   - Check app.json settings
   - Verify bundle identifiers
   - Check entitlements and permissions

3. **Test incrementally:**
   - Start with simple text sharing
   - Then try single image
   - Then multiple images
   - Finally test with different apps

4. **Review documentation:**
   - Check IOS_SHARE_EXTENSION_IMPLEMENTATION.md
   - Review SHARE_EXTENSION_README.md
   - Read Apple/Android documentation

## Summary

The share intent functionality is now fully implemented and ready to use. Users can share content from Instagram, Safari, Photos, and any other app that supports sharing. The implementation handles:

- ✅ Text, images, and URLs
- ✅ Multiple images at once
- ✅ Location tagging
- ✅ Automatic edge function processing
- ✅ Background image uploads
- ✅ Seamless user experience

Build the app with `npx expo prebuild` and test on real devices for the best experience!
