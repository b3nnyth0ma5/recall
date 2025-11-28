
/**
 * Share Extension Module
 * 
 * TypeScript wrapper for the native ShareExtensionModule
 * Provides methods to retrieve and clear shared data from the iOS Share Extension
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// Define the native module interface
interface ShareExtensionModuleNative {
  getSharedData(): Promise<SharedData>;
  clearSharedData(): Promise<boolean>;
  getSharedContainerURL(): string | null;
}

// Shared data structure
export interface SharedData {
  text?: string;
  urls?: string[];
  images?: string[];
  videos?: string[];
  files?: string[];
  timestamp?: number;
}

// Try to import the native module
let nativeModule: ShareExtensionModuleNative | null = null;

if (Platform.OS === 'ios') {
  try {
    // In a real implementation, this would use expo-modules-core
    // For now, we'll provide a fallback implementation
    // nativeModule = require('expo-modules-core').requireNativeModule('ShareExtensionModule');
    console.log('[ShareExtensionModule] Native module not available, using fallback');
  } catch (error) {
    console.log('[ShareExtensionModule] Failed to load native module:', error);
  }
}

/**
 * Get shared data from the Share Extension
 * 
 * This method retrieves data that was shared from another app via the Share Extension.
 * The data is stored in the App Group shared container.
 * 
 * @returns Promise<SharedData | null> The shared data, or null if no data is available
 */
export async function getSharedData(): Promise<SharedData | null> {
  if (Platform.OS !== 'ios') {
    console.log('[ShareExtensionModule] Not available on this platform');
    return null;
  }

  try {
    if (nativeModule) {
      // Use native module if available
      const data = await nativeModule.getSharedData();
      console.log('[ShareExtensionModule] Retrieved shared data:', data);
      return data;
    } else {
      // Fallback: Try to read from shared container manually
      return await getSharedDataFallback();
    }
  } catch (error) {
    console.error('[ShareExtensionModule] Error getting shared data:', error);
    return null;
  }
}

/**
 * Clear shared data after processing
 * 
 * This method removes the shared data from the App Group container
 * after it has been processed by the main app.
 * 
 * @returns Promise<boolean> True if successful, false otherwise
 */
export async function clearSharedData(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }

  try {
    if (nativeModule) {
      // Use native module if available
      return await nativeModule.clearSharedData();
    } else {
      // Fallback: Try to clear manually
      return await clearSharedDataFallback();
    }
  } catch (error) {
    console.error('[ShareExtensionModule] Error clearing shared data:', error);
    return false;
  }
}

/**
 * Get the shared container URL
 * 
 * @returns string | null The path to the shared container, or null if not available
 */
export function getSharedContainerURL(): string | null {
  if (Platform.OS !== 'ios') {
    return null;
  }

  if (nativeModule) {
    return nativeModule.getSharedContainerURL();
  }

  // Fallback: Construct the expected path
  // Note: This may not work in all cases
  return FileSystem.documentDirectory + '../../../Shared/AppGroup/group.com.anonymous.Natively/';
}

/**
 * Copy images from shared container to app's document directory
 * 
 * @param imagePaths Array of image paths in the shared container
 * @returns Promise<string[]> Array of copied image paths
 */
export async function copySharedImages(imagePaths: string[]): Promise<string[]> {
  const copiedImages: string[] = [];

  for (const imagePath of imagePaths) {
    try {
      // Check if the image exists
      const fileInfo = await FileSystem.getInfoAsync(imagePath);

      if (fileInfo.exists) {
        // Copy to document directory
        const filename = imagePath.split('/').pop() || `image_${Date.now()}.jpg`;
        const destPath = `${FileSystem.documentDirectory}${filename}`;

        await FileSystem.copyAsync({
          from: imagePath,
          to: destPath,
        });

        copiedImages.push(destPath);
        console.log('[ShareExtensionModule] Copied image to:', destPath);

        // Clean up the shared container file
        try {
          await FileSystem.deleteAsync(imagePath, { idempotent: true });
        } catch (error) {
          console.log('[ShareExtensionModule] Could not delete shared file:', error);
        }
      } else {
        console.log('[ShareExtensionModule] Image file does not exist:', imagePath);
      }
    } catch (error) {
      console.error('[ShareExtensionModule] Error copying shared image:', error);
    }
  }

  return copiedImages;
}

// MARK: - Fallback Implementations

/**
 * Fallback implementation for getting shared data
 * Reads directly from the shared container file system
 */
async function getSharedDataFallback(): Promise<SharedData | null> {
  try {
    const containerPath = getSharedContainerURL();
    if (!containerPath) {
      return null;
    }

    const sharedDataPath = containerPath + 'shared_data.json';

    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(sharedDataPath);
    if (!fileInfo.exists) {
      return null;
    }

    // Read and parse the file
    const content = await FileSystem.readAsStringAsync(sharedDataPath);
    const data = JSON.parse(content) as SharedData;

    console.log('[ShareExtensionModule] Retrieved shared data (fallback):', data);
    return data;
  } catch (error) {
    console.error('[ShareExtensionModule] Error in fallback getSharedData:', error);
    return null;
  }
}

/**
 * Fallback implementation for clearing shared data
 * Deletes files directly from the shared container
 */
async function clearSharedDataFallback(): Promise<boolean> {
  try {
    const containerPath = getSharedContainerURL();
    if (!containerPath) {
      return false;
    }

    const sharedDataPath = containerPath + 'shared_data.json';
    const imagesDirectory = containerPath + 'shared_images';

    // Delete shared data file
    try {
      await FileSystem.deleteAsync(sharedDataPath, { idempotent: true });
    } catch (error) {
      console.log('[ShareExtensionModule] Could not delete shared data file:', error);
    }

    // Delete images directory
    try {
      await FileSystem.deleteAsync(imagesDirectory, { idempotent: true });
    } catch (error) {
      console.log('[ShareExtensionModule] Could not delete images directory:', error);
    }

    console.log('[ShareExtensionModule] Cleared shared data (fallback)');
    return true;
  } catch (error) {
    console.error('[ShareExtensionModule] Error in fallback clearSharedData:', error);
    return false;
  }
}

/**
 * Check if there is pending shared data
 * 
 * @returns Promise<boolean> True if there is pending shared data
 */
export async function hasPendingSharedData(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }

  try {
    const data = await getSharedData();
    return data !== null && (
      !!data.text ||
      (data.urls && data.urls.length > 0) ||
      (data.images && data.images.length > 0) ||
      (data.videos && data.videos.length > 0) ||
      (data.files && data.files.length > 0)
    );
  } catch (error) {
    console.error('[ShareExtensionModule] Error checking for pending data:', error);
    return false;
  }
}
