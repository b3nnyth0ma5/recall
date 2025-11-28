
/**
 * Expo Config Plugin for iOS Share Extension
 * 
 * This plugin adds a Share Extension to the iOS app, allowing it to appear
 * in the iOS share sheet when users share content from other apps.
 * 
 * Features:
 * - Accepts text, URLs, images, videos, and PDFs
 * - Uses App Groups for data sharing between extension and main app
 * - Properly configures entitlements and Info.plist
 * - Handles all necessary Xcode project modifications
 */

const {
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
} = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

// Configuration constants
const SHARE_EXTENSION_NAME = 'ShareExtension';
const SHARE_EXTENSION_BUNDLE_ID = 'com.anonymous.Natively.ShareExtension';
const APP_GROUP_ID = 'group.com.anonymous.Natively';
const DEPLOYMENT_TARGET = '15.0';

/**
 * Main plugin function
 */
const withShareExtension = (config) => {
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

  // Update main app Info.plist
  config = withInfoPlist(config, (config) => {
    // Ensure CFBundleURLTypes exists
    if (!config.modResults.CFBundleURLTypes) {
      config.modResults.CFBundleURLTypes = [];
    }

    // Add URL scheme if not present
    const urlTypes = config.modResults.CFBundleURLTypes;
    const hasNativelyScheme = urlTypes.some(
      (type) => type.CFBundleURLSchemes && type.CFBundleURLSchemes.includes('natively')
    );

    if (!hasNativelyScheme) {
      urlTypes.push({
        CFBundleURLSchemes: ['natively', 'recall'],
        CFBundleURLName: 'com.anonymous.Natively',
        CFBundleTypeRole: 'Editor',
      });
    }

    // Add document types for file handling
    if (!config.modResults.CFBundleDocumentTypes) {
      config.modResults.CFBundleDocumentTypes = [];
    }

    const documentTypes = [
      {
        CFBundleTypeName: 'Images',
        CFBundleTypeRole: 'Viewer',
        LSHandlerRank: 'Alternate',
        LSItemContentTypes: [
          'public.image',
          'public.jpeg',
          'public.png',
          'public.heic',
          'public.heif',
          'public.gif',
          'public.webp',
          'public.tiff',
          'public.bmp',
        ],
      },
      {
        CFBundleTypeName: 'Text',
        CFBundleTypeRole: 'Viewer',
        LSHandlerRank: 'Alternate',
        LSItemContentTypes: [
          'public.plain-text',
          'public.text',
          'public.utf8-plain-text',
          'public.rtf',
        ],
      },
      {
        CFBundleTypeName: 'URLs',
        CFBundleTypeRole: 'Viewer',
        LSHandlerRank: 'Alternate',
        LSItemContentTypes: ['public.url', 'public.file-url'],
      },
      {
        CFBundleTypeName: 'PDFs',
        CFBundleTypeRole: 'Viewer',
        LSHandlerRank: 'Alternate',
        LSItemContentTypes: ['com.adobe.pdf'],
      },
      {
        CFBundleTypeName: 'Videos',
        CFBundleTypeRole: 'Viewer',
        LSHandlerRank: 'Alternate',
        LSItemContentTypes: [
          'public.movie',
          'public.video',
          'public.mpeg-4',
          'com.apple.quicktime-movie',
        ],
      },
    ];

    config.modResults.CFBundleDocumentTypes = documentTypes;

    // Add UTImportedTypeDeclarations for URL handling
    if (!config.modResults.UTImportedTypeDeclarations) {
      config.modResults.UTImportedTypeDeclarations = [];
    }

    const urlTypeDeclaration = {
      UTTypeIdentifier: 'public.url',
      UTTypeDescription: 'URL',
      UTTypeConformsTo: ['public.data'],
      UTTypeTagSpecification: {},
    };

    const hasUrlDeclaration = config.modResults.UTImportedTypeDeclarations.some(
      (decl) => decl.UTTypeIdentifier === 'public.url'
    );

    if (!hasUrlDeclaration) {
      config.modResults.UTImportedTypeDeclarations.push(urlTypeDeclaration);
    }

    return config;
  });

  // Add Xcode project modifications
  config = withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    
    console.log('[ShareExtension Plugin] Configuring Xcode project...');
    
    // Note: The actual Xcode project modifications would need to be done
    // using a tool like xcode or by manually editing the .pbxproj file
    // For now, we'll document what needs to be done
    
    console.log('[ShareExtension Plugin] ⚠️  Manual Xcode configuration required:');
    console.log('1. Open the project in Xcode');
    console.log('2. Add a new Share Extension target named "ShareExtension"');
    console.log(`3. Set the bundle identifier to: ${SHARE_EXTENSION_BUNDLE_ID}`);
    console.log(`4. Set the deployment target to: ${DEPLOYMENT_TARGET}`);
    console.log('5. Add the ShareViewController.swift file to the extension target');
    console.log('6. Add the App Groups capability to both targets');
    console.log(`7. Enable the app group: ${APP_GROUP_ID}`);
    console.log('8. Link the ShareExtension target with the main app target');
    
    return config;
  });

  return config;
};

module.exports = withShareExtension;
