
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system/legacy';

export interface ReceivedShareData {
  text?: string;
  images?: string[];
  urls?: string[];
}

/**
 * Native Share Receiver Utility
 * 
 * This utility handles receiving shared content from other apps on both iOS and Android.
 * 
 * IMPORTANT NOTES:
 * - On iOS: Uses Share Extension to receive shared content from the share sheet
 * - On Android: Uses intent filters to receive SEND and SEND_MULTIPLE intents
 * - The app must be built with EAS or expo prebuild for native share to work
 * - Share intents are received as deep links via expo-linking
 * 
 * iOS SHARE EXTENSION:
 * - The Share Extension saves images to the App Group shared container
 * - Images are then copied to the app's document directory for permanent storage
 * - The Share Extension passes data via deep links: natively://share-intent?text=...&images=...
 */

/**
 * Get the shared container path for iOS App Groups
 */
function getSharedContainerPath(): string | null {
  if (Platform.OS !== 'ios') {
    return null;
  }
  
  // This would need to be implemented with a native module
  // For now, we'll construct the expected path
  // In a real implementation, you'd use a native module to get this path
  return FileSystem.documentDirectory + '../../../Shared/AppGroup/group.com.anonymous.Natively/';
}

/**
 * Copy images from shared container to app's document directory
 */
async function copySharedImages(imagePaths: string[]): Promise<string[]> {
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
        console.log('[NativeShareReceiver] Copied image to:', destPath);
        
        // Clean up the shared container file
        try {
          await FileSystem.deleteAsync(imagePath, { idempotent: true });
        } catch (error) {
          console.log('[NativeShareReceiver] Could not delete shared file:', error);
        }
      } else {
        console.log('[NativeShareReceiver] Image file does not exist:', imagePath);
      }
    } catch (error) {
      console.error('[NativeShareReceiver] Error copying shared image:', error);
    }
  }
  
  return copiedImages;
}

/**
 * Check if a URL is a file URL (file://, content://)
 */
function isFileUrl(url: string): boolean {
  return url.startsWith('file://') || url.startsWith('content://');
}

/**
 * Check if a URL is an HTTP URL
 */
function isHttpUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Check if a file is an image based on extension
 */
function isImageFile(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp'];
  const lowerUrl = url.toLowerCase();
  return imageExtensions.some(ext => lowerUrl.endsWith(ext));
}

/**
 * Copy a file from a content:// or file:// URI to the app's cache directory
 * This is necessary for Android content URIs which may not be directly accessible
 */
async function copyFileToCache(sourceUri: string): Promise<string | null> {
  try {
    console.log('[NativeShareReceiver] Copying file to cache:', sourceUri);
    
    // Generate a unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const extension = sourceUri.match(/\.([^./?]+)(\?|$)/)?.[1] || 'jpg';
    const filename = `shared_${timestamp}_${random}.${extension}`;
    const destUri = `${FileSystem.cacheDirectory}${filename}`;
    
    // Copy the file
    await FileSystem.copyAsync({
      from: sourceUri,
      to: destUri,
    });
    
    console.log('[NativeShareReceiver] File copied to:', destUri);
    return destUri;
  } catch (error) {
    console.error('[NativeShareReceiver] Error copying file to cache:', error);
    return null;
  }
}

/**
 * Process a received URL and extract share data
 */
export async function processReceivedUrl(url: string): Promise<ReceivedShareData | null> {
  try {
    console.log('[NativeShareReceiver] Processing received URL:', url);
    
    // Parse the URL using expo-linking
    const parsed = Linking.parse(url);
    console.log('[NativeShareReceiver] Parsed URL:', JSON.stringify(parsed, null, 2));
    
    const shareData: ReceivedShareData = {};
    
    // Check if this is our custom share-intent deep link
    if (parsed.hostname === 'share-intent' || parsed.path === 'share-intent') {
      console.log('[NativeShareReceiver] Detected custom share-intent deep link');
      
      // Extract text
      if (parsed.queryParams?.text) {
        shareData.text = parsed.queryParams.text as string;
        console.log('[NativeShareReceiver] Extracted text:', shareData.text);
      }
      
      // Extract URLs
      if (parsed.queryParams?.urls) {
        try {
          const urlsParam = parsed.queryParams.urls;
          if (typeof urlsParam === 'string') {
            shareData.urls = JSON.parse(urlsParam);
          } else if (Array.isArray(urlsParam)) {
            shareData.urls = urlsParam;
          }
          console.log('[NativeShareReceiver] Extracted URLs:', shareData.urls);
        } catch (error) {
          console.error('[NativeShareReceiver] Error parsing URLs:', error);
        }
      }
      
      // Extract images
      if (parsed.queryParams?.images) {
        try {
          const imagesParam = parsed.queryParams.images;
          let imagePaths: string[] = [];
          
          if (typeof imagesParam === 'string') {
            imagePaths = JSON.parse(imagesParam);
          } else if (Array.isArray(imagesParam)) {
            imagePaths = imagesParam;
          }
          
          console.log('[NativeShareReceiver] Extracted image paths:', imagePaths);
          
          // On iOS, images from Share Extension are in the shared container
          // We need to copy them to the app's document directory
          if (Platform.OS === 'ios' && imagePaths.length > 0) {
            console.log('[NativeShareReceiver] Copying images from shared container...');
            shareData.images = await copySharedImages(imagePaths);
          } else {
            shareData.images = imagePaths;
          }
          
          console.log('[NativeShareReceiver] Final images:', shareData.images);
        } catch (error) {
          console.error('[NativeShareReceiver] Error parsing images:', error);
        }
      }
      
      return Object.keys(shareData).length > 0 ? shareData : null;
    }
    
    // Handle iOS file URLs (file://)
    if (Platform.OS === 'ios' && isFileUrl(url)) {
      console.log('[NativeShareReceiver] Detected iOS file URL');
      
      try {
        const fileInfo = await FileSystem.getInfoAsync(url);
        console.log('[NativeShareReceiver] File info:', fileInfo);
        
        if (fileInfo.exists) {
          if (isImageFile(url)) {
            shareData.images = [url];
            console.log('[NativeShareReceiver] Added image:', url);
          } else {
            // Try to read as text
            try {
              const content = await FileSystem.readAsStringAsync(url);
              shareData.text = content;
              console.log('[NativeShareReceiver] Read text content');
            } catch (error) {
              console.error('[NativeShareReceiver] Error reading file as text:', error);
            }
          }
        }
      } catch (error) {
        console.error('[NativeShareReceiver] Error processing iOS file URL:', error);
      }
      
      return Object.keys(shareData).length > 0 ? shareData : null;
    }
    
    // Handle Android content URIs (content://)
    if (Platform.OS === 'android' && url.startsWith('content://')) {
      console.log('[NativeShareReceiver] Detected Android content URI');
      
      try {
        // Copy the file to cache so we can access it
        const cachedUri = await copyFileToCache(url);
        
        if (cachedUri) {
          if (isImageFile(cachedUri)) {
            shareData.images = [cachedUri];
            console.log('[NativeShareReceiver] Added image from content URI');
          } else {
            // Try to read as text
            try {
              const content = await FileSystem.readAsStringAsync(cachedUri);
              shareData.text = content;
              console.log('[NativeShareReceiver] Read text content from content URI');
            } catch (error) {
              console.error('[NativeShareReceiver] Error reading content URI as text:', error);
            }
          }
        }
      } catch (error) {
        console.error('[NativeShareReceiver] Error processing Android content URI:', error);
      }
      
      return Object.keys(shareData).length > 0 ? shareData : null;
    }
    
    // Handle HTTP URLs
    if (isHttpUrl(url)) {
      console.log('[NativeShareReceiver] Detected HTTP URL');
      
      // Check if it's an image URL
      if (isImageFile(url)) {
        shareData.images = [url];
        console.log('[NativeShareReceiver] Added image URL');
      } else {
        // Treat as a shared URL
        shareData.urls = [url];
        shareData.text = url; // Also add as text for convenience
        console.log('[NativeShareReceiver] Added URL as text');
      }
      
      return shareData;
    }
    
    // If we get here, we couldn't process the URL
    console.log('[NativeShareReceiver] Could not process URL');
    return null;
  } catch (error) {
    console.error('[NativeShareReceiver] Error processing received URL:', error);
    return null;
  }
}

/**
 * Get the initial share data when the app is launched via share intent
 */
export async function getInitialShareData(): Promise<ReceivedShareData | null> {
  try {
    console.log('[NativeShareReceiver] Checking for initial share data...');
    
    const initialUrl = await Linking.getInitialURL();
    
    if (!initialUrl) {
      console.log('[NativeShareReceiver] No initial URL found');
      return null;
    }
    
    console.log('[NativeShareReceiver] Initial URL:', initialUrl);
    return await processReceivedUrl(initialUrl);
  } catch (error) {
    console.error('[NativeShareReceiver] Error getting initial share data:', error);
    return null;
  }
}

/**
 * Listen for share intents while the app is running
 */
export function listenForShareIntents(
  callback: (shareData: ReceivedShareData) => void
): () => void {
  console.log('[NativeShareReceiver] Setting up share intent listener');
  
  const subscription = Linking.addEventListener('url', async (event) => {
    console.log('[NativeShareReceiver] Received URL event:', event.url);
    
    const shareData = await processReceivedUrl(event.url);
    
    if (shareData) {
      console.log('[NativeShareReceiver] Calling callback with share data:', shareData);
      callback(shareData);
    }
  });
  
  return () => {
    console.log('[NativeShareReceiver] Removing share intent listener');
    subscription.remove();
  };
}

/**
 * Create a test share intent URL for development
 */
export function createTestShareUrl(text?: string, images?: string[], urls?: string[]): string {
  const params: Record<string, string> = {};
  
  if (text) {
    params.text = text;
  }
  
  if (images && images.length > 0) {
    params.images = JSON.stringify(images);
  }
  
  if (urls && urls.length > 0) {
    params.urls = JSON.stringify(urls);
  }
  
  return Linking.createURL('share-intent', {
    queryParams: params,
  });
}
