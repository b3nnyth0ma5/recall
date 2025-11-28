
const { withAppDelegate, withXcodeProject, withInfoPlist, withEntitlementsPlist } = require('@expo/config-plugins');
const { createRunOncePlugin } = require('@expo/config-plugins');

/**
 * Expo Config Plugin for iOS Share Extension using @bacons/apple-targets
 * 
 * This plugin configures the iOS Share Extension to allow the Recall app
 * to appear in the iOS share sheet when users share content from other apps.
 */

const APP_GROUP_ID = 'group.com.anonymous.Natively';
const URL_SCHEME = 'natively';

const withShareExtensionConfig = (config) => {
  // Add App Groups entitlement to main app
  config = withEntitlementsPlist(config, (config) => {
    if (!config.modResults['com.apple.security.application-groups']) {
      config.modResults['com.apple.security.application-groups'] = [];
    }
    
    const appGroups = config.modResults['com.apple.security.application-groups'];
    if (!appGroups.includes(APP_GROUP_ID)) {
      appGroups.push(APP_GROUP_ID);
    }
    
    return config;
  });

  // Update main app Info.plist with URL schemes and document types
  config = withInfoPlist(config, (config) => {
    // Ensure CFBundleURLTypes exists
    if (!config.modResults.CFBundleURLTypes) {
      config.modResults.CFBundleURLTypes = [];
    }

    // Add URL scheme if not present
    const urlTypes = config.modResults.CFBundleURLTypes;
    const hasNativelyScheme = urlTypes.some(
      (type) => type.CFBundleURLSchemes && type.CFBundleURLSchemes.includes(URL_SCHEME)
    );

    if (!hasNativelyScheme) {
      urlTypes.push({
        CFBundleURLSchemes: [URL_SCHEME, 'recall'],
        CFBundleURLName: 'com.anonymous.Natively',
        CFBundleTypeRole: 'Editor',
      });
    }

    return config;
  });

  return config;
};

module.exports = createRunOncePlugin(withShareExtensionConfig, 'withShareExtensionConfig', '1.0.0');
