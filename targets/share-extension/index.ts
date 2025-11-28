
/**
 * iOS Share Extension Entry Point
 * 
 * This file is the entry point for the iOS Share Extension target.
 * It handles receiving shared content from other apps and passes it to the main app.
 * 
 * Built using @bacons/apple-targets
 */

import { ShareExtension } from '@bacons/apple-targets';
import * as FileSystem from 'expo-file-system/legacy';

const APP_GROUP_ID = 'group.com.anonymous.Natively';
const URL_SCHEME = 'natively';

interface SharedItem {
  type: string;
  value: string;
}

/**
 * Main Share Extension handler
 */
ShareExtension.onShare(async (items: SharedItem[]) => {
  console.log('[ShareExtension] Received items:', items);

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
      console.log('[ShareExtension] Processing item:', item.type, item.value);

      switch (item.type) {
        case 'public.plain-text':
        case 'public.text':
        case 'public.utf8-plain-text':
          // Plain text
          if (!sharedData.text) {
            sharedData.text = item.value;
          }
          break;

        case 'public.url':
        case 'public.file-url':
          // URLs
          if (!sharedData.urls) {
            sharedData.urls = [];
          }
          sharedData.urls.push(item.value);
          
          // Also add as text if no text is present
          if (!sharedData.text) {
            sharedData.text = item.value;
          }
          break;

        case 'public.image':
        case 'public.jpeg':
        case 'public.png':
        case 'public.heic':
        case 'public.heif':
        case 'public.gif':
        case 'public.webp':
        case 'public.tiff':
        case 'public.bmp':
          // Images
          if (!sharedData.images) {
            sharedData.images = [];
          }
          
          // Copy image to shared container
          const imagePath = await copyToSharedContainer(item.value, 'image');
          if (imagePath) {
            sharedData.images.push(imagePath);
          }
          break;

        case 'public.movie':
        case 'public.video':
        case 'public.mpeg-4':
        case 'com.apple.quicktime-movie':
          // Videos
          if (!sharedData.videos) {
            sharedData.videos = [];
          }
          
          // Copy video to shared container
          const videoPath = await copyToSharedContainer(item.value, 'video');
          if (videoPath) {
            sharedData.videos.push(videoPath);
          }
          break;

        case 'com.adobe.pdf':
          // PDFs
          if (!sharedData.files) {
            sharedData.files = [];
          }
          
          // Copy PDF to shared container
          const pdfPath = await copyToSharedContainer(item.value, 'pdf');
          if (pdfPath) {
            sharedData.files.push(pdfPath);
          }
          break;

        default:
          console.log('[ShareExtension] Unsupported type:', item.type);
          break;
      }
    }

    // Save shared data to App Group container
    await saveSharedData(sharedData);

    // Open main app with share-intent deep link
    const deepLink = `${URL_SCHEME}://share-intent`;
    console.log('[ShareExtension] Opening main app:', deepLink);
    
    ShareExtension.openURL(deepLink);
    ShareExtension.completeRequest();
  } catch (error) {
    console.error('[ShareExtension] Error processing share:', error);
    ShareExtension.completeRequest(error as Error);
  }
});

/**
 * Copy a file to the shared App Group container
 */
async function copyToSharedContainer(
  sourceUri: string,
  type: 'image' | 'video' | 'pdf'
): Promise<string | null> {
  try {
    // Get shared container path
    const containerPath = FileSystem.documentDirectory?.replace(
      /\/Documents\/$/,
      `/../../../Shared/AppGroup/${APP_GROUP_ID}/`
    );

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
async function saveSharedData(data: any): Promise<void> {
  try {
    // Get shared container path
    const containerPath = FileSystem.documentDirectory?.replace(
      /\/Documents\/$/,
      `/../../../Shared/AppGroup/${APP_GROUP_ID}/`
    );

    if (!containerPath) {
      console.error('[ShareExtension] Could not determine container path');
      return;
    }

    // Ensure directory exists
    const dirInfo = await FileSystem.getInfoAsync(containerPath);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(containerPath, { intermediates: true });
    }

    // Write data to JSON file
    const dataPath = `${containerPath}shared_data.json`;
    await FileSystem.writeAsStringAsync(dataPath, JSON.stringify(data));

    console.log('[ShareExtension] Saved shared data to:', dataPath);
  } catch (error) {
    console.error('[ShareExtension] Error saving shared data:', error);
  }
}
