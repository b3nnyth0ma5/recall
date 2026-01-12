
/**
 * Share Extension Module
 * 
 * Handles reading shared data from the iOS Share Extension via App Group container
 * and Android intent data.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { SharedData } from '@/types/ShareExtension';

const APP_GROUP_ID = 'group.com.anonymous.Natively';
const SHARED_DATA_FILE = 'shared-data.json';

/**
 * Get the shared container URL for iOS
 */
export function getSharedContainerURL(): string | null {
  if (Platform.OS !== 'ios') {
    return null;
  }

  // On iOS, the shared container is at a specific path
  // This is a simplified version - in production, you'd use a native module
  // For now, we'll use FileSystem.documentDirectory as a fallback
  return FileSystem.documentDirectory;
}

/**
 * Get shared data from the Share Extension
 */
export async function getSharedData(): Promise<SharedData | null> {
  try {
    console.log('[ShareExtensionModule] Getting shared data...');

    if (Platform.OS === 'ios') {
      const containerURL = getSharedContainerURL();
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
      const containerURL = getSharedContainerURL();
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
        // Check if source file exists
        const fileInfo = await FileSystem.getInfoAsync(imagePath);
        if (!fileInfo.exists) {
          console.warn('[ShareExtensionModule] Image file not found:', imagePath);
          continue;
        }

        // Generate a unique filename
        const fileName = `shared-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const destPath = `${FileSystem.documentDirectory}${fileName}`;

        // Copy the file
        await FileSystem.copyAsync({
          from: imagePath,
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

    const containerURL = getSharedContainerURL();
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
