import { NativeModules, Platform } from 'react-native';

const { SiriShortcutsModule } = NativeModules;

/**
 * Donate a search activity to Siri so it can be suggested as a Shortcut.
 * No-op on Android or if the module is unavailable.
 */
export async function donateSearch(query: string): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (!SiriShortcutsModule) return;
  try {
    console.log('[SiriShortcuts] Donating search activity for query:', query);
    await SiriShortcutsModule.donateSearch(query);
  } catch (error) {
    console.warn('[SiriShortcuts] Failed to donate search:', error);
  }
}
