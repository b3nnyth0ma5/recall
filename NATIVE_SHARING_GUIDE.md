
# Native Sharing Guide for Recall App

This guide explains how the Recall app receives shared content from other apps on iOS and Android.

## Overview

The Recall app can receive shared content (text and images) from other apps through native share functionality. When a user shares content from another app and selects "Recall", the app opens and pre-fills a new note with the shared content.

## How It Works

### iOS

On iOS, the app uses **CFBundleDocumentTypes** to register as a handler for specific file types:

- **Images**: `public.image`, `public.jpeg`, `public.png`, `public.heic`
- **Text**: `public.plain-text`, `public.text`

When a user shares an image or text file to Recall:
1. iOS passes the file URL to the app via a deep link
2. The app receives the URL through `expo-linking`
3. The `nativeShareReceiver` utility processes the file URL
4. The app navigates to the note editor with the shared content pre-filled

### Android

On Android, the app uses **Intent Filters** to register for share intents:

- **Single Text**: `android.intent.action.SEND` with `text/plain` MIME type
- **Single Image**: `android.intent.action.SEND` with `image/*` MIME type
- **Multiple Images**: `android.intent.action.SEND_MULTIPLE` with `image/*` MIME type

When a user shares content to Recall:
1. Android passes the content via an Intent with extras (EXTRA_TEXT, EXTRA_STREAM)
2. The content is converted to a deep link by the Android system
3. The app receives the deep link through `expo-linking`
4. The `nativeShareReceiver` utility processes the content URI
5. For Android content URIs (`content://`), the file is copied to the app's cache directory
6. The app navigates to the note editor with the shared content pre-filled

## Configuration

### app.json

The app configuration includes:

```json
{
  "ios": {
    "infoPlist": {
      "CFBundleDocumentTypes": [
        {
          "CFBundleTypeName": "Images",
          "LSHandlerRank": "Alternate",
          "LSItemContentTypes": ["public.image", "public.jpeg", "public.png", "public.heic"]
        },
        {
          "CFBundleTypeName": "Text",
          "LSHandlerRank": "Alternate",
          "LSItemContentTypes": ["public.plain-text", "public.text"]
        }
      ],
      "CFBundleURLTypes": [
        {
          "CFBundleURLSchemes": ["natively"],
          "CFBundleURLName": "com.anonymous.Natively"
        }
      ]
    }
  },
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
  },
  "scheme": "natively"
}
```

## Code Architecture

### 1. Native Share Receiver (`utils/nativeShareReceiver.ts`)

This utility handles the low-level processing of share intents:

- **`processReceivedUrl(url: string)`**: Processes a received URL and extracts share data
- **`getInitialShareData()`**: Gets share data when the app is launched via share intent
- **`listenForShareIntents(callback)`**: Listens for share intents while the app is running
- **`copyFileToCache(sourceUri: string)`**: Copies Android content URIs to the app's cache

### 2. Root Layout (`app/_layout.tsx`)

The root layout handles share intent routing:

- Checks for initial share data on app launch
- Listens for share intents while the app is running
- Stores pending share data if the user is not authenticated
- Navigates to the share-intent screen when share data is received

### 3. Share Intent Screen (`app/share-intent.tsx`)

This screen acts as an intermediary:

- Receives share data from the root layout
- Checks if the user is authenticated
- Parses and validates the shared content
- Navigates to the note editor with pre-filled content

### 4. Note Editor (`app/note-editor.tsx`)

The note editor handles the shared content:

- Receives shared text and images via route params
- Pre-fills the text input with shared text
- Loads and displays shared images
- Allows the user to edit and save the note

## User Flow

### Sharing from Another App

1. User opens another app (e.g., Photos, Safari, Notes)
2. User selects content to share (text, image, or URL)
3. User taps the share button
4. User selects "Recall" from the share sheet
5. Recall app opens (or comes to foreground)
6. If not authenticated, user is prompted to log in
7. Share-intent screen processes the shared content
8. Note editor opens with pre-filled content
9. User can edit and save the note

### Supported Content Types

- **Text**: Plain text, URLs, notes
- **Images**: JPEG, PNG, HEIC, GIF, WebP
- **Multiple Images**: Up to multiple images can be shared at once

## Testing

### iOS Testing

1. Build the app with EAS or expo prebuild
2. Install on a physical device or simulator
3. Open Photos app and select an image
4. Tap the share button
5. Select "Recall" from the share sheet
6. Verify the image appears in the note editor

### Android Testing

1. Build the app with EAS or expo prebuild
2. Install on a physical device or emulator
3. Open any app with share functionality
4. Share text or an image
5. Select "Recall" from the share menu
6. Verify the content appears in the note editor

### Development Testing

You can test share intents in development using deep links:

```typescript
import { createTestShareUrl } from '@/utils/nativeShareReceiver';

// Test with text
const textUrl = createTestShareUrl('Hello, this is shared text!');
Linking.openURL(textUrl);

// Test with images
const imageUrl = createTestShareUrl(undefined, ['https://example.com/image.jpg']);
Linking.openURL(imageUrl);
```

## Limitations

### Current Limitations

1. **Web Support**: Native sharing to the app is not supported on web
2. **File Types**: Only images and text are supported (no videos, PDFs, etc.)
3. **Build Requirement**: Native sharing only works in built apps (EAS or prebuild), not in Expo Go

### Known Issues

1. **Android Content URIs**: Some Android content URIs may not be accessible and need to be copied to cache
2. **iOS File Access**: iOS may restrict access to some file types depending on permissions
3. **Multiple Images**: Android SEND_MULTIPLE may have limitations on some devices

## Future Enhancements

Potential improvements for native sharing:

1. **Share Extension**: Create a native share extension for iOS for better integration
2. **Video Support**: Add support for sharing videos
3. **PDF Support**: Add support for sharing PDF documents
4. **Rich Text**: Support rich text formatting from other apps
5. **Contact Sharing**: Support sharing contact information
6. **Location Sharing**: Support sharing location data

## Troubleshooting

### Share Option Not Appearing

- Ensure the app is built with EAS or expo prebuild
- Check that intent filters are correctly configured in app.json
- Verify the app is installed on the device
- Try rebuilding the app

### Shared Content Not Loading

- Check console logs for errors
- Verify file permissions
- Ensure the content type is supported
- Check that the file exists and is accessible

### App Not Opening on Share

- Verify the URL scheme is correctly configured
- Check that deep linking is working
- Ensure the app is not in a crashed state
- Try force-closing and reopening the app

## Resources

- [Expo Linking Documentation](https://docs.expo.dev/versions/latest/sdk/linking/)
- [iOS Document Types](https://developer.apple.com/documentation/bundleresources/information_property_list/cfbundledocumenttypes)
- [Android Intent Filters](https://developer.android.com/guide/components/intents-filters)
- [Expo Config Plugins](https://docs.expo.dev/config-plugins/introduction/)
