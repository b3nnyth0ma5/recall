const { createRunOncePlugin, withPodfile } = require('@expo/config-plugins');

/**
 * Expo Config Plugin for Recall App
 *
 * Injects FOLLY_CFG_NO_COROUTINES=1 compiler flag (fixes folly/coro/Coroutine.h build error).
 *
 * Note: AppGroupModule and SiriShortcutsModule are now registered as a proper local Expo Module
 * package under modules/recall-native/ and are picked up automatically by expo-modules-autolinking
 * via the `expo.autolinking.nativeModulesDir` setting in package.json. No manual Xcode injection
 * is needed.
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

const withRecallConfig = (config) => {
  config = withFollyNoCoroutines(config);
  return config;
};

module.exports = createRunOncePlugin(withRecallConfig, 'withRecallConfig', '1.0.0');
