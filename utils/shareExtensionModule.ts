
/**
 * Share Extension Module
 * 
 * Handles reading shared data from the iOS Share Extension via App Group container
 * and Android intent data.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { SharedData } from '@/types/ShareExtension';

const APP_GROUP_ID = 'group.com.b3nny1nc.recall';
const SHARED_DATA_FILE = 'shared-data.json';

/**
 * Get the shared container URL for iOS (sync stub — always returns null).
 * Use getSharedContainerURLAsync for the real path.
 */
export function getSharedContainerURL(): string | null {
  if (Platform.OS !== 'ios') return null;
  // Returns null synchronously — callers should use getSharedContainerURLAsync instead
  return null;
}

export async function getSharedContainerURLAsync(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    const { getAppGroupContainerPath } = await import('recall-native');
    const path = await getAppGroupContainerPath() as string | null;
    if (path) {
      const normalized = path.startsWith('file://') ? path : `file://${path}`;
      return normalized.endsWith('/') ? normalized : `${normalized}/`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get shared data from the Share Extension
 */
export async function getSharedData(): Promise<SharedData | null> {
  try {
    console.log('[ShareExtensionModule] Getting shared data...');

    if (Platform.OS === 'ios') {
      const containerURL = await getSharedContainerURLAsync();
      console.log('[ShareExtensionModule] Container URL:', containerURL);
      if (!containerURL) {
        console.log('[ShareExtensionModule] No shared container URL available');
        return null;
      }

      const filePath = `${containerURL}${SHARED_DATA_FILE}`;
      console.log('[ShareExtensionModule] Checking for shared data at:', filePath);

      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        console.log('[ShareExtensionModule] No shared data file found');
        return null;
      }

      // Read the file
      const content = await FileSystem.readAsStringAsync(filePath);
      console.log('[ShareExtensionModule] Read shared data:', content.substring(0, 100));

      // Parse JSON
      const data = JSON.parse(content) as SharedData;

      // Normalize bare POSIX paths to file:// URIs (Swift writes fileURL.path without scheme)
      if (data.images) {
        data.images = data.images.map((p: string) => p.startsWith('file://') ? p : `file://${p}`);
      }

      console.log('[ShareExtensionModule] Parsed shared data:', {
        hasText: !!data.text,
        urlCount: data.urls?.length || 0,
        imageCount: data.images?.length || 0,
        videoCount: data.videos?.length || 0,
      });

      return data;
    } else if (Platform.OS === 'android') {
      // Android intent data would be handled differently
      // For now, return null as Android uses a different mechanism
      console.log('[ShareExtensionModule] Android share intents handled separately');
      return null;
    }

    return null;
  } catch (error) {
    console.error('[ShareExtensionModule] Error getting shared data:', error);
    return null;
  }
}

/**
 * Clear shared data after processing
 */
export async function clearSharedData(): Promise<boolean> {
  try {
    console.log('[ShareExtensionModule] Clearing shared data...');

    if (Platform.OS === 'ios') {
      const containerURL = await getSharedContainerURLAsync();
      if (!containerURL) {
        console.log('[ShareExtensionModule] No shared container URL available');
        return false;
      }

      const filePath = `${containerURL}${SHARED_DATA_FILE}`;

      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        console.log('[ShareExtensionModule] No shared data file to clear');
        return true;
      }

      // Delete the file
      await FileSystem.deleteAsync(filePath, { idempotent: true });
      console.log('[ShareExtensionModule] Shared data cleared successfully');

      return true;
    }

    return true;
  } catch (error) {
    console.error('[ShareExtensionModule] Error clearing shared data:', error);
    return false;
  }
}

/**
 * Copy shared images from the shared container to the app's document directory
 */
export async function copySharedImages(imagePaths: string[]): Promise<string[]> {
  try {
    if (!imagePaths || imagePaths.length === 0) {
      return [];
    }

    console.log('[ShareExtensionModule] Copying', imagePaths.length, 'shared images...');

    const copiedPaths: string[] = [];

    for (const imagePath of imagePaths) {
      try {
        // Normalize bare POSIX paths to file:// URIs required by expo-file-system
        const normalizedPath = imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`;

        // Check if source file exists
        const fileInfo = await FileSystem.getInfoAsync(normalizedPath);
        if (!fileInfo.exists) {
          console.warn('[ShareExtensionModule] Image file not found:', normalizedPath);
          continue;
        }

        // Generate a unique filename
        const fileName = `shared-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const destPath = `${FileSystem.documentDirectory}${fileName}`;

        // Copy the file
        await FileSystem.copyAsync({
          from: normalizedPath,
          to: destPath,
        });

        console.log('[ShareExtensionModule] Copied image to:', destPath);
        copiedPaths.push(destPath);
      } catch (error) {
        console.error('[ShareExtensionModule] Error copying image:', imagePath, error);
      }
    }

    console.log('[ShareExtensionModule] Successfully copied', copiedPaths.length, 'images');
    return copiedPaths;
  } catch (error) {
    console.error('[ShareExtensionModule] Error in copySharedImages:', error);
    return [];
  }
}

/**
 * Get the status of the Share Extension
 */
export async function getShareExtensionStatus(): Promise<{
  available: boolean;
  hasPendingData: boolean;
  containerPath?: string;
}> {
  try {
    if (Platform.OS !== 'ios') {
      return {
        available: false,
        hasPendingData: false,
      };
    }

    const containerURL = await getSharedContainerURLAsync();
    if (!containerURL) {
      return {
        available: false,
        hasPendingData: false,
      };
    }

    const filePath = `${containerURL}${SHARED_DATA_FILE}`;
    const fileInfo = await FileSystem.getInfoAsync(filePath);

    return {
      available: true,
      hasPendingData: fileInfo.exists,
      containerPath: containerURL,
    };
  } catch (error) {
    console.error('[ShareExtensionModule] Error getting status:', error);
    return {
      available: false,
      hasPendingData: false,
    };
  }
}
