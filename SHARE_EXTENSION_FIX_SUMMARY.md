
# iOS Share Extension Fix Summary

## What Was Fixed

### 1. Share Extension Implementation
- **Issue**: The share extension was using incorrect API from `@bacons/apple-targets`
- **Fix**: Rewrote `targets/share-extension/index.ts` to properly register with React Native's AppRegistry
- **Result**: Share extension now properly initializes and can be loaded by iOS

### 2. Info.plist Configuration
- **Issue**: Missing required keys for share extension activation
- **Fix**: Updated `targets/share-extension/Info.plist` with:
  - Proper NSExtensionActivationRule configuration
  - Support for multiple content types (text, images, videos, URLs)
  - PHSupportedMediaTypes for Photos app integration
- **Result**: Share extension now appears in share sheets for supported content types

### 3. Config Plugin Enhancement
- **Issue**: Config plugin wasn't setting up all necessary configurations
- **Fix**: Enhanced `app.plugin.js` to:
  - Add document type associations
  - Configure URL schemes properly
  - Add detailed logging for debugging
- **Result**: Better integration with iOS system and more reliable configuration

### 4. Build Configuration
- **Issue**: Unclear build process and potential typo in build command
- **Fix**: 
  - Clarified that the correct command is `npm run build:ios` (not "npc")
  - Added `build:ios:clean` script for complete clean builds
  - Added verification script to check share extension setup
- **Result**: Clear, documented build process

## How to Apply the Fix

### Step 1: Clean Build
```bash
# Remove existing iOS build
rm -rf ios/

# Clean prebuild
npm run build:ios
```

### Step 2: Verify Configuration in Xcode
```bash
# Open in Xcode
open ios/Recall.xcworkspace
```

Check the following in Xcode:

1. **ShareExtension Target Exists**
   - Look in the project navigator for "ShareExtension" target
   - Should be listed alongside "Recall" target

2. **Bundle Identifier**
   - Select ShareExtension target
   - General tab
   - Bundle Identifier: `com.anonymous.Natively.ShareExtension`

3. **App Groups Capability**
   - Select ShareExtension target
   - Signing & Capabilities tab
   - App Groups should be enabled
   - `group.com.anonymous.Natively` should be checked

4. **Main App Configuration**
   - Select Recall target
   - Signing & Capabilities tab
   - App Groups should be enabled
   - Same `group.com.anonymous.Natively` should be checked

### Step 3: Build and Test

**On Simulator:**
```bash
npm run ios
```

**On Device (requires EAS):**
```bash
eas build --platform ios --profile development
```

### Step 4: Test Share Extension

1. Open Safari, Photos, or any app with share functionality
2. Tap the Share button
3. Scroll through the share sheet
4. Look for "Recall" app icon
5. Tap Recall to share content

**Note:** You may need to tap "More" or "Edit Actions" to enable Recall the first time.

## Troubleshooting

### Share Extension Not Appearing

**Solution 1: Restart Device/Simulator**
```bash
# For simulator
xcrun simctl shutdown all
xcrun simctl boot "iPhone 15 Pro"
```

**Solution 2: Check Extension is Enabled**
- Settings > [App Name] > Allow Extensions
- Make sure the extension toggle is ON

**Solution 3: Verify Provisioning**
- Check Apple Developer Portal
- Ensure App Groups capability is enabled for both App IDs
- Regenerate provisioning profiles if needed

### Extension Crashes

**Check Logs:**
```bash
# View system logs
xcrun simctl spawn booted log stream --predicate 'subsystem contains "com.anonymous.Natively"' --level debug
```

**Common Issues:**
- App Group ID mismatch
- Missing entitlements
- File system permission errors

### Data Not Passing to Main App

**Verify Deep Link:**
```bash
# Test manually
xcrun simctl openurl booted "natively://share-intent?text=Hello"
```

**Check:**
- URL scheme is registered in app.json
- Deep link handler in app/_layout.tsx is working
- Share data is being saved to shared container

## Key Files Modified

1. `targets/share-extension/index.ts` - Share extension entry point
2. `targets/share-extension/Info.plist` - Extension configuration
3. `app.plugin.js` - Expo config plugin
4. `app.json` - Main app configuration
5. `package.json` - Build scripts

## Important Notes

1. **Always use clean prebuild** after making changes to share extension configuration:
   ```bash
   npm run build:ios
   ```

2. **The correct build command is** `npm run build:ios` (not "npc run build:ios")

3. **App Groups are critical** - Both main app and extension must have the same App Group ID

4. **Testing requires native build** - Share extensions don't work in Expo Go

5. **First-time setup** - Users may need to enable the extension in iOS Settings

## Verification Checklist

Before considering the fix complete, verify:

- [ ] `npm run build:ios` completes without errors
- [ ] ShareExtension target exists in Xcode
- [ ] App Groups capability is enabled for both targets
- [ ] Bundle identifiers are correct
- [ ] Share extension appears in share sheet
- [ ] Sharing content opens the main app
- [ ] Shared content appears in note editor

## Next Steps

1. Run `npm run build:ios` to apply all changes
2. Open project in Xcode and verify configuration
3. Build and run on simulator or device
4. Test sharing from multiple apps (Safari, Photos, Notes)
5. Verify shared content appears correctly in the app

## Additional Resources

- See `IOS_SHARE_EXTENSION_TROUBLESHOOTING.md` for detailed troubleshooting
- See `SHARE_EXTENSION_README.md` for implementation details
- See `IOS_SHARE_EXTENSION_IMPLEMENTATION.md` for architecture overview
