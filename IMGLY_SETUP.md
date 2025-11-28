
# IMG.LY PhotoEditor SDK Integration Guide

This app now uses the **IMG.LY React Native PhotoEditor SDK** (PESDK) for professional image editing capabilities.

## Features

The IMG.LY PhotoEditor SDK provides:

- **Transform Tools**: Crop, rotate, flip with various aspect ratios
- **Filters**: Professional photo filters
- **Adjustments**: Brightness, contrast, saturation, exposure, etc.
- **Text**: Add customizable text overlays
- **Stickers**: Add fun stickers to images
- **Brush**: Drawing and painting tools
- **Focus**: Blur and focus effects
- **Overlays**: Color overlays and blend modes
- **Frames**: Photo frames and borders

## Installation

The package `react-native-photoeditorsdk` has been installed. However, you need to complete the native setup:

### iOS Setup

1. **Add the SDK to your Podfile** (if not auto-linked):
   ```ruby
   pod 'PhotoEditorSDK', '~> 11.0'
   ```

2. **Run pod install**:
   ```bash
   cd ios && pod install && cd ..
   ```

3. **License Key** (Required for production):
   - Get a license key from [IMG.LY](https://img.ly/pricing)
   - Add it to your `AppDelegate.m` or `AppDelegate.swift`:
   
   ```swift
   import PhotoEditorSDK
   
   func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
       PESDK.unlockWithLicense(at: Bundle.main.url(forResource: "LICENSE_IOS", withExtension: "json")!)
       return true
   }
   ```

### Android Setup

1. **Add Maven repository** to `android/build.gradle`:
   ```gradle
   allprojects {
       repositories {
           maven { url 'https://artifactory.img.ly/artifactory/imgly' }
       }
   }
   ```

2. **License Key** (Required for production):
   - Get a license key from [IMG.LY](https://img.ly/pricing)
   - Add it to your `MainApplication.java` or `MainApplication.kt`:
   
   ```kotlin
   import ly.img.android.pesdk.PhotoEditorSettingsList
   import ly.img.android.pesdk.backend.model.state.LoadSettings
   
   override fun onCreate() {
       super.onCreate()
       PESDK.initSDKWithLicensePath(this, "file:///android_asset/LICENSE_ANDROID")
   }
   ```

### License Files

For development, you can use the SDK without a license (it will show a watermark).

For production:
1. Purchase a license from [IMG.LY](https://img.ly/pricing)
2. Download the license files (`LICENSE_IOS.json` and `LICENSE_ANDROID`)
3. Place them in:
   - iOS: `ios/YourApp/LICENSE_IOS.json`
   - Android: `android/app/src/main/assets/LICENSE_ANDROID`

## Usage

The `ImageEditor` component has been updated to use the IMG.LY SDK:

```typescript
import { ImageEditor } from '@/components/ImageEditor';

<ImageEditor
  visible={showImageEditor}
  imageUri={imageToEdit}
  onSave={(editedUri) => {
    // Handle the edited image
    console.log('Edited image:', editedUri);
  }}
  onCancel={() => {
    // Handle cancellation
    console.log('User canceled editing');
  }}
/>
```

## Configuration

The SDK is configured in `components/ImageEditor.tsx`. You can customize:

- **Tools**: Enable/disable specific editing tools
- **Theme**: Customize colors to match your app
- **Export Settings**: Image quality and format
- **Transform Options**: Available crop aspect ratios

Example configuration:

```typescript
const configuration: Configuration = {
  export: {
    image: {
      exportType: 1, // JPEG
      quality: 0.9,
    },
  },
  tools: [
    'transform',
    'filter',
    'adjustment',
    'text',
    'sticker',
    'brush',
  ],
  theme: {
    primaryColor: colors.primary,
    backgroundColor: colors.background,
  },
};
```

## Troubleshooting

### iOS Issues

**Problem**: Build fails with "PhotoEditorSDK not found"
- **Solution**: Run `cd ios && pod install && cd ..`

**Problem**: License error on startup
- **Solution**: Ensure the license file is in the correct location and properly referenced

### Android Issues

**Problem**: Build fails with "Could not resolve ly.img.android:pesdk"
- **Solution**: Ensure the IMG.LY Maven repository is added to `android/build.gradle`

**Problem**: License error on startup
- **Solution**: Ensure the license file is in `android/app/src/main/assets/`

### General Issues

**Problem**: Editor doesn't open
- **Solution**: Check console logs for errors. Ensure the image URI is valid.

**Problem**: Watermark appears on images
- **Solution**: This is expected in development. Add a license key for production.

## Documentation

- [IMG.LY PhotoEditor SDK Documentation](https://docs.photoeditorsdk.com/)
- [React Native Integration Guide](https://github.com/imgly/catalog-react-native)
- [API Reference](https://docs.photoeditorsdk.com/guides/react-native/v3/)

## Migration from Previous Editor

The previous custom image editor has been replaced with the IMG.LY SDK. Key differences:

### Before (Custom Editor)
- Basic crop, rotate, flip functionality
- Manual gesture handling
- Limited features

### After (IMG.LY SDK)
- Professional-grade editing tools
- Filters, adjustments, text, stickers, and more
- Native performance
- Consistent UI across platforms

### Breaking Changes

None! The `ImageEditor` component maintains the same API:
- `visible`: boolean
- `imageUri`: string
- `onSave`: (editedUri: string) => void
- `onCancel`: () => void

## Next Steps

1. **Test the integration**: Try editing an image in the app
2. **Customize the configuration**: Adjust tools and theme in `ImageEditor.tsx`
3. **Get a license**: For production, purchase a license from [IMG.LY](https://img.ly/pricing)
4. **Add license files**: Place license files in the correct locations
5. **Rebuild the app**: Run `npm run build:ios` or `npm run build:android`

## Support

For issues with the IMG.LY SDK:
- [IMG.LY Support](https://img.ly/support)
- [GitHub Issues](https://github.com/imgly/catalog-react-native/issues)

For app-specific issues:
- Check the console logs
- Review the `ImageEditor.tsx` component
- Ensure all native setup steps are completed
