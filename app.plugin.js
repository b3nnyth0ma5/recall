
/**
 * Config plugin to add iOS Share Extension
 * This allows the app to appear in the iOS share sheet
 * 
 * Note: This plugin requires @bacons/apple-targets which may have
 * compatibility issues with certain Expo SDK versions.
 */

// Check if we're in a valid Expo environment before loading dependencies
const isExpoEnvironment = () => {
  try {
    // Check if we can safely load Expo config plugins
    require('@expo/config-plugins');
    return true;
  } catch {
    return false;
  }
};

const withShareExtension = (config) => {
  // Early return if not in a valid environment
  if (!isExpoEnvironment()) {
    console.warn('Skipping Share Extension plugin: not in valid Expo environment');
    return config;
  }

  try {
    // Lazy load dependencies only when needed
    const { withAppleTarget } = require('@bacons/apple-targets');
    
    return withAppleTarget(config, {
      type: 'share-extension',
      name: 'RecallShareExtension',
      bundleIdentifier: 'com.anonymous.Natively.ShareExtension',
      deploymentTarget: '15.0',
      
      // Info.plist for the Share Extension
      infoPlist: {
        NSExtension: {
          NSExtensionAttributes: {
            NSExtensionActivationRule: {
              // Accept text content
              NSExtensionActivationSupportsText: true,
              // Accept URLs
              NSExtensionActivationSupportsWebURLWithMaxCount: 1,
              NSExtensionActivationSupportsWebPageWithMaxCount: 1,
              // Accept images
              NSExtensionActivationSupportsImageWithMaxCount: 10,
              // Accept files
              NSExtensionActivationSupportsFileWithMaxCount: 10,
            },
          },
          NSExtensionMainStoryboard: 'MainInterface',
          NSExtensionPointIdentifier: 'com.apple.share-services',
        },
      },
      
      // Entitlements for the Share Extension
      entitlements: {
        'com.apple.security.application-groups': [
          'group.com.anonymous.Natively',
        ],
      },
    });
  } catch (error) {
    console.error('Failed to apply Share Extension plugin:', error);
    console.warn('The app will build without the Share Extension. Native sharing may not work on iOS.');
    // Return the config unchanged if there's an error
    return config;
  }
};

module.exports = withShareExtension;
