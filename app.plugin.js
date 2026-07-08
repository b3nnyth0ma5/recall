const { createRunOncePlugin, withPodfile, withXcodeProject } = require('@expo/config-plugins');

/**
 * Expo Config Plugin for Recall App
 *
 * 1. Injects FOLLY_CFG_NO_COROUTINES=1 compiler flag (fixes folly/coro/Coroutine.h build error).
 * 2. Strips -D EXPO_CONFIGURATION_DEBUG from OTHER_SWIFT_FLAGS in Release build configurations
 *    so it cannot leak into production builds and cause module-resolution mismatches.
 * 3. Injects AppGroupModule.swift into ios/RecallNative/ during prebuild.
 * 4. Injects SiriShortcutsModule.swift into ios/RecallNative/ during prebuild.
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

/**
 * Strips -D EXPO_CONFIGURATION_DEBUG from OTHER_SWIFT_FLAGS in all Release
 * build configurations of the main Xcode project.  This prevents the debug
 * flag from leaking into production builds and causing module-resolution
 * mismatches (e.g. "no such module 'RecallNative'").
 */
const withStripDebugConfigFlag = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const FLAG = '-D EXPO_CONFIGURATION_DEBUG';

    // Iterate every build configuration in the project
    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(buildConfigs)) {
      const buildConfig = buildConfigs[key];
      if (typeof buildConfig !== 'object' || !buildConfig.name) continue;

      // Only strip from Release configurations
      if (buildConfig.name !== 'Release') continue;

      const settings = buildConfig.buildSettings;
      if (!settings) continue;

      // OTHER_SWIFT_FLAGS can be a string or an array
      if (typeof settings.OTHER_SWIFT_FLAGS === 'string') {
        if (settings.OTHER_SWIFT_FLAGS.includes(FLAG)) {
          settings.OTHER_SWIFT_FLAGS = settings.OTHER_SWIFT_FLAGS
            .split(' ')
            .filter((f) => f !== '-D' && f !== 'EXPO_CONFIGURATION_DEBUG')
            .join(' ')
            .trim();
          console.log(`[withStripDebugConfigFlag] Stripped ${FLAG} from Release OTHER_SWIFT_FLAGS (key: ${key})`);
        }
      } else if (Array.isArray(settings.OTHER_SWIFT_FLAGS)) {
        const before = settings.OTHER_SWIFT_FLAGS.length;
        settings.OTHER_SWIFT_FLAGS = settings.OTHER_SWIFT_FLAGS.filter(
          (f) => f !== FLAG && f !== '-D EXPO_CONFIGURATION_DEBUG' && f !== 'EXPO_CONFIGURATION_DEBUG'
        );
        if (settings.OTHER_SWIFT_FLAGS.length !== before) {
          console.log(`[withStripDebugConfigFlag] Stripped ${FLAG} from Release OTHER_SWIFT_FLAGS array (key: ${key})`);
        }
      }
    }

    return config;
  });
};



/**
 * Scopes ASSETCATALOG_COMPILER_APPICON_NAME to the app target only.
 * Fixes Expo SDK 54 bug where this setting is written at the project level,
 * causing every extension target (share extension, etc.) to fail icon lookup.
 * See: https://github.com/expo/expo/pull/41536
 */
const withScopeIconToAppTarget = (config) => {
  return withXcodeProject(config, (config) => {
    const buildConfigs = config.modResults.pbxXCBuildConfigurationSection();
    Object.values(buildConfigs).forEach((buildConfig) => {
      const settings = buildConfig.buildSettings;
      if (!settings) return;
      const bundleId = settings['PRODUCT_BUNDLE_IDENTIFIER'];
      // Remove from share extension target configs — its asset catalog has no AppIcon set
      if (
        bundleId === '"com.b3nny1nc.recall.ShareExtension"' ||
        bundleId === 'com.b3nny1nc.recall.ShareExtension'
      ) {
        if (settings['ASSETCATALOG_COMPILER_APPICON_NAME'] !== undefined) {
          delete settings['ASSETCATALOG_COMPILER_APPICON_NAME'];
          console.log('[withScopeIconToAppTarget] Removed ASSETCATALOG_COMPILER_APPICON_NAME from ShareExtension build config');
        }
      }
    });
    return config;
  });
};

const withRecallConfig = (config) => {
  config = withFollyNoCoroutines(config);
  config = withStripDebugConfigFlag(config);
  config = withScopeIconToAppTarget(config);
  return config;
};

module.exports = createRunOncePlugin(withRecallConfig, 'withRecallConfig', '1.0.0');
