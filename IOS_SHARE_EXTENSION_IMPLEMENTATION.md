
# iOS Share Extension Implementation

This document describes the iOS Share Extension implementation for the Recall app using `@bacons/apple-targets`.

## Overview

The Share Extension allows users to share content from other apps (Safari, Photos, Notes, Instagram, etc.) directly to Recall. The implementation uses `@bacons/apple-targets` to create a native iOS Share Extension target.

## Architecture

### Components

1. **Share Extension Target** (`targets/share-extension/`)
   - Entry point: `index.ts`
   - Handles incoming shared content
   - Saves data to App Group shared container
   - Opens main app via deep link

2. **Main App Integration**
   - Reads shared data from App Group container
   - Processes and displays shared content
   - Cleans up shared data after processing

3. **App Group**
   - Identifier: `group.com.anonymous.Natively`
   - Enables data sharing between extension and main app
   - Stores temporary shared data and files

### Data Flow

```
Other App → Share Sheet → Share Extension → App Group Container → Main App → Note Editor
```

1. User shares content from another app
2. iOS shows share sheet with Recall option
3. Share Extension receives and processes content
4. Data is saved to App Group container
5. Share Extension opens main app via deep link (`natively://share-intent`)
6. Main app reads data from container
7. User is taken to note editor with pre-filled content
8. Shared data is cleaned up after processing

## Supported Content Types

The Share Extension supports the following content types:

### Text
- `public.plain-text`
- `public.text`
- `public.utf8-plain-text`

### URLs
- `public.url`
- `public.file-url`
- Web pages from Safari
- Links from any app

### Images
- `public.image`
- `public.jpeg`
- `public.png`
- `public.heic`
- `public.heif`
- `public.gif`
- `public.webp`
- `public.tiff`
- `public.bmp`

### Videos
- `public.movie`
- `public.video`
- `public.mpeg-4`
- `com.apple.quicktime-movie`

### Documents
- `com.adobe.pdf`

## Configuration

### app.json

The Share Extension is configured in `app.json` using the `@bacons/apple-targets` plugin:

```json
{
  "plugins": [
    [
      "@bacons/apple-targets",
      {
        "targets": [
          {
            "type": "share-extension",
            "name": "ShareExtension",
            "bundleIdentifier": "com.anonymous.Natively.ShareExtension",
            "deploymentTarget": "15.0",
            "entitlements": {
              "com.apple.security.application-groups": [
                "group.com.anonymous.Natively"
              ]
            },
            "icon": "./assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png"
          }
        ]
      }
    ]
  ]
}
```

### Entitlements

Both the main app and Share Extension have the App Groups entitlement:

```xml
<key>com.apple.security.application-groups</key>
<array>
  <string>group.com.anonymous.Natively</string>
</array>
```

### Info.plist

The Share Extension's `Info.plist` defines activation rules:

- Supports text, URLs, images, videos, and files
- Maximum 10 attachments
- Minimum 1 attachment
- Supports web pages and web URLs

## Building

### Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Prebuild iOS project:
   ```bash
   npx expo prebuild -p ios --clean
   ```

### Local Development

1. Open the project in Xcode:
   ```bash
   open ios/Recall.xcworkspace
   ```

2. Select the main app target and run on a device or simulator

3. Test sharing from other apps (Safari, Photos, Notes, etc.)

### EAS Build

Build with EAS:

```bash
eas build --platform ios --profile production
```

## Testing

### Test Scenarios

1. **Safari URL Sharing**
   - Open Safari
   - Navigate to any website
   - Tap Share button
   - Select Recall
   - Verify URL appears in note editor

2. **Photos App Image Sharing**
   - Open Photos app
   - Select one or more photos
   - Tap Share button
   - Select Recall
   - Verify images appear in note editor

3. **Notes App Text Sharing**
   - Open Notes app
   - Select text in a note
   - Tap Share button
   - Select Recall
   - Verify text appears in note editor

4. **Instagram Post Sharing**
   - Open Instagram
   - View a post
   - Tap Share button
   - Select Recall
   - Verify content appears in note editor

### Debugging

Enable detailed logging by checking the console output:

```bash
# View logs from Share Extension
xcrun simctl spawn booted log stream --predicate 'subsystem contains "com.anonymous.Natively"'
```

Look for log messages prefixed with `[ShareExtension]` and `[ShareExtensionModule]`.

## Troubleshooting

### Share Extension Not Appearing

1. Verify App Groups entitlement is enabled in both targets
2. Check that bundle identifiers are correct
3. Ensure deployment target is iOS 15.0 or higher
4. Rebuild the app completely

### Shared Data Not Received

1. Check App Group container path is correct
2. Verify file permissions in shared container
3. Check that deep link URL scheme is registered
4. Review console logs for errors

### Images Not Loading

1. Verify images are being copied to shared container
2. Check file paths are correct
3. Ensure main app has permission to access shared container
4. Verify images are being copied from shared container to app directory

## API Reference

### Share Extension Module

```typescript
import { getSharedData, clearSharedData, copySharedImages } from '@/utils/shareExtensionModule';

// Get shared data
const data = await getSharedData();

// Copy images from shared container
const copiedImages = await copySharedImages(data.images);

// Clear shared data after processing
await clearSharedData();
```

### Native Share Receiver

```typescript
import { getInitialShareData, listenForShareIntents } from '@/utils/nativeShareReceiver';

// Get initial share data on app launch
const initialData = await getInitialShareData();

// Listen for share intents while app is running
const unsubscribe = listenForShareIntents((shareData) => {
  console.log('Received share:', shareData);
});
```

## Security Considerations

1. **App Groups**: Only accessible by apps with the same App Group identifier
2. **Data Cleanup**: Shared data is deleted after processing
3. **File Permissions**: Files in shared container are only accessible by authorized apps
4. **Deep Links**: URL scheme is registered only for this app

## Performance

- Share Extension loads quickly (< 1 second)
- File copying is done asynchronously
- Large files (> 10MB) may take longer to process
- Main app opens immediately after sharing

## Limitations

1. Maximum 10 attachments per share
2. File size limited by iOS (typically 50MB)
3. Some apps may not support all content types
4. Web pages may only share URL, not full content

## Future Improvements

1. Add support for more document types (Word, Excel, etc.)
2. Implement preview in Share Extension
3. Add option to select category before sharing
4. Support sharing to specific folders/tags
5. Add quick note feature in Share Extension
