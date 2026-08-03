const { createRunOncePlugin, withPodfile, withXcodeProject, withDangerousMod } = require('@expo/config-plugins');

/**
 * Expo Config Plugin for Recall App
 *
 * 1. Injects FOLLY_CFG_NO_COROUTINES=1 compiler flag (fixes folly/coro/Coroutine.h build error).
 * 2. Strips -D EXPO_CONFIGURATION_DEBUG from OTHER_SWIFT_FLAGS in Release build configurations
 *    so it cannot leak into production builds and cause module-resolution mismatches.
 * 3. Injects AppGroupModule.swift into ios/RecallNative/ during prebuild.
 * 4. Injects SiriShortcutsModule.swift into ios/RecallNative/ during prebuild.
 * 5. Copies App Intent Swift files into ios/Recall/AppIntents/ and registers them in Xcode.
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

/**
 * Copies the three App Intent Swift files into ios/Recall/AppIntents/ and
 * registers them in the Xcode project's main app target so they are compiled
 * as part of the main app (not the RecallNative pod).
 */
const withAppIntents = (config) => {
  const INTENT_FILES = [
    'RecallEntity.swift',
    'RecallSnippetView.swift',
    'RecallSupabaseClient.swift',
    'SearchRecallIntent.swift',
    'RecallShortcuts.swift',
    'RecallShortcutsHelper.swift',
    'CreateRecallIntent.swift',
  ];

  // Stage 1: copy Swift files into the iOS project directory
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const fs = require('fs');
      const path = require('path');
      const srcDir = path.join(cfg.modRequest.projectRoot, 'modules', 'recall-native');
      const dstDir = path.join(cfg.modRequest.platformProjectRoot, 'Recall', 'AppIntents');
      if (!fs.existsSync(dstDir)) {
        fs.mkdirSync(dstDir, { recursive: true });
      }
      for (const f of INTENT_FILES) {
        const src = path.join(srcDir, f);
        const dst = path.join(dstDir, f);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst);
          console.log(`[withAppIntents] Copied ${f} → ${dstDir}`);
        } else {
          console.warn(`[withAppIntents] Source file not found: ${src}`);
        }
      }
      return cfg;
    },
  ]);

  // Stage 2: register the files in the Xcode project's main app target
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const mainTarget = project.getFirstTarget();
    if (!mainTarget) {
      console.warn('[withAppIntents] Could not find main Xcode target');
      return cfg;
    }
    const mainTargetUuid = mainTarget.uuid;

    // Find or create the AppIntents group under the main Recall group
    let groupKey = project.findPBXGroupKey({ name: 'AppIntents' });
    if (!groupKey) {
      const mainGroupKey = project.findPBXGroupKey({ name: 'Recall' });
      const result = project.addPbxGroup([], 'AppIntents', 'Recall/AppIntents');
      groupKey = result.uuid;
      if (mainGroupKey) {
        project.addToPbxGroup({ fileRef: groupKey, basename: 'AppIntents' }, mainGroupKey);
      }
    }

    for (const f of INTENT_FILES) {
      // Check if already added (idempotency)
      const existingFile = project.pbxFileReferenceSection
        ? Object.values(project.pbxFileReferenceSection()).find(
            (ref) => ref && ref.path && (ref.path === `"${f}"` || ref.path === f)
          )
        : null;
      if (!existingFile) {
        // Use bare filename — the group path 'Recall/AppIntents' provides the directory context
        project.addSourceFile(f, { target: mainTargetUuid }, groupKey);
        console.log(`[withAppIntents] Registered ${f} in Xcode project`);
      }
    }

    return cfg;
  });

  return config;
};

const withShareExtensionIcon = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const fs = require('fs');
      const path = require('path');
      const root = cfg.modRequest.projectRoot;
      const src = path.join(root, 'assets', 'icon.png');
      const dstDir = path.join(root, 'targets', 'share-extension', 'Assets.xcassets', 'RecallAppIcon.imageset');
      const dst = path.join(dstDir, 'icon.png');
      if (!fs.existsSync(dstDir)) {
        fs.mkdirSync(dstDir, { recursive: true });
      }
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
        console.log('[withShareExtensionIcon] Copied assets/icon.png → RecallAppIcon.imageset/icon.png');
      } else {
        console.warn('[withShareExtensionIcon] Source icon not found at:', src);
      }
      return cfg;
    },
  ]);
};

const withShareExtensionSupabaseConfig = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const fs = require('fs');
      const path = require('path');

      const supabaseUrl = cfg.extra?.supabaseUrl ?? cfg.expo?.extra?.supabaseUrl ?? '';
      const supabaseAnonKey = cfg.extra?.supabaseAnonKey ?? cfg.expo?.extra?.supabaseAnonKey ?? '';

      if (!supabaseUrl || !supabaseAnonKey) {
        console.warn('[withShareExtensionSupabaseConfig] supabaseUrl or supabaseAnonKey missing from app.json extra — skipping');
        return cfg;
      }

      const plistPath = path.join(cfg.modRequest.platformProjectRoot, '..', 'targets', 'share-extension', 'Info.plist');

      const minimalPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
</dict>
</plist>
`;

      let plistContent;
      if (!fs.existsSync(plistPath)) {
        console.log('[withShareExtensionSupabaseConfig] Info.plist not found — creating minimal plist at:', plistPath);
        fs.mkdirSync(path.dirname(plistPath), { recursive: true });
        plistContent = minimalPlist;
      } else {
        plistContent = fs.readFileSync(plistPath, 'utf8');
      }

      // Idempotency: skip if keys already present
      if (plistContent.includes('<key>SupabaseURL</key>') && plistContent.includes('<key>SupabaseAnonKey</key>')) {
        console.log('[withShareExtensionSupabaseConfig] Keys already present — skipping');
        return cfg;
      }

      const injection = `\t<key>SupabaseURL</key>\n\t<string>${supabaseUrl}</string>\n\t<key>SupabaseAnonKey</key>\n\t<string>${supabaseAnonKey}</string>\n`;

      // Insert before the closing </dict>
      const lastDictClose = plistContent.lastIndexOf('</dict>');
      if (lastDictClose === -1) {
        console.warn('[withShareExtensionSupabaseConfig] Could not find </dict> in Info.plist — skipping');
        return cfg;
      }

      plistContent = plistContent.slice(0, lastDictClose) + injection + plistContent.slice(lastDictClose);
      fs.writeFileSync(plistPath, plistContent, 'utf8');
      console.log('[withShareExtensionSupabaseConfig] Injected SupabaseURL and SupabaseAnonKey into', plistPath);

      return cfg;
    },
  ]);
};

const withRecallConfig = (config) => {
  config = withFollyNoCoroutines(config);
  config = withStripDebugConfigFlag(config);
  config = withScopeIconToAppTarget(config);
  config = withAppIntents(config);
  config = withShareExtensionIcon(config);
  config = withShareExtensionSupabaseConfig(config);
  return config;
};

module.exports = createRunOncePlugin(withRecallConfig, 'withRecallConfig', '1.0.0');
