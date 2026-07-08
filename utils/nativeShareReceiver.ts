
/**
 * Native Share Receiver
 * 
 * Unified interface for receiving share intents from both iOS and Android
 */

import { Platform, Linking } from 'react-native'; // Linking kept for listenForShareIntents deep link listener
import type { ReceivedShareData, ShareIntentCallback, ShareIntentCleanup } from '@/types/ShareExtension';
import { getSharedData, clearSharedData, copySharedImages } from './shareExtensionModule';

let shareIntentListeners: ShareIntentCallback[] = [];
let linkingListener: any = null;
let isProcessingShare = false;
let readLock: Promise<void> | null = null;

/**
 * Extract URLs from text content
 */
function extractURLsFromText(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches || [];
}

/**
 * Process shared data and notify listeners
 */
async function processSharedData(data: ReceivedShareData) {
  if (isProcessingShare) {
    console.log('[NativeShareReceiver] Already processing a share, skipping...');
    return;
  }

  isProcessingShare = true;

  try {
    console.log('[NativeShareReceiver] Processing shared data:', {
      hasText: !!data.text,
      urlCount: data.urls?.length || 0,
      imageCount: data.images?.length || 0,
    });

    // Notify all listeners
    shareIntentListeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error('[NativeShareReceiver] Error in listener:', error);
      }
    });
  } finally {
    isProcessingShare = false;
  }
}

/**
 * Check for shared data from iOS Share Extension
 */
async function checkForIOSSharedData() {
  if (readLock) {
    console.log('[NativeShareReceiver] Read lock active, waiting for concurrent read to finish...');
    await readLock;
    return; // data was already consumed by the concurrent call
  }

  let resolve!: () => void;
  readLock = new Promise(r => { resolve = r; });

  try {
    console.log('[NativeShareReceiver] Checking for iOS shared data...');

    const sharedData = await getSharedData();
    if (!sharedData) {
      console.log('[NativeShareReceiver] No shared data found');
      return;
    }

    // Respect already_saved flag — share extension already persisted this recall
    if (sharedData.already_saved === true) {
      console.log('[NativeShareReceiver] already_saved=true — share extension already saved this recall, clearing and skipping');
      await clearSharedData();
      return;
    }

    console.log('[NativeShareReceiver] Found shared data:', {
      hasText: !!sharedData.text,
      urlCount: sharedData.urls?.length || 0,
      imageCount: sharedData.images?.length || 0,
    });

    // Copy images from shared container
    let copiedImages: string[] = [];
    if (sharedData.images && sharedData.images.length > 0) {
      console.log('[NativeShareReceiver] Copying shared images...');
      copiedImages = await copySharedImages(sharedData.images);
      console.log('[NativeShareReceiver] Copied', copiedImages.length, 'images');
    }

    // Extract URLs from text if present
    let extractedUrls: string[] = [];
    if (sharedData.text) {
      extractedUrls = extractURLsFromText(sharedData.text);
      if (extractedUrls.length > 0) {
        console.log('[NativeShareReceiver] Extracted', extractedUrls.length, 'URLs from text');
      }
    }

    // Combine URLs
    const allUrls = [...(sharedData.urls || []), ...extractedUrls];

    // Process the data
    await processSharedData({
      text: sharedData.text,
      images: copiedImages,
      urls: allUrls.length > 0 ? allUrls : undefined,
      videos: sharedData.videos,
      files: sharedData.files,
    });

    // Clear shared data
    await clearSharedData();
    console.log('[NativeShareReceiver] Shared data cleared');
  } catch (error) {
    console.error('[NativeShareReceiver] Error checking for iOS shared data:', error);
  } finally {
    readLock = null;
    resolve();
  }
}

/**
 * Handle deep link URL
 */
async function handleDeepLink(url: string) {
  console.log('[NativeShareReceiver] Handling deep link:', url);

  // Check if this is a share intent deep link
  if (url.includes('share-intent') || url.includes('share')) {
    console.log('[NativeShareReceiver] Share intent deep link detected');

    if (Platform.OS === 'ios') {
      // Check for shared data from iOS Share Extension
      await checkForIOSSharedData();
    } else if (Platform.OS === 'android') {
      // Android intent data would be handled here
      console.log('[NativeShareReceiver] Android share intent handling not yet implemented');
    }
  }
}

/**
 * Get initial share data when app launches.
 * Reads the App Group container directly — no URL check needed because
 * +native-intent.tsx intercepts the deep link before getInitialURL() can see it.
 */
export async function getInitialShareData(): Promise<ReceivedShareData | null> {
  if (readLock) {
    console.log('[NativeShareReceiver] Read lock active, waiting before reading initial share data...');
    await readLock;
  }

  try {
    console.log('[NativeShareReceiver] Getting initial share data...');

    if (Platform.OS !== 'ios') {
      console.log('[NativeShareReceiver] Non-iOS platform, skipping App Group read');
      return null;
    }

    const sharedData = await getSharedData();
    if (!sharedData) {
      console.log('[NativeShareReceiver] No shared data found in App Group container');
      return null;
    }

    // Respect already_saved flag — share extension already persisted this recall
    if (sharedData.already_saved === true) {
      console.log('[NativeShareReceiver] already_saved=true — share extension already saved this recall, clearing and skipping');
      await clearSharedData();
      return null;
    }

    console.log('[NativeShareReceiver] Found shared data in App Group:', {
      hasText: !!sharedData.text,
      urlCount: sharedData.urls?.length || 0,
      imageCount: sharedData.images?.length || 0,
    });

    // Copy images from shared container
    let copiedImages: string[] = [];
    if (sharedData.images && sharedData.images.length > 0) {
      console.log('[NativeShareReceiver] Copying', sharedData.images.length, 'shared images...');
      copiedImages = await copySharedImages(sharedData.images);
      console.log('[NativeShareReceiver] Copied', copiedImages.length, 'images');
    }

    // Extract URLs from text
    let extractedUrls: string[] = [];
    if (sharedData.text) {
      extractedUrls = extractURLsFromText(sharedData.text);
      if (extractedUrls.length > 0) {
        console.log('[NativeShareReceiver] Extracted', extractedUrls.length, 'URLs from text');
      }
    }

    const allUrls = [...(sharedData.urls || []), ...extractedUrls];

    await clearSharedData();
    console.log('[NativeShareReceiver] Shared data cleared from App Group');

    return {
      text: sharedData.text,
      images: copiedImages,
      urls: allUrls.length > 0 ? allUrls : undefined,
      videos: sharedData.videos,
      files: sharedData.files,
    };
  } catch (error) {
    console.error('[NativeShareReceiver] Error getting initial share data:', error);
    return null;
  }
}

/**
 * Listen for share intents
 */
export function listenForShareIntents(callback: ShareIntentCallback): ShareIntentCleanup {
  console.log('[NativeShareReceiver] Setting up share intent listener');

  // Add callback to listeners
  shareIntentListeners.push(callback);

  // Set up deep link listener if not already set up
  if (!linkingListener) {
    linkingListener = Linking.addEventListener('url', (event) => {
      console.log('[NativeShareReceiver] Deep link received:', event.url);
      handleDeepLink(event.url);
    });
  }

  // Return cleanup function
  return () => {
    console.log('[NativeShareReceiver] Removing share intent listener');
    const index = shareIntentListeners.indexOf(callback);
    if (index > -1) {
      shareIntentListeners.splice(index, 1);
    }

    // Clean up listeners if no more callbacks
    if (shareIntentListeners.length === 0) {
      if (linkingListener) {
        linkingListener.remove();
        linkingListener = null;
      }
    }
  };
}

/**
 * Check if there is pending share data
 */
export async function hasPendingShareData(): Promise<boolean> {
  try {
    if (Platform.OS === 'ios') {
      const sharedData = await getSharedData();
      return sharedData !== null;
    }
    return false;
  } catch (error) {
    console.error('[NativeShareReceiver] Error checking for pending share data:', error);
    return false;
  }
}
