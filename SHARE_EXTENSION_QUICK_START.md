
# iOS Share Extension Quick Start Guide

This guide will help you quickly set up and test the iOS Share Extension for the Recall app.

## Prerequisites

- Xcode 15.0 or later
- iOS 15.0 or later device/simulator
- Node.js and npm installed
- Expo CLI installed

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Prebuild iOS Project

```bash
npx expo prebuild -p ios --clean
```

This will:
- Generate the iOS native project
- Configure the Share Extension target
- Set up App Groups
- Configure entitlements

### 3. Open in Xcode

```bash
open ios/Recall.xcworkspace
```

### 4. Verify Configuration

In Xcode, check the following:

#### Main App Target (Recall)
1. Select the Recall target
2. Go to "Signing & Capabilities"
3. Verify "App Groups" capability is enabled
4. Verify `group.com.anonymous.Natively` is listed

#### Share Extension Target (ShareExtension)
1. Select the ShareExtension target
2. Go to "Signing & Capabilities"
3. Verify "App Groups" capability is enabled
4. Verify `group.com.anonymous.Natively` is listed
5. Verify bundle identifier is `com.anonymous.Natively.ShareExtension`

### 5. Build and Run

1. Select the Recall scheme
2. Select your device or simulator
3. Click Run (⌘R)

## Testing

### Test 1: Share URL from Safari

1. Open Safari on your device
2. Navigate to any website (e.g., https://www.apple.com)
3. Tap the Share button (square with arrow)
4. Scroll down and tap "Recall"
5. The Recall app should open with the URL pre-filled

### Test 2: Share Photo from Photos App

1. Open the Photos app
2. Select a photo
3. Tap the Share button
4. Tap "Recall"
5. The Recall app should open with the photo attached

### Test 3: Share Text from Notes

1. Open the Notes app
2. Create or open a note with text
3. Select some text
4. Tap Share
5. Tap "Recall"
6. The Recall app should open with the text pre-filled

### Test 4: Share from Instagram

1. Open Instagram
2. View any post
3. Tap the Share button (paper airplane icon)
4. Tap "Share to..."
5. Tap "Recall"
6. The Recall app should open

## Troubleshooting

### "Recall" doesn't appear in share sheet

**Solution:**
1. Make sure the app is installed on the device
2. Restart the device
3. Try sharing different content types
4. Check that App Groups are properly configured

### App opens but no content appears

**Solution:**
1. Check console logs for errors
2. Verify App Group identifier matches in both targets
3. Ensure deep link URL scheme is registered
4. Try rebuilding the app

### Share Extension crashes

**Solution:**
1. Check Xcode console for crash logs
2. Verify all dependencies are installed
3. Ensure deployment target is iOS 15.0+
4. Clean build folder (⌘⇧K) and rebuild

### Images not loading

**Solution:**
1. Check file permissions in shared container
2. Verify images are being copied correctly
3. Check console logs for file system errors
4. Ensure sufficient storage space

## Console Logging

To view detailed logs:

```bash
# View all logs
xcrun simctl spawn booted log stream

# View only Recall logs
xcrun simctl spawn booted log stream --predicate 'subsystem contains "com.anonymous.Natively"'

# View only Share Extension logs
xcrun simctl spawn booted log stream --predicate 'process contains "ShareExtension"'
```

Look for these log prefixes:
- `[ShareExtension]` - Share Extension logs
- `[ShareExtensionModule]` - Module logs
- `[NativeShareReceiver]` - Receiver logs
- `[ShareIntentScreen]` - Screen logs

## Development Tips

1. **Test on Real Device**: Share extensions work best on real devices
2. **Check Logs**: Always check console logs when debugging
3. **Clean Build**: If things aren't working, try a clean build
4. **Restart Device**: Sometimes iOS needs a restart to recognize new extensions
5. **Test Multiple Apps**: Test sharing from various apps (Safari, Photos, Notes, Instagram, etc.)

## Next Steps

Once the Share Extension is working:

1. Test with different content types
2. Test with multiple attachments
3. Test with large files
4. Test on different iOS versions
5. Test on different devices (iPhone, iPad)

## Support

If you encounter issues:

1. Check the console logs
2. Review the troubleshooting section
3. Check the full implementation guide (IOS_SHARE_EXTENSION_IMPLEMENTATION.md)
4. Verify all configuration steps were completed

## Building for Production

When ready to build for production:

```bash
# Build with EAS
eas build --platform ios --profile production

# Or build locally
xcodebuild -workspace ios/Recall.xcworkspace \
  -scheme Recall \
  -configuration Release \
  -archivePath build/Recall.xcarchive \
  archive
```

Make sure to:
1. Update version numbers
2. Configure proper signing certificates
3. Test on multiple devices
4. Submit to App Store Connect

## Resources

- [Apple Share Extension Documentation](https://developer.apple.com/documentation/uikit/share_extensions)
- [@bacons/apple-targets Documentation](https://github.com/EvanBacon/apple-targets)
- [Expo Config Plugins](https://docs.expo.dev/guides/config-plugins/)
- [App Groups Documentation](https://developer.apple.com/documentation/bundleresources/entitlements/com_apple_security_application-groups)
