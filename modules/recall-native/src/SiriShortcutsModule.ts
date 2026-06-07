import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

let _module: any = null;
let _moduleLoadAttempted = false;

function getNativeModule() {
  if (_moduleLoadAttempted) return _module;
  _moduleLoadAttempted = true;
  try {
    _module = requireNativeModule('SiriShortcutsModule');
    console.log('[SiriShortcutsModule] requireNativeModule succeeded — module loaded');
  } catch (e: any) {
    _module = null;
    console.warn('[SiriShortcutsModule] requireNativeModule FAILED:', String(e));
  }
  return _module;
}

/**
 * Donate a search activity to Siri so it can be suggested as a Shortcut.
 * No-op on Android or if the module is unavailable.
 */
export async function donateSearch(query: string): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const mod = getNativeModule();
  if (!mod) return;
  try {
    console.log('[SiriShortcuts] Donating search activity for query:', query);
    await mod.donateSearch(query);
  } catch (error) {
    console.warn('[SiriShortcuts] Failed to donate search:', error);
  }
}
