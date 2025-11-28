
/**
 * iOS Share Extension Entry Point
 * 
 * This file is the entry point for the iOS Share Extension target.
 * It handles receiving shared content from other apps and passes it to the main app.
 * 
 * Built using @bacons/apple-targets v3.0.2
 */

import { AppRegistry } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const APP_GROUP_ID = 'group.com.anonymous.Natively';
const URL_SCHEME = 'natively';

interface ShareItem {
  type: string;
  data: string;
}

/**
 * Share Extension Component
 * 
 * This component handles the share extension UI and data processing.
 * It extracts shared content and passes it to the main app via deep linking.
 */
class ShareExtensionHandler {
  private static instance: ShareExtensionHandler;

  private constructor() {
    console.log('[ShareExtension] Initializing Share Extension Handler');
  }

  static getInstance(): ShareExtensionHandler {
    if (!ShareExtensionHandler.instance) {
      ShareExtensionHandler.instance = new ShareExtensionHandler();
    }
    return ShareExtensionHandler.instance;
  }

  /**
   * Process shared items from the extension context
   */
  async processSharedItems(items: ShareItem[]): Promise<void> {
    console.log('[ShareExtension] Processing shared items:', items);

    try {
      const sharedData: {
        text?: string;
        urls?: string[];
        images?: string[];
        videos?: string[];
        files?: string[];
        timestamp: number;
      } = {
        timestamp: Date.now(),
      };

      // Process each shared item
      for (const item of items) {
        console.log('[ShareExtension] Processing item:', item.type, item.data);

        const itemType = item.type.toLowerCase();
        const itemData = item.data;

        // Handle text types
        if (
          itemType.includes('text') ||
          itemType === 'public.plain-text' ||
          itemType === 'public.utf8-plain-text'
        ) {
          if (!sharedData.text) {
            sharedData.text = itemData;
          }
        }
        // Handle URL types
        else if (
          itemType.includes('url') ||
          itemType === 'public.url' ||
          itemType === 'public.file-url'
        ) {
          if (!sharedData.urls) {
            sharedData.urls = [];
          }
          sharedData.urls.push(itemData);

          // Also add as text if no text is present
          if (!sharedData.text) {
            sharedData.text = itemData;
          }
        }
        // Handle image types
        else if (
          itemType.includes('image') ||
          itemType === 'public.image' ||
          itemType === 'public.jpeg' ||
          itemType === 'public.png' ||
          itemType === 'public.heic' ||
          itemType === 'public.heif' ||
          itemType === 'public.gif' ||
          itemType === 'public.webp' ||
          itemType === 'public.tiff' ||
          itemType === 'public.bmp'
        ) {
          if (!sharedData.images) {
            sharedData.images = [];
          }

          // Copy image to shared container
          const imagePath = await this.copyToSharedContainer(itemData, 'image');
          if (imagePath) {
            sharedData.images.push(imagePath);
          }
        }
        // Handle video types
        else if (
          itemType.includes('video') ||
          itemType.includes('movie') ||
          itemType === 'public.movie' ||
          itemType === 'public.video' ||
          itemType === 'public.mpeg-4' ||
          itemType === 'com.apple.quicktime-movie'
        ) {
          if (!sharedData.videos) {
            sharedData.videos = [];
          }

          // Copy video to shared container
          const videoPath = await this.copyToSharedContainer(itemData, 'video');
          if (videoPath) {
            sharedData.videos.push(videoPath);
          }
        }
        // Handle PDF types
        else if (itemType === 'com.adobe.pdf' || itemType.includes('pdf')) {
          if (!sharedData.files) {
            sharedData.files = [];
          }

          // Copy PDF to shared container
          const pdfPath = await this.copyToSharedContainer(itemData, 'pdf');
          if (pdfPath) {
            sharedData.files.push(pdfPath);
          }
        } else {
          console.log('[ShareExtension] Unsupported type:', itemType);
        }
      }

      // Save shared data to App Group container
      await this.saveSharedData(sharedData);

      // Open main app with share-intent deep link
      const deepLink = `${URL_SCHEME}://share-intent`;
      console.log('[ShareExtension] Opening main app:', deepLink);

      // Use native iOS API to open URL
      if (typeof (global as any).webkit !== 'undefined') {
        (global as any).webkit.messageHandlers?.openURL?.postMessage(deepLink);
      }
    } catch (error) {
      console.error('[ShareExtension] Error processing share:', error);
      throw error;
    }
  }

  /**
   * Copy a file to the shared App Group container
   */
  private async copyToSharedContainer(
    sourceUri: string,
    type: 'image' | 'video' | 'pdf'
  ): Promise<string | null> {
    try {
      // Get shared container path
      const containerPath = this.getSharedContainerPath();

      if (!containerPath) {
        console.error('[ShareExtension] Could not determine container path');
        return null;
      }

      // Create directory for this type if it doesn't exist
      const typeDir = `${containerPath}shared_${type}s/`;
      const dirInfo = await FileSystem.getInfoAsync(typeDir);

      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(typeDir, { intermediates: true });
      }

      // Generate unique filename
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const extension = sourceUri.split('.').pop() || type;
      const filename = `${type}_${timestamp}_${random}.${extension}`;
      const destPath = `${typeDir}${filename}`;

      // Copy file
      await FileSystem.copyAsync({
        from: sourceUri,
        to: destPath,
      });

      console.log('[ShareExtension] Copied file to:', destPath);
      return destPath;
    } catch (error) {
      console.error('[ShareExtension] Error copying file:', error);
      return null;
    }
  }

  /**
   * Save shared data to App Group container
   */
  private async saveSharedData(data: any): Promise<void> {
    try {
      // Get shared container path
      const containerPath = this.getSharedContainerPath();

      if (!containerPath) {
        console.error('[ShareExtension] Could not determine container path');
        return;
      }

      // Ensure directory exists
      const dirInfo = await FileSystem.getInfoAsync(containerPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(containerPath, {
          intermediates: true,
        });
      }

      // Write data to JSON file
      const dataPath = `${containerPath}shared_data.json`;
      await FileSystem.writeAsStringAsync(dataPath, JSON.stringify(data));

      console.log('[ShareExtension] Saved shared data to:', dataPath);
    } catch (error) {
      console.error('[ShareExtension] Error saving shared data:', error);
    }
  }

  /**
   * Get the shared container path
   */
  private getSharedContainerPath(): string | null {
    try {
      // Construct the App Group container path
      const containerPath = FileSystem.documentDirectory?.replace(
        /\/Documents\/$/,
        `/../../../Shared/AppGroup/${APP_GROUP_ID}/`
      );

      return containerPath || null;
    } catch (error) {
      console.error('[ShareExtension] Error getting container path:', error);
      return null;
    }
  }
}

// Export the handler instance
export default ShareExtensionHandler.getInstance();

// Register the Share Extension with React Native
// This is required for @bacons/apple-targets to work properly
AppRegistry.registerComponent('ShareExtension', () => {
  // Return a minimal component that handles the share extension lifecycle
  return () => null;
});

console.log('[ShareExtension] Share Extension module loaded');
