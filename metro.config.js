
const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Use turborepo to restore the cache when possible
config.cacheStores = [
  new FileStore({ root: path.join(__dirname, 'node_modules', '.cache', 'metro') }),
];

// Improve web support
config.resolver = {
  ...config.resolver,
  sourceExts: [...(config.resolver?.sourceExts || []), 'tsx', 'ts', 'jsx', 'js', 'json'],
  assetExts: config.resolver?.assetExts?.filter(ext => ext !== 'svg') || [],
};

// Disable service worker for web
if (process.env.EXPO_PUBLIC_PLATFORM === 'web') {
  config.transformer = {
    ...config.transformer,
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  };
}

module.exports = config;
