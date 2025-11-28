
# iOS Share Extension Implementation Guide

## Overview

This document provides a comprehensive guide for implementing and using the iOS Share Extension in the Recall app. The Share Extension allows users to share content from other apps (Safari, Photos, Notes, Instagram, etc.) directly into Recall.

## Architecture

### Components

1. **Share Extension** (`ios/ShareExtension/`)
   - Native iOS extension that appears in the share sheet
   - Processes shared content (text, URLs, images, videos, PDFs)
   - Saves data to App Group shared container
   - Opens main app via deep link

2. **Native Module** (`ios/modules/ShareExtensionModule.swift`)
   - Expo native module for communication
   - Retrieves shared data from App Group container
   - Clears shared data after processing
   - Provides shared container path

3. **TypeScript Wrapper** (`utils/shareExtensionModule.ts`)
   - TypeScript interface for native module
   - Fallback implementation for development
   - Helper functions for data processing

4. **Share Receiver** (`utils/nativeShareReceiver.ts`)
   - Unified interface for both iOS and Android
   - Processes share intents and deep links
   - Handles file copying and data transformation

5. **Config Plugin** (`app.plugin.js`)
   - Expo config plugin for build-time setup
   - Configures entitlements and Info.plist
   - Documents manual Xcode setup steps

### Data Flow

```
Other App (Safari, Photos, etc.)
    ↓
iOS Share Sheet
    ↓
Share Extension (ShareViewController.swift)
    ↓ (saves to)
App Group Container (shared_data.json, shared_images/)
    ↓ (opens via deep link)
Main App (natively://share-intent)
    ↓ (retrieves from)
Native Module (ShareExtensionModule.swift)
    ↓
TypeScript Wrapper (shareExtensionModule.ts)
    ↓
Share Receiver (nativeShareReceiver.ts)
    ↓
Share Intent Screen (app/share-intent.tsx)
    ↓
Note Editor (app/note-editor.tsx)
```

## Supported Content Types

### Text
- Plain text from any app
- Rich text (converted to plain text)
- Notes, messages, emails

### URLs
- Web URLs from Safari and other browsers
- Deep links
- File URLs

### Images
- JPEG, PNG, HEIC, HEIF
- GIF, WebP, TIFF, BMP
- Up to 10 images at once
- From Photos, Camera, Instagram, etc.

### Videos
- MP4, MOV, M4V
- QuickTime movies
- Up to 5 videos at once

### Files
- PDF documents
- Text files
- Other document types

## Implementation Details

### Share Extension (ShareViewController.swift)

The Share Extension is a native iOS extension that:

1. **Appears in Share Sheet**: Registered with iOS to appear when users tap the share button
2. **Processes Content**: Handles different content types using `NSItemProvider`
3. **Saves to Container**: Stores data in App Group shared container
4. **Opens Main App**: Uses deep link to open the main app

Key features:
- Supports multiple content types simultaneously
- Handles up to 10 images and 5 videos
- Provides user feedback with loading indicators
- Gracefully handles errors

### Native Module (ShareExtensionModule.swift)

The native module provides three main functions:

1. **`getSharedData()`**: Retrieves shared data from container
   ```swift
   AsyncFunction("getSharedData") { (promise: Promise) in
     let sharedData = try self.retrieveSharedData()
     promise.resolve(sharedData)
   }
   ```

2. **`clearSharedData()`**: Clears shared data after processing
   ```swift
   AsyncFunction("clearSharedData") { (promise: Promise) in
     try self.clearSharedDataFromContainer()
     promise.resolve(true)
   }
   ```

3. **`getSharedContainerURL()`**: Returns shared container path
   ```swift
   Function("getSharedContainerURL") { () -> String? in
     return self.getSharedContainerPath()
   }
   ```

### TypeScript Integration

The TypeScript wrapper provides a clean interface:

```typescript
import { getSharedData, clearSharedData, copySharedImages } from '@/utils/shareExtensionModule';

// Get shared data
const data = await getSharedData();

// Process images
if (data?.images) {
  const copiedImages = await copySharedImages(data.images);
}

// Clear after processing
await clearSharedData();
```

## Setup Instructions

### Prerequisites

- Xcode 14.0 or later
- iOS 15.0 or later deployment target
- EAS Build account (for building with native code)
- Apple Developer account (for App Groups)

### Step 1: Configure App Groups

1. Go to [Apple Developer Portal](https://developer.apple.com)
2. Navigate to Certificates, Identifiers & Profiles
3. Select your App ID
4. Enable "App Groups" capability
5. Create or select app group: `group.com.anonymous.Natively`
6. Repeat for Share Extension App ID: `com.anonymous.Natively.ShareExtension`

### Step 2: Xcode Project Setup

1. **Open Project in Xcode**:
   ```bash
   npx expo prebuild -p ios
   cd ios
   open Recall.xcworkspace
   ```

2. **Add Share Extension Target**:
   - File → New → Target
   - Select "Share Extension"
   - Name: `ShareExtension`
   - Bundle Identifier: `com.anonymous.Natively.ShareExtension`
   - Language: Swift
   - Click Finish

3. **Add Source Files**:
   - Drag `ios/ShareExtension/ShareViewController.swift` to ShareExtension target
   - Drag `ios/ShareExtension/Info.plist` to ShareExtension target
   - Drag `ios/ShareExtension/Base.lproj/MainInterface.storyboard` to ShareExtension target
   - Ensure files are added to ShareExtension target (check target membership)

4. **Add Native Module**:
   - Drag `ios/modules/ShareExtensionModule.swift` to main app target
   - Ensure it's added to main app target only

5. **Configure App Groups**:
   - Select main app target
   - Go to Signing & Capabilities
   - Click "+ Capability"
   - Add "App Groups"
   - Enable `group.com.anonymous.Natively`
   - Repeat for ShareExtension target

6. **Set Deployment Target**:
   - Select ShareExtension target
   - Set iOS Deployment Target to 15.0 or later

7. **Link Extension with Main App**:
   - Select main app target
   - Go to "General" tab
   - Under "Frameworks, Libraries, and Embedded Content"
   - Add ShareExtension.appex (if not already present)

### Step 3: Build Configuration

Update `eas.json` to include the Share Extension:

```json
{
  "build": {
    "production": {
      "ios": {
        "simulator": false,
        "buildConfiguration": "Release",
        "autoIncrement": true
      }
    }
  }
}
```

### Step 4: Build with EAS

```bash
# Build for production
eas build --platform ios --profile production

# Or build for development
eas build --platform ios --profile development
```

### Step 5: Testing

1. **Install the Build**:
   - Download from EAS
   - Install via TestFlight or direct install

2. **Test Share from Safari**:
   - Open Safari
   - Navigate to any website
   - Tap Share button
   - Look for "Recall" in share sheet
   - Tap "Recall"
   - Verify URL appears in note editor

3. **Test Share from Photos**:
   - Open Photos app
   - Select one or more images
   - Tap Share button
   - Select "Recall"
   - Verify images appear in note editor

4. **Test Share from Notes**:
   - Open Notes app
   - Select text
   - Tap Share
   - Select "Recall"
   - Verify text appears in note editor

## Development Workflow

### Local Development

During development (using Expo Go or development builds), the Share Extension won't be available. You can test the share functionality using deep links:

```typescript
import { createTestShareUrl } from '@/utils/nativeShareReceiver';
import * as Linking from 'expo-linking';

// Test with text
const url = createTestShareUrl('Hello from share!');
Linking.openURL(url);

// Test with images
const url = createTestShareUrl(
  'Check out these images',
  ['https://example.com/image1.jpg', 'https://example.com/image2.jpg']
);
Linking.openURL(url);
```

### Debugging

1. **Xcode Console**:
   - Open Xcode
   - Window → Devices and Simulators
   - Select your device
   - View device logs
   - Filter for "ShareExtension" or "Recall"

2. **Share Extension Logs**:
   ```swift
   print("[ShareExtension] Your debug message")
   ```

3. **Main App Logs**:
   ```typescript
   console.log('[ShareExtension] Your debug message');
   ```

4. **Check Shared Container**:
   ```typescript
   import { getSharedContainerURL } from '@/utils/shareExtensionModule';
   
   const containerPath = getSharedContainerURL();
   console.log('Shared container:', containerPath);
   ```

## Troubleshooting

### Share Extension Not Appearing

**Problem**: Recall doesn't appear in the share sheet

**Solutions**:
1. Verify the app is built with EAS (not Expo Go)
2. Check bundle identifiers match:
   - Main app: `com.anonymous.Natively`
   - Extension: `com.anonymous.Natively.ShareExtension`
3. Verify App Groups are enabled in both targets
4. Check Info.plist activation rules
5. Restart the device

### Data Not Loading

**Problem**: Shared content doesn't appear in the app

**Solutions**:
1. Check App Group identifier matches in both targets
2. Verify shared container is accessible
3. Check file permissions
4. Look for errors in Xcode console
5. Verify deep link is being triggered

### Images Not Copying

**Problem**: Images don't appear after sharing

**Solutions**:
1. Check shared_images directory exists
2. Verify file write permissions
3. Check available storage space
4. Look for file system errors in logs
5. Verify image format is supported

### Build Errors

**Problem**: Build fails with Share Extension errors

**Solutions**:
1. Clean build folder (Cmd+Shift+K in Xcode)
2. Delete derived data
3. Verify all source files are in correct targets
4. Check Swift version compatibility
5. Update Xcode to latest version

### Deep Link Not Working

**Problem**: App doesn't open after sharing

**Solutions**:
1. Verify URL scheme is registered: `natively`
2. Check CFBundleURLTypes in Info.plist
3. Test deep link manually: `xcrun simctl openurl booted natively://share-intent`
4. Check app state (background vs. terminated)
5. Verify deep link handling in `_layout.tsx`

## Performance Considerations

### Image Processing

- Images are saved to shared container first
- Then copied to app's document directory
- Original shared container files are deleted
- Use JPEG compression for large images

### Memory Management

- Process images one at a time
- Limit to 10 images per share
- Clean up temporary files after processing
- Use autoreleasepool for large operations

### User Experience

- Show loading indicator during processing
- Provide feedback for errors
- Handle cancellation gracefully
- Minimize extension launch time

## Security Considerations

### App Groups

- Use unique app group identifier
- Don't store sensitive data in shared container
- Clean up data after processing
- Validate all shared data

### Data Validation

- Verify file types before processing
- Check file sizes
- Sanitize text input
- Validate URLs

### Permissions

- Request only necessary permissions
- Handle permission denials gracefully
- Explain why permissions are needed
- Follow iOS privacy guidelines

## Best Practices

### Code Quality

1. **Error Handling**: Always handle errors gracefully
2. **Logging**: Use consistent logging format
3. **Comments**: Document complex logic
4. **Type Safety**: Use strong typing in Swift and TypeScript
5. **Testing**: Test with various content types

### User Experience

1. **Feedback**: Show progress indicators
2. **Errors**: Display user-friendly error messages
3. **Performance**: Optimize for speed
4. **Reliability**: Handle edge cases
5. **Accessibility**: Support VoiceOver and Dynamic Type

### Maintenance

1. **Documentation**: Keep docs up to date
2. **Versioning**: Track changes in git
3. **Testing**: Test after each change
4. **Monitoring**: Monitor crash reports
5. **Updates**: Keep dependencies updated

## Advanced Features

### Custom UI

Customize the Share Extension UI by modifying `MainInterface.storyboard`:

1. Add custom views
2. Change colors and fonts
3. Add preview images
4. Customize buttons

### Additional Content Types

Add support for more content types:

1. Update `Info.plist` activation rules
2. Add processing logic in `ShareViewController.swift`
3. Update TypeScript interfaces
4. Test with new content types

### Analytics

Track share extension usage:

1. Add analytics SDK to extension
2. Track share events
3. Monitor content types
4. Analyze user behavior

## Resources

### Apple Documentation

- [Share Extension Programming Guide](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html)
- [App Groups](https://developer.apple.com/documentation/bundleresources/entitlements/com_apple_security_application-groups)
- [NSItemProvider](https://developer.apple.com/documentation/foundation/nsitemprovider)
- [Uniform Type Identifiers](https://developer.apple.com/documentation/uniformtypeidentifiers)

### Expo Documentation

- [Expo Config Plugins](https://docs.expo.dev/guides/config-plugins/)
- [Expo Modules API](https://docs.expo.dev/modules/overview/)
- [EAS Build](https://docs.expo.dev/build/introduction/)

### Community Resources

- [Expo Forums](https://forums.expo.dev/)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/expo)
- [GitHub Issues](https://github.com/expo/expo/issues)

## Support

If you encounter issues:

1. Check this documentation
2. Review Xcode console logs
3. Test with different content types
4. Verify configuration settings
5. Ask for help in Expo forums

## Changelog

### Version 1.0.0 (Current)

- Initial implementation
- Support for text, URLs, images, videos, PDFs
- Native module for data retrieval
- TypeScript wrapper with fallback
- Comprehensive documentation
- Error handling and logging
- Performance optimizations

### Future Enhancements

- [ ] Support for more file types
- [ ] Rich text formatting
- [ ] Contact sharing
- [ ] Location sharing
- [ ] Custom share UI
- [ ] Analytics integration
- [ ] Offline support
- [ ] Batch processing
