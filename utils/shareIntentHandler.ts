
import { Platform, NativeModules, NativeEventEmitter } from 'react-native';
import * as Linking from 'expo-linking';

export interface ShareIntentData {
  text?: string;
  images?: string[];
}

/**
 * Parse share intent data from the initial URL or intent
 * This works for both Android (intent filters) and iOS (document types)
 */
export async function getShareIntentData(): Promise<ShareIntentData | null> {
  try {
    if (Platform.OS === 'web') {
      return null;
    }

    // Get the initial URL that opened the app
    const initialUrl = await Linking.getInitialURL();
    console.log('Initial URL for share intent:', initialUrl);

    if (!initialUrl) {
      return null;
    }

    // Parse the URL
    const parsed = Linking.parse(initialUrl);
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
          if (imagesParam.startsWith('http') || imagesParam.startsWith('file://')) {
            images = [imagesParam];
          }
        }
      } else if (Array.isArray(imagesParam)) {
        images = imagesParam;
      }

      return {
        text,
        images,
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting share intent data:', error);
    return null;
  }
}

/**
 * Check if the app was opened with a share intent
 */
export async function hasShareIntent(): Promise<boolean> {
  const data = await getShareIntentData();
  return data !== null;
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
