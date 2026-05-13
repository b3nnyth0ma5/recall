const { createRunOncePlugin, withPodfile } = require('@expo/config-plugins');

/**
 * Expo Config Plugin for Recall App
 *
 * Injects a post_install hook into the generated Podfile that adds
 * -DFOLLY_CFG_NO_COROUTINES=1 to all pod build configurations.
 *
 * This fixes the iOS build error:
 *   folly/coro/Coroutine.h file not found
 * which occurs with react-native-reanimated + React Native 0.81 because
 * the bundled RCT-Folly headers reference coroutine headers that are not
 * included in the vendored folly distribution.
 */
const withFollyNoCoroutines = (config) => {
  return withPodfile(config, (config) => {
    const contents = config.modResults.contents;

    // Idempotency: skip if already applied
    if (contents.includes('FOLLY_CFG_NO_COROUTINES')) {
      return config;
    }

    const snippet = `
# Fix: folly/coro/Coroutine.h file not found (RN 0.81 + Reanimated)
# The bundled RCT-Folly headers reference coroutine headers not present in
# the vendored folly distribution. This flag disables coroutine support.
post_install do |installer|
  installer.pods_project.build_configurations.each do |config|
    config.build_settings['OTHER_CPLUSPLUSFLAGS'] ||= ['$(OTHER_CFLAGS)']
    config.build_settings['OTHER_CPLUSPLUSFLAGS'] << '-DFOLLY_CFG_NO_COROUTINES=1'
  end
end
`;

    config.modResults.contents = contents + snippet;
    return config;
  });
};

const withRecallConfig = (config) => {
  return withFollyNoCoroutines(config);
};

module.exports = createRunOncePlugin(withRecallConfig, 'withRecallConfig', '1.0.0');
