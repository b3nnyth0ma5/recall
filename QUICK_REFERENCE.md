
# iOS Share Extension - Quick Reference

Quick reference guide for common tasks and information.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Build iOS project
npm run build:ios

# Open in Xcode
open ios/Recall.xcworkspace

# Build and run
# Press ⌘R in Xcode
```

## 📁 Key Files

| File | Purpose |
|------|---------|
| `targets/share-extension/index.ts` | Share Extension entry point |
| `utils/shareExtensionModule.ts` | Read shared data from App Group |
| `utils/nativeShareReceiver.ts` | Process received share data |
| `app/share-intent.tsx` | Share processing screen |
| `app/_layout.tsx` | Routing logic |
| `app.json` | Expo configuration |
| `app.plugin.js` | Config plugin |

## 🔧 Configuration

### App Group
```
group.com.anonymous.Natively
```

### Bundle Identifiers
```
Main App:       com.anonymous.Natively
Share Extension: com.anonymous.Natively.ShareExtension
```

### URL Schemes
```
Primary:   natively://
Secondary: recall://
Share:     natively://share-intent
```

## 📝 Common Commands

```bash
# Clean build
npx expo prebuild -p ios --clean

# View logs
xcrun simctl spawn booted log stream --predicate 'subsystem contains "com.anonymous.Natively"'

# Build with EAS
eas build --platform ios --profile production

# Open Xcode
open ios/Recall.xcworkspace
```

## 🐛 Debugging

### Log Markers
```
[ShareExtension]       - Extension processing
[ShareExtensionModule] - Data reading
[NativeShareReceiver]  - Share receiving
[ShareIntentScreen]    - UI processing
```

### Common Issues

**Share Extension not appearing**
```bash
# Solution 1: Rebuild
npx expo prebuild -p ios --clean

# Solution 2: Restart device
# Restart your iOS device or simulator
```

**Content not received**
```typescript
// Check console logs for errors
// Verify App Group identifier matches
// Ensure deep link is registered
```

**Images not loading**
```typescript
// Verify images are copied to shared container
// Check file paths are correct
// Ensure sufficient storage space
```

## 🧪 Testing Checklist

- [ ] Share URL from Safari
- [ ] Share photo from Photos
- [ ] Share multiple photos
- [ ] Share text from Notes
- [ ] Share from Instagram
- [ ] Share PDF from Files
- [ ] Share video from Photos
- [ ] Test with app closed
- [ ] Test with app in background
- [ ] Test with app in foreground

## 📊 Supported Content Types

| Type | UTI | Max Count |
|------|-----|-----------|
| Text | `public.plain-text` | 1 |
| URLs | `public.url` | 10 |
| Images | `public.image` | 10 |
| Videos | `public.movie` | 5 |
| PDFs | `com.adobe.pdf` | 10 |

## 💻 Code Snippets

### Get Shared Data
```typescript
import { getSharedData, clearSharedData } from '@/utils/shareExtensionModule';

const data = await getSharedData();
if (data) {
  console.log('Text:', data.text);
  console.log('Images:', data.images);
  await clearSharedData();
}
```

### Listen for Shares
```typescript
import { listenForShareIntents } from '@/utils/nativeShareReceiver';

const unsubscribe = listenForShareIntents((shareData) => {
  console.log('Received:', shareData);
});

// Clean up
unsubscribe();
```

### Process Share Intent
```typescript
import { processReceivedUrl } from '@/utils/nativeShareReceiver';

const shareData = await processReceivedUrl(url);
if (shareData) {
  // Handle shared data
}
```

## 🏗️ Architecture

```
Other Apps → Share Sheet → Share Extension → App Group → Main App → Note Editor
```

## 📦 Data Structure

```typescript
interface SharedData {
  text?: string;
  urls?: string[];
  images?: string[];
  videos?: string[];
  files?: string[];
  timestamp?: number;
}
```

## 🔐 Security

- App Groups: Sandboxed container
- Data Cleanup: Automatic after processing
- File Permissions: Restricted to app group
- Deep Links: App-specific URL scheme

## ⚡ Performance

- Extension Load: < 1 second
- Data Transfer: Instant
- Image Processing: 1-3 seconds
- App Launch: < 2 seconds

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [Implementation Guide](./IOS_SHARE_EXTENSION_IMPLEMENTATION.md) | Complete architecture |
| [Quick Start](./SHARE_EXTENSION_QUICK_START.md) | Step-by-step setup |
| [README](./SHARE_EXTENSION_README.md) | Overview and usage |
| [Migration Summary](./MIGRATION_SUMMARY.md) | What changed |
| [Before/After](./BEFORE_AFTER_COMPARISON.md) | Comparison |
| [Setup Checklist](./SETUP_CHECKLIST.md) | Verification |
| [Quick Reference](./QUICK_REFERENCE.md) | This file |

## 🆘 Getting Help

1. Check console logs
2. Review troubleshooting section
3. Check documentation
4. Verify configuration
5. Test on real device

## 🎯 Key Takeaways

✅ Uses `@bacons/apple-targets` for easy configuration
✅ TypeScript-based Share Extension
✅ Automatic Xcode project setup
✅ Comprehensive logging for debugging
✅ Works with all iOS apps
✅ Supports multiple content types
✅ Easy to maintain and extend

## 🔄 Update Process

```bash
# 1. Pull latest changes
git pull

# 2. Install dependencies
npm install

# 3. Rebuild iOS project
npm run build:ios

# 4. Open in Xcode
open ios/Recall.xcworkspace

# 5. Build and test
# Press ⌘R in Xcode
```

## 📱 Testing Apps

Test sharing from these apps:
- Safari (URLs)
- Photos (images, videos)
- Notes (text)
- Instagram (posts)
- Twitter/X (tweets)
- Messages (text, images)
- Files (PDFs, documents)
- Mail (attachments)

## 🎨 Customization

### Add New Content Type

1. Update `targets/share-extension/Info.plist`
2. Add handler in `targets/share-extension/index.ts`
3. Update `SharedData` interface
4. Test with new content type

### Change App Group

1. Update `APP_GROUP_ID` in all files
2. Update `app.json` entitlements
3. Rebuild iOS project
4. Update in Xcode if needed

### Change URL Scheme

1. Update `URL_SCHEME` in all files
2. Update `app.json` scheme
3. Rebuild iOS project
4. Test deep linking

## 🚨 Emergency Fixes

### Extension Crashes
```bash
# Clean build folder
# In Xcode: Product > Clean Build Folder (⌘⇧K)

# Delete derived data
rm -rf ~/Library/Developer/Xcode/DerivedData

# Rebuild
npx expo prebuild -p ios --clean
```

### Data Not Syncing
```typescript
// Check App Group path
import { getSharedContainerPath } from '@/utils/shareExtensionModule';
console.log('Container:', getSharedContainerPath());

// Verify file exists
import * as FileSystem from 'expo-file-system/legacy';
const path = `${getSharedContainerPath()}shared_data.json`;
const info = await FileSystem.getInfoAsync(path);
console.log('File exists:', info.exists);
```

### Extension Not Appearing
```bash
# 1. Verify bundle identifier
# Check in Xcode: ShareExtension target > General > Bundle Identifier

# 2. Verify App Groups
# Check in Xcode: Both targets > Signing & Capabilities > App Groups

# 3. Restart device
# Restart iOS device or simulator

# 4. Reinstall app
# Delete app from device and reinstall
```

## 📈 Metrics

Track these metrics:
- Share success rate
- Average processing time
- Error rate
- Most shared content types
- Most common source apps

## 🔮 Future Enhancements

- [ ] Preview in Share Extension
- [ ] Category selection
- [ ] Quick note feature
- [ ] Offline support
- [ ] More document types
- [ ] Analytics tracking

## ✨ Best Practices

1. **Always check logs** - Use console.log liberally
2. **Test on real device** - Simulators may behave differently
3. **Clean build often** - Prevents stale build issues
4. **Verify configuration** - Double-check App Groups and bundle IDs
5. **Test multiple apps** - Different apps may share differently
6. **Handle errors gracefully** - Always have fallbacks
7. **Clean up data** - Delete shared data after processing
8. **Document changes** - Keep documentation up to date

## 🎓 Learning Resources

- [Apple Share Extension Docs](https://developer.apple.com/documentation/uikit/share_extensions)
- [@bacons/apple-targets](https://github.com/EvanBacon/apple-targets)
- [Expo Config Plugins](https://docs.expo.dev/guides/config-plugins/)
- [App Groups](https://developer.apple.com/documentation/bundleresources/entitlements/com_apple_security_application-groups)

---

**Need more details?** Check the full documentation files listed above.

**Found a bug?** Check console logs and review the troubleshooting section.

**Want to contribute?** Follow the best practices and update documentation.
