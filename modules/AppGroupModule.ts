import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

let _module: any = null;

function getNativeModule() {
  if (_module) return _module;
  try {
    _module = requireNativeModule('AppGroupModule');
  } catch {
    _module = null;
  }
  return _module;
}

/**
 * Get the real App Group container path on iOS.
 * Returns null on Android or if the module is unavailable.
 */
export async function getAppGroupContainerPath(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  const mod = getNativeModule();
  if (!mod) return null;
  try {
    return await mod.getContainerPath('group.com.b3nny1nc.recall');
  } catch {
    return null;
  }
}
