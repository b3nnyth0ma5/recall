import { NativeModules, Platform } from 'react-native';

const { AppGroupModule } = NativeModules;

/**
 * Get the real App Group container path on iOS.
 * Returns null on Android or if the module is unavailable.
 */
export async function getAppGroupContainerPath(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  if (!AppGroupModule) return null;
  try {
    return await AppGroupModule.getContainerPath('group.com.b3nny1nc.recall');
  } catch {
    return null;
  }
}
