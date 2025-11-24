
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system/legacy';

export interface ShareIntentData {
  text?: string;
  images?: string[];
}

/**
 * Handle share intent from URL
 * This works for both Android (intent filters) and iOS (document types)
 */
export async function handleShareIntent(url: string): Promise<ShareIntentData | null> {
  try {
    if (Platform.OS === 'web') {
      return null;
    }

    console.log('Processing share intent URL:', url);

    // Parse the URL
    const parsed = Linking.parse(url);
    console.log('Parsed URL:', parsed);

    // Check if this is a share intent
    // The format will be: natively://share-intent?text=...&images=...
    if (parsed.hostname === 'share-intent' || parsed.path === 'share-intent') {
      const text = parsed.queryParams?.text as string | undefined;
      const imagesParam = parsed.queryParams?.images;

      let images: string[] = [];
      if (typeof imagesParam === 'string') {
        try {
          images = JSON.parse(imagesParam);
        } catch (error) {
          console.error('Error parsing images:', error);
          if (imagesParam.startsWith('http') || imagesParam.startsWith('file://') || imagesParam.startsWith('content://')) {
            images = [imagesParam];
          }
        }
      } else if (Array.isArray(imagesParam)) {
        images = imagesParam;
      }

      console.log('Share intent data extracted:', { text, images });

      return {
        text,
        images,
      };
    }

    // Handle Android share intents (content:// URIs)
    if (Platform.OS === 'android' && url.startsWith('content://')) {
      console.log('Handling Android content URI:', url);
      
      // For Android, the shared content comes as a content:// URI
      // We need to copy it to a local file
      try {
        const fileInfo = await FileSystem.getInfoAsync(url);
        console.log('File info:', fileInfo);
        
        if (fileInfo.exists) {
          return {
            images: [url],
          };
        }
      } catch (error) {
        console.error('Error reading Android content URI:', error);
      }
    }

    // Handle iOS file URLs
    if (Platform.OS === 'ios' && url.startsWith('file://')) {
      console.log('Handling iOS file URL:', url);
      
      try {
        const fileInfo = await FileSystem.getInfoAsync(url);
        console.log('File info:', fileInfo);
        
        if (fileInfo.exists) {
          // Check if it's an image
          const isImage = url.match(/\.(jpg|jpeg|png|gif|webp|heic)$/i);
          if (isImage) {
            return {
              images: [url],
            };
          }
          
          // Check if it's a text file
          const isText = url.match(/\.(txt|text)$/i);
          if (isText) {
            const content = await FileSystem.readAsStringAsync(url);
            return {
              text: content,
            };
          }
        }
      } catch (error) {
        console.error('Error reading iOS file URL:', error);
      }
    }

    // Handle Android intent format
    if (Platform.OS === 'android' && url.includes('intent://')) {
      const intentData = parseAndroidIntent(url);
      if (intentData) {
        return intentData;
      }
    }

    return null;
  } catch (error) {
    console.error('Error handling share intent:', error);
    return null;
  }
}

/**
 * Check if the app was opened with a share intent
 */
export async function hasShareIntent(): Promise<boolean> {
  try {
    const initialUrl = await Linking.getInitialURL();
    if (!initialUrl) {
      return false;
    }
    
    const data = await handleShareIntent(initialUrl);
    return data !== null;
  } catch (error) {
    console.error('Error checking for share intent:', error);
    return false;
  }
}

/**
 * Create a share intent URL for testing
 */
export function createShareIntentUrl(text?: string, images?: string[]): string {
  const params: Record<string, string> = {};
  
  if (text) {
    params.text = text;
  }
  
  if (images && images.length > 0) {
    params.images = JSON.stringify(images);
  }

  return Linking.createURL('share-intent', {
    queryParams: params,
  });
}

/**
 * Parse Android intent extras
 * Android shares come with EXTRA_TEXT and EXTRA_STREAM
 */
export function parseAndroidIntent(url: string): ShareIntentData | null {
  try {
    // Android intent format: intent://...#Intent;...;end
    if (!url.startsWith('intent://')) {
      return null;
    }

    const intentData: ShareIntentData = {};
    
    // Extract EXTRA_TEXT (shared text)
    const textMatch = url.match(/S\.android\.intent\.extra\.TEXT=([^;]+)/);
    if (textMatch) {
      intentData.text = decodeURIComponent(textMatch[1]);
    }

    // Extract EXTRA_STREAM (shared file URI)
    const streamMatch = url.match(/S\.android\.intent\.extra\.STREAM=([^;]+)/);
    if (streamMatch) {
      const uri = decodeURIComponent(streamMatch[1]);
      intentData.images = [uri];
    }

    // Extract EXTRA_STREAM for multiple files
    const streamsMatch = url.match(/S\.android\.intent\.extra\.STREAM=\[([^\]]+)\]/);
    if (streamsMatch) {
      const uris = streamsMatch[1].split(',').map(uri => decodeURIComponent(uri.trim()));
      intentData.images = uris;
    }

    console.log('Parsed Android intent:', intentData);
    
    return Object.keys(intentData).length > 0 ? intentData : null;
  } catch (error) {
    console.error('Error parsing Android intent:', error);
    return null;
  }
}

/**
 * Get shared content from Android intent
 * This is a helper function to extract shared content from Android intents
 */
export async function getAndroidSharedContent(): Promise<ShareIntentData | null> {
  if (Platform.OS !== 'android') {
    return null;
  }

  try {
    // On Android, we need to check if the app was launched with a share intent
    const initialUrl = await Linking.getInitialURL();
    
    if (!initialUrl) {
      return null;
    }

    console.log('Checking Android initial URL for shared content:', initialUrl);
    
    return await handleShareIntent(initialUrl);
  } catch (error) {
    console.error('Error getting Android shared content:', error);
    return null;
  }
}

/**
 * Get shared content from iOS document
 * This is a helper function to extract shared content from iOS document types
 */
export async function getIOSSharedContent(): Promise<ShareIntentData | null> {
  if (Platform.OS !== 'ios') {
    return null;
  }

  try {
    // On iOS, we need to check if the app was launched with a document
    const initialUrl = await Linking.getInitialURL();
    
    if (!initialUrl) {
      return null;
    }

    console.log('Checking iOS initial URL for shared content:', initialUrl);
    
    return await handleShareIntent(initialUrl);
  } catch (error) {
    console.error('Error getting iOS shared content:', error);
    return null;
  }
}
