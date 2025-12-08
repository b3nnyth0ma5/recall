
const { withAppDelegate, withXcodeProject, withInfoPlist, withEntitlementsPlist } = require('@expo/config-plugins');
const { createRunOncePlugin } = require('@expo/config-plugins');

/**
 * Expo Config Plugin for iOS Share Extension using @bacons/apple-targets
 * 
 * This plugin configures the iOS Share Extension to allow the Recall app
 * to appear in the iOS share sheet when users share content from other apps.
 * 
 * IMPORTANT: This plugin works in conjunction with @bacons/apple-targets
 * Make sure to run `npm run build:ios` (expo prebuild -p ios --clean) after changes
 */

const APP_GROUP_ID = 'group.com.anonymous.Natively';
const URL_SCHEME = 'natively';

const withShareExtensionConfig = (config) => {
  console.log('[Config Plugin] Configuring iOS Share Extension...');

  // Add App Groups entitlement to main app
  config = withEntitlementsPlist(config, (config) => {
    console.log('[Config Plugin] Adding App Groups entitlement to main app');
    
    if (!config.modResults['com.apple.security.application-groups']) {
      config.modResults['com.apple.security.application-groups'] = [];
    }
    
    const appGroups = config.modResults['com.apple.security.application-groups'];
    if (!appGroups.includes(APP_GROUP_ID)) {
      appGroups.push(APP_GROUP_ID);
      console.log('[Config Plugin] Added App Group:', APP_GROUP_ID);
    }
    
    return config;
  });

  // Update main app Info.plist with URL schemes and document types
  config = withInfoPlist(config, (config) => {
    console.log('[Config Plugin] Configuring main app Info.plist');
    
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
      console.log('[Config Plugin] Added URL schemes:', [URL_SCHEME, 'recall']);
    }

    // Add document types for better share sheet integration
    if (!config.modResults.CFBundleDocumentTypes) {
      config.modResults.CFBundleDocumentTypes = [];
    }

    const documentTypes = config.modResults.CFBundleDocumentTypes;
    
    // Add support for various document types
    const supportedTypes = [
      {
        CFBundleTypeName: 'Text',
        LSHandlerRank: 'Alternate',
        LSItemContentTypes: ['public.text', 'public.plain-text', 'public.utf8-plain-text'],
      },
      {
        CFBundleTypeName: 'Images',
        LSHandlerRank: 'Alternate',
        LSItemContentTypes: ['public.image', 'public.jpeg', 'public.png', 'public.heic'],
      },
      {
        CFBundleTypeName: 'Videos',
        LSHandlerRank: 'Alternate',
        LSItemContentTypes: ['public.movie', 'public.video', 'public.mpeg-4'],
      },
      {
        CFBundleTypeName: 'URLs',
        LSHandlerRank: 'Alternate',
        LSItemContentTypes: ['public.url'],
      },
    ];

    for (const docType of supportedTypes) {
      const exists = documentTypes.some(
        (type) => type.CFBundleTypeName === docType.CFBundleTypeName
      );
      if (!exists) {
        documentTypes.push(docType);
        console.log('[Config Plugin] Added document type:', docType.CFBundleTypeName);
      }
    }

    return config;
  });

  console.log('[Config Plugin] iOS Share Extension configuration complete');
  return config;
};

module.exports = createRunOncePlugin(withShareExtensionConfig, 'withShareExtensionConfig', '1.0.0');
