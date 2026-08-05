// recall-native AppGroupModule
import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

const APP_GROUP_ID = 'group.com.b3nny1nc.recall';

let _module: any = null;
let _moduleLoadAttempted = false;
let _moduleLoadError: string | null = null;

function getNativeModule() {
  if (_moduleLoadAttempted) return _module;
  _moduleLoadAttempted = true;
  try {
    _module = requireNativeModule('AppGroupModule');
    console.log('[AppGroupModule] requireNativeModule succeeded — module loaded');
  } catch (e: any) {
    _module = null;
    _moduleLoadError = String(e);
    console.warn(
      '[AppGroupModule] requireNativeModule FAILED:',
      _moduleLoadError,
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
  moduleLoadError: string | null;
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
      // Use the captured load error if available, fall back to generic message
      error = _moduleLoadError ?? 'Native module AppGroupModule is not available in this build';
    }
  }

  return {
    platform,
    moduleAvailable,
    containerPath,
    error,
    moduleLoadError: _moduleLoadError,
    containerExists: verification?.containerExists ?? null,
    tokenFileExists: verification?.tokenFileExists ?? null,
    tokenFileSize: verification?.tokenFileSize ?? null,
    tokenFileModifiedTimestamp: verification?.tokenFileModifiedTimestamp ?? null,
  };
}

/**
 * Read the last share extension error/success record from the App Group.
 * Written by ShareViewController whenever loadAuthToken() fails or succeeds.
 * Returns null on Android, if the module is unavailable, or if no record exists yet.
 */
export async function readLastShareExtensionError(): Promise<Record<string, any> | null> {
  if (Platform.OS !== 'ios') return null;
  const mod = getNativeModule();
  if (!mod) {
    console.warn('[AppGroupModule] readLastShareExtensionError — native module unavailable');
    return null;
  }
  try {
    const result = await mod.readLastShareExtensionError(APP_GROUP_ID);
    console.log('[AppGroupModule] readLastShareExtensionError result:', JSON.stringify(result));
    return result ?? null;
  } catch (e: any) {
    console.warn('[AppGroupModule] readLastShareExtensionError threw:', String(e));
    return null;
  }
}

/**
 * Delete the last share extension error record from the App Group.
 * Returns true if the file was removed, false otherwise.
 */
export async function clearLastShareExtensionError(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const mod = getNativeModule();
  if (!mod) {
    console.warn('[AppGroupModule] clearLastShareExtensionError — native module unavailable');
    return false;
  }
  try {
    const result = await mod.clearLastShareExtensionError(APP_GROUP_ID);
    console.log('[AppGroupModule] clearLastShareExtensionError result:', result);
    return result ?? false;
  } catch (e: any) {
    console.warn('[AppGroupModule] clearLastShareExtensionError threw:', String(e));
    return false;
  }
}

/**
 * Write the auth token JSON string directly to the App Group container
 * using native FileManager — bypasses expo-file-system's sandbox.
 * Returns true on success.
 */
export async function writeTokenFile(jsonPayload: string): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const mod = getNativeModule();
  if (!mod) {
    console.warn('[AppGroupModule] writeTokenFile — native module unavailable');
    return false;
  }
  try {
    const result = await mod.writeTokenFile(APP_GROUP_ID, jsonPayload);
    console.log('[AppGroupModule] writeTokenFile result:', result);
    return result ?? false;
  } catch (e: any) {
    console.error('[AppGroupModule] writeTokenFile threw:', String(e));
    return false;
  }
}

/**
 * Delete the auth token file from the App Group container using native FileManager.
 * Returns true if the file was removed, false if it didn't exist or on error.
 */
export async function deleteTokenFile(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const mod = getNativeModule();
  if (!mod) {
    console.warn('[AppGroupModule] deleteTokenFile — native module unavailable');
    return false;
  }
  try {
    const result = await mod.deleteTokenFile(APP_GROUP_ID);
    console.log('[AppGroupModule] deleteTokenFile result:', result);
    return result ?? false;
  } catch (e: any) {
    console.error('[AppGroupModule] deleteTokenFile threw:', String(e));
    return false;
  }
}

/**
 * Verify whether a Keychain item exists for the auth token.
 * Returns { present: boolean, dataSize: number } or null if unavailable.
 */
export async function verifyKeychainItem(): Promise<{ present: boolean; dataSize: number } | null> {
  if (Platform.OS !== 'ios') return null;
  const mod = getNativeModule();
  if (!mod) {
    console.warn('[AppGroupModule] verifyKeychainItem — native module unavailable');
    return null;
  }
  try {
    const result = await mod.verifyKeychainItem();
    console.log('[AppGroupModule] verifyKeychainItem result:', JSON.stringify(result));
    return result ?? null;
  } catch (e: any) {
    console.error('[AppGroupModule] verifyKeychainItem threw:', String(e));
    return null;
  }
}
