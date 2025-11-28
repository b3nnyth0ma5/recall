
# iOS Share Extension Setup Guide

## Problem
The Recall app doesn't appear in the iOS share sheet when sharing from Safari, Notes, Instagram, or other apps. This is because iOS requires a **Share Extension** to appear in the share sheet.

## Solution Overview
We've created a native iOS Share Extension that will make the Recall app appear in the share sheet. This extension:

- ✅ Accepts URLs from Safari
- ✅ Accepts text from Notes and other apps
- ✅ Accepts images from Photos, Instagram, etc.
- ✅ Accepts multiple images at once
- ✅ Passes shared content to the main app via deep links

## What Was Changed

### 1. Created Share Extension Files
- `ios/RecallShareExtension/ShareViewController.swift` - Main Share Extension logic
- `ios/RecallShareExtension/Info.plist` - Share Extension configuration
- `ios/RecallShareExtension/Base.lproj/MainInterface.storyboard` - Share Extension UI

### 2. Created Config Plugin
- `app.plugin.js` - Expo config plugin that adds the Share Extension to the iOS build

### 3. Updated app.json
- Added the config plugin to the plugins array
- Added App Group entitlements for sharing data between the extension and main app
- Enhanced CFBundleDocumentTypes with more file types
- Added UTImportedTypeDeclarations for URL handling

## How It Works

### Share Flow
1. User shares content from Safari/Notes/Instagram
2. iOS shows the share sheet with "Recall" as an option
3. User taps "Recall"
4. Share Extension opens and processes the shared content
5. Extension saves images to shared App Group container
6. Extension creates a deep link: `natively://share-intent?text=...&images=...`
7. Extension opens the main app with the deep link
8. Main app receives the deep link and navigates to `/share-intent`
9. `/share-intent` screen processes the data and navigates to `/note-editor`
10. Note editor pre-fills with the shared content

### App Groups
The Share Extension and main app communicate via:
- **Deep Links**: For passing text and URLs
- **Shared Container**: For passing images (stored in `group.com.anonymous.Natively`)

## Building the App

### Prerequisites
You need to build with EAS Build (not Expo Go) because Share Extensions require native code.

### Steps

1. **Install EAS CLI** (if not already installed):
   ```bash
   npm install -g eas-cli
   ```

2. **Login to EAS**:
   ```bash
   eas login
   ```

3. **Configure EAS Build**:
   Create or update `eas.json`:
   ```json
   {
     "build": {
       "development": {
         "developmentClient": true,
         "distribution": "internal",
         "ios": {
           "simulator": true
         }
       },
       "preview": {
         "distribution": "internal",
         "ios": {
           "simulator": false
         }
       },
       "production": {
         "ios": {
           "simulator": false
         }
       }
     }
   }
   ```

4. **Build for iOS**:
   ```bash
   # For development (simulator)
   eas build --platform ios --profile development
   
   # For preview (device)
   eas build --platform ios --profile preview
   
   # For production
   eas build --platform ios --profile production
   ```

5. **Install on Device**:
   - Download the build from EAS
   - Install via TestFlight (production) or direct install (development/preview)

## Testing

### Test Share from Safari
1. Open Safari
2. Navigate to any website
3. Tap the Share button
4. Look for "Recall" in the share sheet
5. Tap "Recall"
6. The app should open with the URL pre-filled

### Test Share from Notes
1. Open Notes app
2. Create or open a note with text
3. Select some text
4. Tap Share
5. Look for "Recall" in the share sheet
6. Tap "Recall"
7. The app should open with the text pre-filled

### Test Share from Photos/Instagram
1. Open Photos or Instagram
2. Select one or more images
3. Tap Share
4. Look for "Recall" in the share sheet
5. Tap "Recall"
6. The app should open with the images pre-filled

## Troubleshooting

### Share Extension Not Appearing
- Make sure you built with EAS Build (not Expo Go)
- Check that the app is installed on a physical device or simulator
- Verify the bundle identifier matches in both app.json and the Share Extension
- Check that App Groups are properly configured

### Deep Link Not Working
- Verify the URL scheme is registered in app.json (`scheme: "natively"`)
- Check that the Share Extension is creating the correct deep link format
- Look for console logs in the main app to see if the deep link is being received

### Images Not Loading
- Verify App Groups are configured correctly
- Check that the shared container path is accessible
- Look for file permission errors in the console

### Build Errors
- Make sure `@bacons/apple-targets` is installed
- Verify the config plugin is in the plugins array in app.json
- Check that all Swift files have correct syntax

## Alternative: Simpler Approach (Limited Functionality)

If you can't use EAS Build or need a quicker solution, you can use the "Open In" menu instead of the share sheet:

### Pros
- Works with Expo Go
- No native code required
- Simpler setup

### Cons
- Only appears in "Open In" menu, not the main share sheet
- Less discoverable for users
- Doesn't work for all content types

To use this approach, the current `app.json` configuration with `CFBundleDocumentTypes` is sufficient. Users would need to:
1. Share content
2. Scroll down in the share sheet
3. Tap "Save to Files" or "Open In"
4. Select "Recall"

## Next Steps

1. **Build the app with EAS** to include the Share Extension
2. **Test on a physical device** to verify the share sheet integration
3. **Submit to App Store** with the Share Extension included

## Important Notes

- The Share Extension requires iOS 15.0 or later
- App Groups must be configured in Apple Developer Portal
- The bundle identifier for the Share Extension must be: `com.anonymous.Natively.ShareExtension`
- The main app bundle identifier must be: `com.anonymous.Natively`

## Support

If you encounter issues:
1. Check the console logs in Xcode
2. Verify all bundle identifiers match
3. Ensure App Groups are properly configured
4. Test with a clean build

## References

- [Apple Share Extension Documentation](https://developer.apple.com/documentation/uikit/share_extensions)
- [Expo Config Plugins](https://docs.expo.dev/guides/config-plugins/)
- [@bacons/apple-targets](https://github.com/EvanBacon/apple-targets)
