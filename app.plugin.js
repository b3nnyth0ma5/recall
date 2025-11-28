
const {
  withXcodeProject,
  withInfoPlist,
  withEntitlementsPlist,
} = require('@expo/config-plugins');
const { withAppleTarget } = require('@bacons/apple-targets');

/**
 * Config plugin to add iOS Share Extension
 * This allows the app to appear in the iOS share sheet
 */
const withShareExtension = (config) => {
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
};

module.exports = withShareExtension;
