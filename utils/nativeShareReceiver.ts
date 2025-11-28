
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system/legacy';
import { getSharedData, clearSharedData, copySharedImages, SharedData } from './shareExtensionModule';

export interface ReceivedShareData {
  text?: string;
  images?: string[];
  urls?: string[];
  videos?: string[];
  files?: string[];
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
 * - The Share Extension saves data to the App Group shared container
 * - Data is stored in JSON format in shared_data.json
 * - Images are saved to shared_images/ directory
 * - The Share Extension opens the main app via deep link: natively://share-intent
 * - The main app retrieves the data from the shared container
 */

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
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tiff'];
  const lowerUrl = url.toLowerCase();
  return imageExtensions.some(ext => lowerUrl.endsWith(ext));
}

/**
 * Check if a file is a video based on extension
 */
function isVideoFile(url: string): boolean {
  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];
  const lowerUrl = url.toLowerCase();
  return videoExtensions.some(ext => lowerUrl.endsWith(ext));
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
 * Get shared data from iOS Share Extension
 */
async function getShareExtensionData(): Promise<ReceivedShareData | null> {
  if (Platform.OS !== 'ios') {
    return null;
  }

  try {
    console.log('[NativeShareReceiver] Checking for Share Extension data...');
    
    const sharedData = await getSharedData();
    
    if (!sharedData) {
      console.log('[NativeShareReceiver] No Share Extension data found');
      return null;
    }

    console.log('[NativeShareReceiver] Share Extension data found:', JSON.stringify(sharedData, null, 2));

    const receiveData: ReceivedShareData = {};

    // Process text
    if (sharedData.text) {
      receiveData.text = sharedData.text;
      console.log('[NativeShareReceiver] Processed text:', receiveData.text);
    }

    // Process URLs
    if (sharedData.urls && sharedData.urls.length > 0) {
      receiveData.urls = sharedData.urls;
      console.log('[NativeShareReceiver] Processed URLs:', receiveData.urls);
      
      // Also add first URL as text if no text is present
      if (!receiveData.text) {
        receiveData.text = sharedData.urls[0];
        console.log('[NativeShareReceiver] Using first URL as text:', receiveData.text);
      }
    }

    // Process images - copy from shared container to app directory
    if (sharedData.images && sharedData.images.length > 0) {
      console.log('[NativeShareReceiver] Copying images from shared container:', sharedData.images);
      receiveData.images = await copySharedImages(sharedData.images);
      console.log('[NativeShareReceiver] Copied images:', receiveData.images);
    }

    // Process videos
    if (sharedData.videos && sharedData.videos.length > 0) {
      receiveData.videos = sharedData.videos;
      console.log('[NativeShareReceiver] Processed videos:', receiveData.videos);
    }

    // Process files
    if (sharedData.files && sharedData.files.length > 0) {
      receiveData.files = sharedData.files;
      console.log('[NativeShareReceiver] Processed files:', receiveData.files);
    }

    // Clear the shared data after processing
    console.log('[NativeShareReceiver] Clearing shared data...');
    await clearSharedData();
    console.log('[NativeShareReceiver] Shared data cleared');

    const hasData = Object.keys(receiveData).length > 0;
    console.log('[NativeShareReceiver] Final received data:', hasData ? receiveData : 'none');
    
    return hasData ? receiveData : null;
  } catch (error) {
    console.error('[NativeShareReceiver] Error getting Share Extension data:', error);
    return null;
  }
}

/**
 * Process a received URL and extract share data
 */
export async function processReceivedUrl(url: string): Promise<ReceivedShareData | null> {
  try {
    console.log('[NativeShareReceiver] ========================================');
    console.log('[NativeShareReceiver] Processing received URL:', url);
    console.log('[NativeShareReceiver] Platform:', Platform.OS);
    
    // Parse the URL using expo-linking
    const parsed = Linking.parse(url);
    console.log('[NativeShareReceiver] Parsed URL:', JSON.stringify(parsed, null, 2));
    
    const shareData: ReceivedShareData = {};
    
    // Check if this is our custom share-intent deep link
    if (parsed.hostname === 'share-intent' || parsed.path === 'share-intent') {
      console.log('[NativeShareReceiver] ✓ Detected custom share-intent deep link');
      
      // On iOS, check for Share Extension data FIRST
      if (Platform.OS === 'ios') {
        console.log('[NativeShareReceiver] iOS detected, checking Share Extension data...');
        const extensionData = await getShareExtensionData();
        if (extensionData) {
          console.log('[NativeShareReceiver] ✓ Using Share Extension data:', extensionData);
          console.log('[NativeShareReceiver] ========================================');
          return extensionData;
        } else {
          console.log('[NativeShareReceiver] ✗ No Share Extension data found');
        }
      }
      
      // Extract text from query params
      if (parsed.queryParams?.text) {
        shareData.text = parsed.queryParams.text as string;
        console.log('[NativeShareReceiver] ✓ Extracted text from params:', shareData.text);
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
          console.log('[NativeShareReceiver] ✓ Extracted URLs from params:', shareData.urls);
        } catch (error) {
          console.error('[NativeShareReceiver] ✗ Error parsing URLs:', error);
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
          
          shareData.images = imagePaths;
          console.log('[NativeShareReceiver] ✓ Extracted images from params:', shareData.images);
        } catch (error) {
          console.error('[NativeShareReceiver] ✗ Error parsing images:', error);
        }
      }
      
      // Extract videos
      if (parsed.queryParams?.videos) {
        try {
          const videosParam = parsed.queryParams.videos;
          if (typeof videosParam === 'string') {
            shareData.videos = JSON.parse(videosParam);
          } else if (Array.isArray(videosParam)) {
            shareData.videos = videosParam;
          }
          console.log('[NativeShareReceiver] ✓ Extracted videos from params:', shareData.videos);
        } catch (error) {
          console.error('[NativeShareReceiver] ✗ Error parsing videos:', error);
        }
      }
      
      const hasData = Object.keys(shareData).length > 0;
      console.log('[NativeShareReceiver] Final share data:', hasData ? shareData : 'none');
      console.log('[NativeShareReceiver] ========================================');
      return hasData ? shareData : null;
    }
    
    // Handle iOS file URLs (file://)
    if (Platform.OS === 'ios' && isFileUrl(url)) {
      console.log('[NativeShareReceiver] ✓ Detected iOS file URL');
      
      try {
        const fileInfo = await FileSystem.getInfoAsync(url);
        console.log('[NativeShareReceiver] File info:', fileInfo);
        
        if (fileInfo.exists) {
          if (isImageFile(url)) {
            shareData.images = [url];
            console.log('[NativeShareReceiver] ✓ Added image:', url);
          } else if (isVideoFile(url)) {
            shareData.videos = [url];
            console.log('[NativeShareReceiver] ✓ Added video:', url);
          } else {
            // Try to read as text
            try {
              const content = await FileSystem.readAsStringAsync(url);
              shareData.text = content;
              console.log('[NativeShareReceiver] ✓ Read text content');
            } catch (error) {
              console.error('[NativeShareReceiver] ✗ Error reading file as text:', error);
              // Add as file
              shareData.files = [url];
            }
          }
        }
      } catch (error) {
        console.error('[NativeShareReceiver] ✗ Error processing iOS file URL:', error);
      }
      
      const hasData = Object.keys(shareData).length > 0;
      console.log('[NativeShareReceiver] ========================================');
      return hasData ? shareData : null;
    }
    
    // Handle Android content URIs (content://)
    if (Platform.OS === 'android' && url.startsWith('content://')) {
      console.log('[NativeShareReceiver] ✓ Detected Android content URI');
      
      try {
        // Copy the file to cache so we can access it
        const cachedUri = await copyFileToCache(url);
        
        if (cachedUri) {
          if (isImageFile(cachedUri)) {
            shareData.images = [cachedUri];
            console.log('[NativeShareReceiver] ✓ Added image from content URI');
          } else if (isVideoFile(cachedUri)) {
            shareData.videos = [cachedUri];
            console.log('[NativeShareReceiver] ✓ Added video from content URI');
          } else {
            // Try to read as text
            try {
              const content = await FileSystem.readAsStringAsync(cachedUri);
              shareData.text = content;
              console.log('[NativeShareReceiver] ✓ Read text content from content URI');
            } catch (error) {
              console.error('[NativeShareReceiver] ✗ Error reading content URI as text:', error);
              // Add as file
              shareData.files = [cachedUri];
            }
          }
        }
      } catch (error) {
        console.error('[NativeShareReceiver] ✗ Error processing Android content URI:', error);
      }
      
      const hasData = Object.keys(shareData).length > 0;
      console.log('[NativeShareReceiver] ========================================');
      return hasData ? shareData : null;
    }
    
    // Handle HTTP URLs
    if (isHttpUrl(url)) {
      console.log('[NativeShareReceiver] ✓ Detected HTTP URL');
      
      // Check if it's an image URL
      if (isImageFile(url)) {
        shareData.images = [url];
        console.log('[NativeShareReceiver] ✓ Added image URL');
      } else if (isVideoFile(url)) {
        shareData.videos = [url];
        console.log('[NativeShareReceiver] ✓ Added video URL');
      } else {
        // Treat as a shared URL
        shareData.urls = [url];
        shareData.text = url; // Also add as text for convenience
        console.log('[NativeShareReceiver] ✓ Added URL as text');
      }
      
      console.log('[NativeShareReceiver] ========================================');
      return shareData;
    }
    
    // If we get here, we couldn't process the URL
    console.log('[NativeShareReceiver] ✗ Could not process URL - unknown format');
    console.log('[NativeShareReceiver] ========================================');
    return null;
  } catch (error) {
    console.error('[NativeShareReceiver] ✗ Error processing received URL:', error);
    console.log('[NativeShareReceiver] ========================================');
    return null;
  }
}

/**
 * Get the initial share data when the app is launched via share intent
 */
export async function getInitialShareData(): Promise<ReceivedShareData | null> {
  try {
    console.log('[NativeShareReceiver] ========================================');
    console.log('[NativeShareReceiver] Checking for initial share data...');
    console.log('[NativeShareReceiver] Platform:', Platform.OS);
    
    // On iOS, first check for Share Extension data
    if (Platform.OS === 'ios') {
      console.log('[NativeShareReceiver] iOS detected, checking Share Extension data first...');
      const extensionData = await getShareExtensionData();
      if (extensionData) {
        console.log('[NativeShareReceiver] ✓ Found Share Extension data on launch:', extensionData);
        console.log('[NativeShareReceiver] ========================================');
        return extensionData;
      } else {
        console.log('[NativeShareReceiver] No Share Extension data found');
      }
    }
    
    // Check for deep link
    const initialUrl = await Linking.getInitialURL();
    
    if (!initialUrl) {
      console.log('[NativeShareReceiver] No initial URL found');
      console.log('[NativeShareReceiver] ========================================');
      return null;
    }
    
    console.log('[NativeShareReceiver] Initial URL found:', initialUrl);
    const result = await processReceivedUrl(initialUrl);
    console.log('[NativeShareReceiver] ========================================');
    return result;
  } catch (error) {
    console.error('[NativeShareReceiver] ✗ Error getting initial share data:', error);
    console.log('[NativeShareReceiver] ========================================');
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
    console.log('[NativeShareReceiver] ========================================');
    console.log('[NativeShareReceiver] Received URL event:', event.url);
    
    const shareData = await processReceivedUrl(event.url);
    
    if (shareData) {
      console.log('[NativeShareReceiver] ✓ Calling callback with share data:', shareData);
      callback(shareData);
    } else {
      console.log('[NativeShareReceiver] ✗ No share data extracted from URL');
    }
    console.log('[NativeShareReceiver] ========================================');
  });
  
  return () => {
    console.log('[NativeShareReceiver] Removing share intent listener');
    subscription.remove();
  };
}

/**
 * Create a test share intent URL for development
 */
export function createTestShareUrl(
  text?: string,
  images?: string[],
  urls?: string[],
  videos?: string[]
): string {
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
  
  if (videos && videos.length > 0) {
    params.videos = JSON.stringify(videos);
  }
  
  return Linking.createURL('share-intent', {
    queryParams: params,
  });
}
