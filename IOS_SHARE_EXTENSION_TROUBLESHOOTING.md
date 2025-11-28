
# iOS Share Extension Troubleshooting Guide

## Overview
This guide helps debug and fix issues with the iOS Share Extension not appearing in the share sheet.

## Common Issues and Solutions

### 1. Share Extension Not Appearing in Share Sheet

#### Symptoms:
- Recall app doesn't show up when sharing from other apps
- Share sheet doesn't list Recall as an option

#### Solutions:

**A. Rebuild with Clean Prebuild**
```bash
# Clean the iOS build
rm -rf ios/

# Run prebuild with clean flag
npm run build:ios

# Or manually:
expo prebuild -p ios --clean
```

**B. Verify Xcode Configuration**

1. Open the project in Xcode:
   ```bash
   open ios/Recall.xcworkspace
   ```

2. Check Share Extension Target:
   - In Xcode, select the project in the navigator
   - Look for "ShareExtension" target in the targets list
   - Verify the following settings:

   **General Tab:**
   - Bundle Identifier: `com.anonymous.Natively.ShareExtension`
   - Deployment Target: iOS 15.0 or higher
   - Team: Your development team

   **Signing & Capabilities Tab:**
   - Automatically manage signing: Enabled
   - App Groups capability is added
   - App Group ID: `group.com.anonymous.Natively`

   **Build Phases Tab:**
   - "Copy Bundle Resources" includes Info.plist
   - "Compile Sources" includes the share extension code

3. Check Main App Target:
   - Select "Recall" target
   - Verify App Groups capability is enabled
   - Verify same App Group ID: `group.com.anonymous.Natively`

**C. Verify Info.plist Configuration**

Check `targets/share-extension/Info.plist`:
- NSExtensionPointIdentifier: `com.apple.share-services`
- NSExtensionActivationRule includes supported types
- NSExtensionMainStoryboard or NSExtensionPrincipalClass is set

**D. Verify Entitlements**

Check `targets/share-extension/Entitlements.plist`:
```xml
<key>com.apple.security.application-groups</key>
<array>
    <string>group.com.anonymous.Natively</string>
</array>
```

### 2. Build Errors

#### Error: "Unable to resolve a valid config plugin"

**Solution:**
```bash
# Clear node modules and reinstall
rm -rf node_modules
npm install

# Clear Expo cache
npx expo start --clear

# Rebuild
npm run build:ios
```

#### Error: "Share Extension target not found"

**Solution:**
1. Verify `@bacons/apple-targets` is installed:
   ```bash
   npm list @bacons/apple-targets
   ```

2. Check `app.json` has the correct plugin configuration:
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
               "deploymentTarget": "15.0"
             }
           ]
         }
       ]
     ]
   }
   ```

### 3. Share Extension Crashes

#### Symptoms:
- Share sheet shows Recall but crashes when selected
- Extension opens but immediately closes

#### Solutions:

**A. Check Logs**
```bash
# View device logs
xcrun simctl spawn booted log stream --predicate 'subsystem contains "com.anonymous.Natively"'

# Or in Xcode:
# Window > Devices and Simulators > Select device > View Device Logs
```

**B. Verify App Group Access**
- Ensure both main app and extension have the same App Group ID
- Check that the App Group is properly provisioned in Apple Developer Portal

**C. Check File System Permissions**
- Verify the extension can write to the shared container
- Check that file paths are correct

### 4. Data Not Passing to Main App

#### Symptoms:
- Share extension works but main app doesn't receive data
- App opens but note editor is empty

#### Solutions:

**A. Verify Deep Link Configuration**
- Check URL scheme is registered in `app.json`:
  ```json
  {
    "ios": {
      "infoPlist": {
        "CFBundleURLTypes": [
          {
            "CFBundleURLSchemes": ["natively", "recall"]
          }
        ]
      }
    },
    "scheme": "natively"
  }
  ```

**B. Test Deep Link Manually**
```bash
# Test deep link on simulator
xcrun simctl openurl booted "natively://share-intent?text=test"
```

**C. Check Share Data Storage**
- Verify data is being saved to shared container
- Check file permissions in shared container
- Verify JSON format is correct

### 5. Testing the Share Extension

#### On Simulator:

1. Build and run the app:
   ```bash
   npm run ios
   ```

2. Open Safari or Photos app

3. Try sharing content:
   - Safari: Share a webpage
   - Photos: Share an image
   - Notes: Share text

4. Look for "Recall" in the share sheet

#### On Physical Device:

1. Build with EAS:
   ```bash
   eas build --platform ios --profile development
   ```

2. Install the build on your device

3. Test sharing from various apps

### 6. Debugging Tips

**Enable Verbose Logging:**

Add to `targets/share-extension/index.ts`:
```typescript
console.log('[ShareExtension] Debug info:', {
  containerPath: getSharedContainerPath(),
  items: items,
  timestamp: Date.now()
});
```

**Check App Group Container:**

In Xcode debugger:
```swift
// Print container path
print(FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.anonymous.Natively"))
```

**Verify Extension is Loaded:**

In Xcode:
1. Product > Scheme > Edit Scheme
2. Run > Info > Executable: Ask on Launch
3. Run the app
4. When prompted, select "ShareExtension"
5. This allows debugging the extension directly

## Build Process Checklist

Before building, ensure:

- [ ] `@bacons/apple-targets` is installed (v3.0.2)
- [ ] `app.json` has correct plugin configuration
- [ ] `app.plugin.js` is properly configured
- [ ] `targets/share-extension/` directory exists with all files
- [ ] App Group ID matches in all locations
- [ ] URL scheme is configured
- [ ] Clean prebuild has been run: `npm run build:ios`

## Correct Build Command

Always use:
```bash
npm run build:ios
```

Which runs:
```bash
expo prebuild -p ios --clean
```

**Note:** The user mentioned "npc run build:ios" which is a typo. The correct command is "npm run build:ios".

## Additional Resources

- [@bacons/apple-targets Documentation](https://github.com/EvanBacon/expo-apple-targets)
- [Apple Share Extension Guide](https://developer.apple.com/documentation/uikit/inter-process_communication/allowing_apps_and_websites_to_link_to_your_content/creating_a_share_extension)
- [Expo Config Plugins](https://docs.expo.dev/guides/config-plugins/)

## Still Having Issues?

If the share extension still doesn't appear:

1. Check Apple Developer Portal:
   - Verify App IDs are created
   - Verify App Groups are enabled
   - Verify provisioning profiles include App Groups

2. Try a fresh build:
   ```bash
   rm -rf ios/ node_modules/
   npm install
   npm run build:ios
   ```

3. Check device settings:
   - Settings > [App Name] > Allow Extensions
   - Ensure the extension is enabled

4. Restart device:
   - Sometimes iOS needs a restart to recognize new extensions
