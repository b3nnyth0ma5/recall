import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

const APP_GROUP_ID = 'group.com.b3nny1nc.recall';

let _module: any = null;
let _moduleLoadAttempted = false;

function getNativeModule() {
  if (_moduleLoadAttempted) return _module;
  _moduleLoadAttempted = true;
  try {
    _module = requireNativeModule('AppGroupModule');
    console.log('[AppGroupModule] requireNativeModule succeeded — module loaded');
  } catch (e: any) {
    _module = null;
    console.warn(
      '[AppGroupModule] requireNativeModule FAILED:',
      String(e),
      '| isNativeModuleError:',
      e?.code ?? 'no code',
      '| type:',
      Object.prototype.toString.call(e)
    );
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
  if (!mod) {
    console.warn('[AppGroupModule] getAppGroupContainerPath — native module unavailable, returning null');
    return null;
  }
  try {
    const result = await mod.getContainerPath(APP_GROUP_ID);
    console.log('[AppGroupModule] getAppGroupContainerPath result:', result);
    return result;
  } catch (e: any) {
    console.error('[AppGroupModule] getContainerPath threw:', String(e));
    return null;
  }
}

export interface ContainerVerification {
  containerPath: string;
  containerExists: boolean;
  tokenFileExists: boolean;
  tokenFileSize: number;
  tokenFileModifiedTimestamp: number;
}

/**
 * Calls the native verifyContainer function to inspect the App Group directory
 * and the auth-token.json file. Returns null on Android or if unavailable.
 */
export async function verifyAppGroupContainer(): Promise<ContainerVerification | null> {
  if (Platform.OS !== 'ios') return null;
  const mod = getNativeModule();
  if (!mod) {
    console.warn('[AppGroupModule] verifyAppGroupContainer — native module unavailable');
    return null;
  }
  try {
    const result = await mod.verifyContainer(APP_GROUP_ID);
    console.log('[AppGroupModule] verifyContainer result:', JSON.stringify(result));
    return result ?? null;
  } catch (e: any) {
    console.error('[AppGroupModule] verifyContainer threw:', String(e));
    return null;
  }
}

export interface AppGroupDiagnostics {
  platform: string;
  moduleAvailable: boolean;
  containerPath: string | null;
  error: string | null;
  containerExists: boolean | null;
  tokenFileExists: boolean | null;
  tokenFileSize: number | null;
  tokenFileModifiedTimestamp: number | null;
}

/**
 * Run a full diagnostic of the App Group bridge and return a single object
 * suitable for logging. Safe to call from any platform — non-iOS fields will
 * be null.
 */
export async function getDiagnostics(): Promise<AppGroupDiagnostics> {
  const platform = Platform.OS;
  let moduleAvailable = false;
  let containerPath: string | null = null;
  let error: string | null = null;
  let verification: ContainerVerification | null = null;

  if (platform === 'ios') {
    const mod = getNativeModule();
    moduleAvailable = mod !== null;

    if (mod) {
      try {
        containerPath = await mod.getContainerPath(APP_GROUP_ID);
      } catch (e: any) {
        error = `getContainerPath threw: ${String(e)}`;
        console.error('[AppGroupModule] getDiagnostics — getContainerPath error:', error);
      }

      try {
        verification = await mod.verifyContainer(APP_GROUP_ID);
      } catch (e: any) {
        const verifyErr = `verifyContainer threw: ${String(e)}`;
        error = error ? `${error}; ${verifyErr}` : verifyErr;
        console.error('[AppGroupModule] getDiagnostics — verifyContainer error:', verifyErr);
      }
    } else {
      error = 'Native module AppGroupModule is not available in this build';
    }
  }

  return {
    platform,
    moduleAvailable,
    containerPath,
    error,
    containerExists: verification?.containerExists ?? null,
    tokenFileExists: verification?.tokenFileExists ?? null,
    tokenFileSize: verification?.tokenFileSize ?? null,
    tokenFileModifiedTimestamp: verification?.tokenFileModifiedTimestamp ?? null,
  };
}
