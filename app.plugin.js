
const { withInfoPlist, createRunOncePlugin } = require('@expo/config-plugins');

/**
 * Expo Config Plugin for Recall App
 * 
 * This plugin configures the Share Extension's Info.plist with proper NSExtension settings
 */

const withShareExtensionConfig = (config) => {
  console.log('[Config Plugin] Configuring Share Extension Info.plist');
  
  // Configure the Share Extension's Info.plist
  config = withInfoPlist(config, (config) => {
    const infoPlist = config.modResults;
    
    // Only apply to Share Extension target
    if (config.modRequest?.platformProjectRoot?.includes('ShareExtension')) {
      console.log('[Config Plugin] Applying Share Extension NSExtension configuration');
      
      // Configure NSExtension dictionary
      infoPlist.NSExtension = {
        NSExtensionAttributes: {
          NSExtensionActivationRule: {
            // Support text content
            NSExtensionActivationSupportsText: true,
            // Support URLs
            NSExtensionActivationSupportsWebURLWithMaxCount: 10,
            NSExtensionActivationSupportsWebPageWithMaxCount: 10,
            // Support images
            NSExtensionActivationSupportsImageWithMaxCount: 10,
            // Support videos
            NSExtensionActivationSupportsMovieWithMaxCount: 10,
            // Support files
            NSExtensionActivationSupportsFileWithMaxCount: 10,
            // Require at least one item
            NSExtensionActivationSupportsAttachmentsWithMinCount: 1,
            NSExtensionActivationSupportsAttachmentsWithMaxCount: 10
          }
        },
        // Set the extension point identifier for share services
        NSExtensionPointIdentifier: 'com.apple.share-services',
        // Set the principal class (handled by @bacons/apple-targets)
        NSExtensionPrincipalClass: 'ShareViewController'
      };
      
      console.log('[Config Plugin] NSExtension configuration applied successfully');
    }
    
    return config;
  });
  
  return config;
};

module.exports = createRunOncePlugin(withShareExtensionConfig, 'withShareExtensionConfig', '1.0.0');
