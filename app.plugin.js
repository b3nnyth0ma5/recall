const { createRunOncePlugin, withPodfile, withXcodeProject } = require('@expo/config-plugins');
const path = require('path');

/**
 * Expo Config Plugin for Recall App
 *
 * 1. Injects FOLLY_CFG_NO_COROUTINES=1 compiler flag (fixes folly/coro/Coroutine.h build error)
 * 2. Adds AppGroupModule.swift and SiriShortcutsModule.swift to the Xcode project compile sources
 */

const withFollyNoCoroutines = (config) => {
  return withPodfile(config, (config) => {
    const contents = config.modResults.contents;

    // Idempotency: skip if already applied
    if (contents.includes('FOLLY_CFG_NO_COROUTINES')) {
      return config;
    }

    const anchor = 'post_install do |installer|';

    if (!contents.includes(anchor)) {
      console.warn('[withFollyNoCoroutines] Could not find post_install block in Podfile — skipping folly fix');
      return config;
    }

    // Inject our fix as the FIRST thing inside the existing post_install block
    const injection = `${anchor}
  # Fix: folly/coro/Coroutine.h file not found (RN 0.81 + Reanimated)
  # Disables folly coroutine support to avoid missing vendored headers.
  installer.pods_project.build_configurations.each do |cfg|
    cfg.build_settings['OTHER_CPLUSPLUSFLAGS'] ||= ['$(OTHER_CFLAGS)']
    cfg.build_settings['OTHER_CPLUSPLUSFLAGS'] << '-DFOLLY_CFG_NO_COROUTINES=1'
  end`;

    // Replace only the FIRST occurrence of the anchor
    config.modResults.contents = contents.replace(anchor, injection);
    return config;
  });
};

const withNativeModules = (config) => {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const swiftFiles = ['AppGroupModule.swift', 'SiriShortcutsModule.swift'];

    // Find the main app group key to add files into (the group named after the app slug)
    // Fall back to any top-level group that isn't Products/Frameworks/Plugins
    const appName = config.modRequest.projectName || 'recall';
    let mainGroupKey = xcodeProject.findPBXGroupKey({ name: appName });
    if (!mainGroupKey) {
      // Try common fallback names
      mainGroupKey = xcodeProject.findPBXGroupKey({ name: 'recall' });
    }
    if (!mainGroupKey) {
      // Last resort: use the root project's main group
      const rootProject = xcodeProject.getFirstProject();
      mainGroupKey = rootProject && rootProject.firstProject && rootProject.firstProject.mainGroup;
    }

    if (!mainGroupKey) {
      console.warn('[withNativeModules] Could not find main group key — skipping Swift file injection');
      return config;
    }

    const targetUuid = xcodeProject.getFirstTarget().uuid;

    swiftFiles.forEach((filename) => {
      // Idempotency: check if already present in PBXFileReference section
      const fileRefSection = xcodeProject.pbxFileReferenceSection();
      const alreadyAdded = fileRefSection && Object.values(fileRefSection).some(
        (ref) => ref && typeof ref === 'object' && ref.path &&
          (ref.path === `../modules/${filename}` ||
           ref.path === `"../modules/${filename}"` ||
           String(ref.path).replace(/"/g, '').endsWith(filename))
      );

      if (alreadyAdded) {
        console.log(`[withNativeModules] ${filename} already in Xcode project, skipping`);
        return;
      }

      // Use addSourceFile with an explicit group key so it goes through addFile()
      // rather than addPluginFile() (which requires a Plugins group to exist).
      const filePath = path.join('..', 'modules', filename);
      const file = xcodeProject.addSourceFile(filePath, { target: targetUuid }, mainGroupKey);

      if (file) {
        console.log(`[withNativeModules] Added ${filename} to Xcode compile sources`);
      } else {
        console.warn(`[withNativeModules] Failed to add ${filename} to Xcode project`);
      }
    });

    return config;
  });
};

const withRecallConfig = (config) => {
  config = withFollyNoCoroutines(config);
  config = withNativeModules(config);
  return config;
};

module.exports = createRunOncePlugin(withRecallConfig, 'withRecallConfig', '1.0.0');
