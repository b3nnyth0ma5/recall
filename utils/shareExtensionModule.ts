
/**
 * Share Extension Module
 * 
 * TypeScript wrapper for accessing shared data from the iOS Share Extension
 * Built using @bacons/apple-targets
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const APP_GROUP_ID = 'group.com.anonymous.Natively';

// Shared data structure
export interface SharedData {
  text?: string;
  urls?: string[];
  images?: string[];
  videos?: string[];
  files?: string[];
  timestamp?: number;
}

/**
 * Get the shared container path for the App Group
 */
export function getSharedContainerPath(): string | null {
  if (Platform.OS !== 'ios') {
    return null;
  }

  try {
    // Construct the App Group container path
    const containerPath = FileSystem.documentDirectory?.replace(
      /\/Documents\/$/,
      `/../../../Shared/AppGroup/${APP_GROUP_ID}/`
    );

    return containerPath || null;
  } catch (error) {
    console.error('[ShareExtensionModule] Error getting container path:', error);
    return null;
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
    const containerPath = getSharedContainerPath();
    if (!containerPath) {
      console.log('[ShareExtensionModule] Could not get container path');
      return null;
    }

    const sharedDataPath = `${containerPath}shared_data.json`;

    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(sharedDataPath);
    if (!fileInfo.exists) {
      console.log('[ShareExtensionModule] No shared data file found');
      return null;
    }

    // Read and parse the file
    const content = await FileSystem.readAsStringAsync(sharedDataPath);
    const data = JSON.parse(content) as SharedData;

    console.log('[ShareExtensionModule] Retrieved shared data:', data);
    return data;
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
    const containerPath = getSharedContainerPath();
    if (!containerPath) {
      return false;
    }

    const sharedDataPath = `${containerPath}shared_data.json`;

    // Delete shared data file
    try {
      await FileSystem.deleteAsync(sharedDataPath, { idempotent: true });
      console.log('[ShareExtensionModule] Deleted shared data file');
    } catch (error) {
      console.log('[ShareExtensionModule] Could not delete shared data file:', error);
    }

    // Delete shared directories
    const directories = ['shared_images', 'shared_videos', 'shared_pdfs'];
    for (const dir of directories) {
      try {
        const dirPath = `${containerPath}${dir}/`;
        const dirInfo = await FileSystem.getInfoAsync(dirPath);
        if (dirInfo.exists) {
          await FileSystem.deleteAsync(dirPath, { idempotent: true });
          console.log('[ShareExtensionModule] Deleted directory:', dir);
        }
      } catch (error) {
        console.log('[ShareExtensionModule] Could not delete directory:', dir, error);
      }
    }

    console.log('[ShareExtensionModule] Cleared shared data');
    return true;
  } catch (error) {
    console.error('[ShareExtensionModule] Error clearing shared data:', error);
    return false;
  }
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

/**
 * Get the shared container URL
 * 
 * @returns string | null The path to the shared container, or null if not available
 */
export function getSharedContainerURL(): string | null {
  return getSharedContainerPath();
}
