
# iOS Share Extension - Quick Start Guide

This guide will help you quickly set up and test the iOS Share Extension for the Recall app.

## Prerequisites

- Mac with Xcode 14.0 or later
- Apple Developer account
- EAS CLI installed: `npm install -g eas-cli`
- Logged into EAS: `eas login`

## Quick Setup (5 Steps)

### 1. Configure App Groups in Apple Developer Portal

1. Go to https://developer.apple.com/account/resources/identifiers/list
2. Select your App ID: `com.anonymous.Natively`
3. Enable "App Groups" capability
4. Create app group: `group.com.anonymous.Natively`
5. Create Share Extension App ID: `com.anonymous.Natively.ShareExtension`
6. Enable "App Groups" for Share Extension
7. Add the same app group: `group.com.anonymous.Natively`

### 2. Prebuild iOS Project

```bash
npx expo prebuild -p ios --clean
```

### 3. Open in Xcode and Add Share Extension

```bash
cd ios
open Recall.xcworkspace
```

In Xcode:

1. **Add Share Extension Target**:
   - File → New → Target
   - Select "Share Extension"
   - Product Name: `ShareExtension`
   - Bundle Identifier: `com.anonymous.Natively.ShareExtension`
   - Language: Swift
   - Click Finish
   - When prompted about activating scheme, click "Activate"

2. **Replace ShareViewController.swift**:
   - Delete the auto-generated `ShareViewController.swift`
   - Drag `ios/ShareExtension/ShareViewController.swift` from Finder into ShareExtension folder
   - Check "Copy items if needed"
   - Select ShareExtension target
   - Click Finish

3. **Replace Info.plist**:
   - Delete the auto-generated `Info.plist` in ShareExtension folder
   - Drag `ios/ShareExtension/Info.plist` from Finder into ShareExtension folder
   - Check "Copy items if needed"
   - Select ShareExtension target

4. **Replace MainInterface.storyboard**:
   - Delete the auto-generated `MainInterface.storyboard`
   - Drag `ios/ShareExtension/Base.lproj/MainInterface.storyboard` from Finder
   - Check "Copy items if needed"
   - Select ShareExtension target

5. **Add Native Module**:
   - Drag `ios/modules/ShareExtensionModule.swift` from Finder into Recall folder
   - Check "Copy items if needed"
   - Select Recall target (NOT ShareExtension)

6. **Configure App Groups**:
   - Select Recall target
   - Go to "Signing & Capabilities" tab
   - Click "+ Capability"
   - Add "App Groups"
   - Check `group.com.anonymous.Natively`
   - Select ShareExtension target
   - Repeat the same steps

7. **Set Deployment Target**:
   - Select ShareExtension target
   - Go to "Build Settings"
   - Search for "iOS Deployment Target"
   - Set to 15.0 or later

### 4. Build with EAS

```bash
# Go back to project root
cd ..

# Build for iOS
eas build --platform ios --profile production
```

### 5. Install and Test

1. Download the build from EAS
2. Install on your device via TestFlight or direct install
3. Open Safari and navigate to any website
4. Tap the Share button
5. Look for "Recall" in the share sheet
6. Tap "Recall" and verify the URL appears in the app

## Testing Different Content Types

### Test with Safari (URLs)
1. Open Safari
2. Go to any website
3. Tap Share → Recall
4. ✅ URL should appear in note editor

### Test with Photos (Images)
1. Open Photos app
2. Select 1-3 images
3. Tap Share → Recall
4. ✅ Images should appear in note editor

### Test with Notes (Text)
1. Open Notes app
2. Select some text
3. Tap Share → Recall
4. ✅ Text should appear in note editor

### Test with Instagram (Images)
1. Open Instagram
2. View a post
3. Tap ••• → Share → Recall
4. ✅ Image should appear in note editor

## Troubleshooting

### "Recall" doesn't appear in share sheet

**Solution 1**: Restart your device
```bash
# After installing the app, restart the device
# This refreshes the share sheet extensions
```

**Solution 2**: Check bundle identifiers
- Main app: `com.anonymous.Natively`
- Extension: `com.anonymous.Natively.ShareExtension`

**Solution 3**: Verify App Groups
- Both targets should have `group.com.anonymous.Natively` enabled

### Shared content doesn't appear in app

**Check logs in Xcode**:
1. Window → Devices and Simulators
2. Select your device
3. View device logs
4. Filter for "ShareExtension" or "Recall"

**Common issues**:
- App Group not configured correctly
- Deep link not working
- File permissions issue

### Build fails

**Clean and rebuild**:
```bash
# Clean Xcode build
cd ios
xcodebuild clean
cd ..

# Clean Expo
npx expo prebuild -p ios --clean

# Rebuild with EAS
eas build --platform ios --profile production
```

## Development Tips

### Test without building

During development, you can test the share flow using deep links:

```typescript
import { createTestShareUrl } from '@/utils/nativeShareReceiver';
import * as Linking from 'expo-linking';

// Test with text
const url = createTestShareUrl('Test shared text');
Linking.openURL(url);

// Test with images
const url = createTestShareUrl(
  'Test with images',
  ['https://picsum.photos/400/300']
);
Linking.openURL(url);
```

### View shared container contents

Add this to your app to debug:

```typescript
import { getSharedContainerURL } from '@/utils/shareExtensionModule';

const containerPath = getSharedContainerURL();
console.log('Shared container:', containerPath);

// List files
const files = await FileSystem.readDirectoryAsync(containerPath);
console.log('Files:', files);
```

### Enable verbose logging

In `ShareViewController.swift`, all operations are logged with `[ShareExtension]` prefix. Filter Xcode console for this prefix to see detailed logs.

## Next Steps

1. ✅ Set up Share Extension (you just did this!)
2. 📱 Test with different apps and content types
3. 🎨 Customize the Share Extension UI (optional)
4. 📊 Add analytics to track usage (optional)
5. 🚀 Submit to App Store

## Resources

- Full documentation: `IOS_SHARE_EXTENSION_IMPLEMENTATION.md`
- Native sharing guide: `NATIVE_SHARING_GUIDE.md`
- Original setup guide: `IOS_SHARE_EXTENSION_SETUP.md`

## Support

If you encounter issues:

1. Check the full documentation
2. Review Xcode console logs
3. Verify all configuration steps
4. Test with different content types
5. Ask for help in Expo forums

## Summary

You've successfully set up the iOS Share Extension! The Recall app can now:

- ✅ Appear in the iOS share sheet
- ✅ Accept text from any app
- ✅ Accept URLs from Safari and browsers
- ✅ Accept images from Photos, Instagram, etc.
- ✅ Accept videos and PDFs
- ✅ Handle multiple items at once
- ✅ Pre-fill the note editor with shared content

Happy sharing! 🎉
