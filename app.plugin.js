
const { createRunOncePlugin } = require('@expo/config-plugins');

/**
 * Expo Config Plugin for Recall App
 * 
 * This plugin can be used to add custom native configurations if needed in the future.
 */

const withRecallConfig = (config) => {
  console.log('[Config Plugin] Recall app configuration loaded');
  
  // No custom configurations at this time
  // This plugin is kept as a placeholder for future native configurations
  
  return config;
};

module.exports = createRunOncePlugin(withRecallConfig, 'withRecallConfig', '1.0.0');
