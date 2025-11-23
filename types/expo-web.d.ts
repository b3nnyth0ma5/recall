
/**
 * TypeScript declarations for Expo web-specific globals
 */

interface ExpoUpdatesModule {
  checkForUpdateAsync?: () => Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync?: () => Promise<{ isNew: boolean }>;
  reloadAsync?: () => Promise<void>;
}

interface ExpoModules {
  ExpoUpdates?: ExpoUpdatesModule;
}

interface ExpoGlobal {
  modules?: ExpoModules;
}

declare global {
  interface Window {
    expo?: ExpoGlobal;
  }
}

export {};
