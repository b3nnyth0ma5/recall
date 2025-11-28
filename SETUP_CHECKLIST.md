
# iOS Share Extension Setup Checklist

Use this checklist to ensure the Share Extension is properly configured and working.

## Prerequisites

- [ ] Xcode 15.0 or later installed
- [ ] iOS 15.0+ device or simulator
- [ ] Node.js and npm installed
- [ ] Expo CLI installed globally (`npm install -g expo-cli`)

## Initial Setup

### 1. Install Dependencies

```bash
npm install
```

- [ ] All dependencies installed successfully
- [ ] No errors in console
- [ ] `@bacons/apple-targets` is in `node_modules`

### 2. Prebuild iOS Project

```bash
npx expo prebuild -p ios --clean
```

- [ ] Command completes without errors
- [ ] `ios/` directory is created
- [ ] `ios/Recall.xcworkspace` exists
- [ ] No red error messages in output

### 3. Open in Xcode

```bash
open ios/Recall.xcworkspace
```

- [ ] Xcode opens successfully
- [ ] Project loads without errors
- [ ] Two targets visible: `Recall` and `ShareExtension`

## Configuration Verification

### 4. Main App Target (Recall)

In Xcode, select the `Recall` target:

#### General Tab
- [ ] Bundle Identifier: `com.anonymous.Natively`
- [ ] Version: `1.0.0`
- [ ] Build: `1.0.0`
- [ ] Deployment Target: `15.0` or higher

#### Signing & Capabilities Tab
- [ ] Signing is configured (automatic or manual)
- [ ] "App Groups" capability is present
- [ ] `group.com.anonymous.Natively` is in the list
- [ ] Checkbox next to App Group is checked

#### Info Tab
- [ ] URL Types section exists
- [ ] URL Schemes include `natively` and `recall`

### 5. Share Extension Target (ShareExtension)

In Xcode, select the `ShareExtension` target:

#### General Tab
- [ ] Bundle Identifier: `com.anonymous.Natively.ShareExtension`
- [ ] Version: `1.0`
- [ ] Build: `1`
- [ ] Deployment Target: `15.0` or higher

#### Signing & Capabilities Tab
- [ ] Signing is configured (same team as main app)
- [ ] "App Groups" capability is present
- [ ] `group.com.anonymous.Natively` is in the list
- [ ] Checkbox next to App Group is checked

#### Build Phases Tab
- [ ] "Compile Sources" includes TypeScript files
- [ ] "Link Binary With Libraries" includes necessary frameworks

### 6. File Structure

Verify these files exist:

- [ ] `targets/share-extension/index.ts`
- [ ] `targets/share-extension/Info.plist`
- [ ] `targets/share-extension/Entitlements.plist`
- [ ] `app.json` (with `@bacons/apple-targets` plugin)
- [ ] `app.plugin.js`
- [ ] `utils/shareExtensionModule.ts`
- [ ] `utils/nativeShareReceiver.ts`
- [ ] `app/share-intent.tsx`

## Build and Run

### 7. Build the App

In Xcode:

- [ ] Select `Recall` scheme
- [ ] Select your device or simulator
- [ ] Click Run (⌘R) or Product > Run
- [ ] Build succeeds without errors
- [ ] App launches on device/simulator
- [ ] No crash on launch

### 8. Initial App Test

- [ ] App opens to login/home screen
- [ ] Can navigate through the app
- [ ] Can create a new note manually
- [ ] No console errors in Xcode

## Share Extension Testing

### 9. Test: Share URL from Safari

1. Open Safari on the device
2. Navigate to any website (e.g., https://www.apple.com)
3. Tap the Share button (square with arrow)
4. Scroll through share sheet

- [ ] "Recall" appears in the share sheet
- [ ] Tap "Recall"
- [ ] Recall app opens
- [ ] URL appears in note editor
- [ ] Can save the note

### 10. Test: Share Photo from Photos

1. Open Photos app
2. Select a photo
3. Tap Share button
4. Tap "Recall"

- [ ] Recall app opens
- [ ] Photo appears in note editor
- [ ] Can save the note with photo

### 11. Test: Share Multiple Photos

1. Open Photos app
2. Select multiple photos (2-5)
3. Tap Share button
4. Tap "Recall"

- [ ] Recall app opens
- [ ] All photos appear in note editor
- [ ] Can save the note with all photos

### 12. Test: Share Text from Notes

1. Open Notes app
2. Create or open a note with text
3. Select some text
4. Tap Share
5. Tap "Recall"

- [ ] Recall app opens
- [ ] Text appears in note editor
- [ ] Can save the note with text

### 13. Test: Share from Instagram

1. Open Instagram
2. View any post
3. Tap Share button (paper airplane)
4. Tap "Share to..."
5. Tap "Recall"

- [ ] Recall app opens
- [ ] Content appears in note editor
- [ ] Can save the note

### 14. Test: Share PDF from Files

1. Open Files app
2. Find a PDF file
3. Long press on PDF
4. Tap Share
5. Tap "Recall"

- [ ] Recall app opens
- [ ] PDF info appears in note editor
- [ ] Can save the note

### 15. Test: Share Video from Photos

1. Open Photos app
2. Select a video
3. Tap Share button
4. Tap "Recall"

- [ ] Recall app opens
- [ ] Video info appears in note editor
- [ ] Can save the note

## Edge Cases

### 16. Test: App States

Test sharing when app is in different states:

#### App Closed
- [ ] Share from Safari with app closed
- [ ] App launches and shows shared content

#### App in Background
- [ ] Open Recall app
- [ ] Go to home screen
- [ ] Share from Safari
- [ ] App comes to foreground with shared content

#### App in Foreground
- [ ] Have Recall app open
- [ ] Share from Safari
- [ ] App shows shared content

### 17. Test: Authentication

#### Not Logged In
- [ ] Log out of Recall
- [ ] Share from Safari
- [ ] App opens to login screen
- [ ] After login, shared content appears

#### Logged In
- [ ] Log in to Recall
- [ ] Share from Safari
- [ ] App opens directly to note editor with content

## Debugging

### 18. Console Logs

In Xcode, check the console for these log markers:

- [ ] `[ShareExtension]` logs appear when sharing
- [ ] `[ShareExtensionModule]` logs appear when reading data
- [ ] `[NativeShareReceiver]` logs appear when processing
- [ ] `[ShareIntentScreen]` logs appear when navigating
- [ ] No error messages in logs

### 19. Common Issues

If something doesn't work, check:

- [ ] App Groups are enabled in both targets
- [ ] App Group identifier matches exactly
- [ ] Bundle identifiers are correct
- [ ] URL schemes are registered
- [ ] Signing is configured properly
- [ ] Device/simulator is iOS 15.0+

## Performance

### 20. Performance Checks

- [ ] Share Extension appears in < 1 second
- [ ] App opens in < 2 seconds after sharing
- [ ] Images load in < 3 seconds
- [ ] No lag or freezing
- [ ] Smooth animations

## Cleanup

### 21. Data Cleanup

After sharing and saving:

- [ ] Shared data is removed from App Group container
- [ ] Temporary files are deleted
- [ ] No leftover data in shared container

## Production Build

### 22. EAS Build (Optional)

If building for production:

```bash
eas build --platform ios --profile production
```

- [ ] Build completes successfully
- [ ] Download and install on device
- [ ] Test sharing functionality
- [ ] All tests pass on production build

## Documentation

### 23. Review Documentation

- [ ] Read `IOS_SHARE_EXTENSION_IMPLEMENTATION.md`
- [ ] Read `SHARE_EXTENSION_QUICK_START.md`
- [ ] Read `SHARE_EXTENSION_README.md`
- [ ] Read `MIGRATION_SUMMARY.md`
- [ ] Understand the architecture
- [ ] Know how to debug issues

## Final Verification

### 24. Complete Test Suite

Run through all test scenarios one more time:

- [ ] Safari URL sharing
- [ ] Photos single image
- [ ] Photos multiple images
- [ ] Notes text sharing
- [ ] Instagram sharing
- [ ] Files PDF sharing
- [ ] Photos video sharing
- [ ] App closed state
- [ ] App background state
- [ ] App foreground state
- [ ] Not logged in state
- [ ] Logged in state

### 25. Sign Off

- [ ] All tests pass
- [ ] No console errors
- [ ] Performance is acceptable
- [ ] Documentation is clear
- [ ] Ready for production

## Troubleshooting Reference

If any checkbox fails, refer to:

1. **Setup Issues**: See `SHARE_EXTENSION_QUICK_START.md`
2. **Configuration Issues**: See `IOS_SHARE_EXTENSION_IMPLEMENTATION.md`
3. **Code Issues**: Check console logs and review implementation files
4. **Build Issues**: Clean build folder (⌘⇧K) and rebuild

## Notes

Use this space to note any issues or observations:

```
Date: ___________
Tester: ___________

Issues Found:
-
-
-

Resolutions:
-
-
-

Additional Notes:
-
-
-
```

## Success Criteria

✅ All checkboxes are checked
✅ All tests pass
✅ No console errors
✅ Performance is good
✅ Documentation is understood

## Next Steps

After completing this checklist:

1. Commit the changes
2. Push to repository
3. Test on multiple devices
4. Test on different iOS versions
5. Prepare for production release

---

**Congratulations!** If all checkboxes are checked, your iOS Share Extension is properly configured and working! 🎉
