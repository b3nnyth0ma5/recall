
import { Platform, Share as RNShare } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import Toast from 'react-native-toast-message';
import { Note } from '@/types/Note';
import { supabase } from '@/utils/supabase';

// Conditionally import react-native-share only for native platforms
// eslint-disable-next-line @typescript-eslint/no-require-imports
let Share: any = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Share = require('react-native-share').default;
  } catch (error) {
    console.warn('react-native-share not available, falling back to React Native Share API');
  }
}

/**
 * Determine a safe file extension from a URL by parsing the pathname only
 * (ignoring query string) and matching common image formats. Defaults to 'jpg'.
 */
function getImageExtensionFromUrl(url: string): 'jpg' | 'jpeg' | 'png' | 'webp' | 'heic' | 'gif' {
  try {
    // Strip query string and fragment, then take the segment after the last '.'
    const pathname = url.split('?')[0].split('#')[0];
    const ext = (pathname.split('.').pop() || '').toLowerCase();
    if (ext === 'png' || ext === 'webp' || ext === 'heic' || ext === 'gif' || ext === 'jpeg') {
      return ext;
    }
    return 'jpg';
  } catch {
    return 'jpg';
  }
}

export interface SharedRecallData {
  text: string;
  images: string[]; // CDN URLs
  primaryImageIndex: number;
  location?: string;
  latitude?: number;
  longitude?: number;
  location_primary_type?: string;
  created_at: string;
}

/**
 * Share a recall using react-native-share library
 * Includes text, location, and all images as actual files in a single share prompt
 * @param recall - The note/recall to share
 * @param currentImageIndex - The index of the image currently being viewed (becomes primary)
 */
export async function shareRecall(recall: Note, currentImageIndex: number = 0, options?: { includeLocation?: boolean }): Promise<void> {
  const includeLocation = options?.includeLocation !== false;
  try {
    console.log('User tapped Share button for recall:', recall.id);
    console.log('Current image index:', currentImageIndex);
    console.log('Total images:', recall.images?.length || 0);

    // Build comprehensive share message with recall text, location, and image info
    let shareMessage = '';

    // Strip URLs from recall.text so they don't appear inline at the message head —
    // iOS Messages aggressively globs trailing content into a leading URL otherwise,
    // making the link unclickable and corrupting the rest of the message body.
    // The extracted URL(s) are placed below on a labeled line.
    const urlRegex = /https?:\/\/\S+/g;
    const extractedUrls = recall.text?.match(urlRegex) ?? [];
    const textWithoutUrls = (recall.text ?? '')
      .replace(urlRegex, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Recall body text (URLs removed)
    if (textWithoutUrls) {
      shareMessage += `${textWithoutUrls}\n\n`;
    }

    // Extracted URL(s) on a labeled line so iOS Messages parses each as its own link
    if (extractedUrls.length > 0) {
      shareMessage += '🔗 ';
      for (const url of extractedUrls) {
        shareMessage += `${url}\n`;
      }
      shareMessage += '\n';
    }

    // Location with Google Maps link on its own labeled line
    if (recall.location && includeLocation) {
      shareMessage += `📍 ${recall.location}\n`;
      if (recall.latitude && recall.longitude) {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${recall.latitude},${recall.longitude}`;
        shareMessage += `🗺️ ${mapsUrl}\n`;
      }
      shareMessage += '\n';
    }

    // Footer — shown on every share, not just shares with a location
    shareMessage += 'Shared from Recall';

    console.log('Share message prepared:', shareMessage.substring(0, 100) + '...');

    // If there are images, download them and share with the message
    if (recall.images && recall.images.length > 0 && Platform.OS !== 'web' && Share) {
      console.log(`Starting download process for ${recall.images?.length ?? 0} image(s)`);
      
      try {
        // Pre-resolve any missing image URLs (images beyond index 1 may be empty strings
        // due to lazy-loading optimisation in loadImagesForRecalls)
        const resolvedImages = [...(recall.images ?? [])];

        const missingIndices: number[] = [];
        resolvedImages.forEach((url, index) => {
          if (!url && recall.imageIds?.[index]) {
            missingIndices.push(index);
          }
        });

        if (missingIndices.length > 0) {
          console.log(`Pre-resolving ${missingIndices.length} missing image URL(s) from Supabase`);
          const missingIds = missingIndices.map(i => recall.imageIds![i]);
          const { data: imageData } = await supabase
            .from('recall_images')
            .select('id, cdn_url')
            .in('id', missingIds);

          if (imageData) {
            const urlById = new Map(imageData.map((img: { id: string; cdn_url: string }) => [img.id, img.cdn_url]));
            missingIndices.forEach(index => {
              const id = recall.imageIds![index];
              const url = urlById.get(id);
              if (url) resolvedImages[index] = url;
            });
          }
        }

        console.log(`Starting download process for ${resolvedImages.length} image(s)`);

        // Download all images to temporary locations
        const downloadPromises = resolvedImages.map(async (imageUrl, index) => {
          const fileExtension = getImageExtensionFromUrl(imageUrl);
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(7);
          const fileName = `share_recall_${recall.id}_${index}_${timestamp}_${randomSuffix}.${fileExtension}`;
          const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
          
          console.log(`[Image ${index + 1}/${resolvedImages.length}] Starting download`);
          console.log(`[Image ${index + 1}] Source URL:`, imageUrl);
          console.log(`[Image ${index + 1}] Target path:`, fileUri);
          
          try {
            // Download the image
            const downloadResult = await FileSystem.downloadAsync(imageUrl, fileUri);
            
            console.log(`[Image ${index + 1}] Download result status:`, downloadResult.status);
            console.log(`[Image ${index + 1}] Download result URI:`, downloadResult.uri);
            
            if (downloadResult.status === 200) {
              // Verify the file exists
              const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
              console.log(`[Image ${index + 1}] File info:`, fileInfo);
              
              if (fileInfo.exists) {
                console.log(`[Image ${index + 1}] File size:`, fileInfo.size, 'bytes');
                
                // Ensure proper file:// prefix for iOS
                let finalUri = downloadResult.uri;
                if (Platform.OS === 'ios' && !finalUri.startsWith('file://')) {
                  finalUri = `file://${finalUri}`;
                  console.log(`[Image ${index + 1}] Added file:// prefix:`, finalUri);
                }
                
                console.log(`[Image ${index + 1}] ✅ Successfully downloaded and verified`);
                return finalUri;
              } else {
                console.error(`[Image ${index + 1}] ❌ File does not exist after download`);
                return null;
              }
            } else {
              console.error(`[Image ${index + 1}] ❌ Download failed with status:`, downloadResult.status);
              return null;
            }
          } catch (downloadError) {
            console.error(`[Image ${index + 1}] ❌ Exception during download:`, downloadError);
            return null;
          }
        });
        
        // Wait for ALL downloads to complete
        console.log('Waiting for all downloads to complete...');
        const downloadResults = await Promise.all(downloadPromises);
        console.log('All download promises resolved');
        
        // Filter out failed downloads
        const validUris = downloadResults.filter((uri): uri is string => uri !== null);
        
        console.log(`Download summary: ${validUris.length} successful out of ${resolvedImages.length} total`);
        console.log('Valid URIs:', validUris);
        
        // If we successfully downloaded at least one image, share them using react-native-share
        if (validUris.length > 0) {
          console.log('Preparing to share with react-native-share');
          
          // Use react-native-share which properly supports multiple files on both iOS and Android
          const shareOptions: any = {
            title: 'Share Recall',
            message: shareMessage.trim(),
            urls: validUris, // react-native-share supports multiple files on both platforms
          };
          
          console.log('Share options:', {
            title: shareOptions.title,
            messageLength: shareOptions.message.length,
            urlCount: shareOptions.urls.length,
            urls: shareOptions.urls,
          });
          
          try {
            console.log('Calling Share.open...');
            const result = await Share.open(shareOptions);
            console.log('Share.open completed with result:', result);
            
            // Clean up temporary files after sharing
            await cleanupTempFiles(validUris);
            
            // Show success toast
            Toast.show({
              type: 'success',
              text1: 'Recall Shared',
              text2: `Successfully shared with ${validUris.length} image${validUris.length > 1 ? 's' : ''}`,
              position: 'bottom',
              visibilityTime: 2000,
            });
            
            return;
          } catch (shareError: any) {
            console.error('Share.open threw error:', shareError);
            
            // User dismissed the share dialog
            if (shareError.message && shareError.message.includes('User did not share')) {
              console.log('Share dismissed by user');
              await cleanupTempFiles(validUris);
              return;
            }
            
            // Other errors
            console.error('Error during share:', shareError);
            await cleanupTempFiles(validUris);
            throw shareError;
          }
        } else {
          console.warn('❌ No images were successfully downloaded, falling back to text-only share');
        }
      } catch (imageError) {
        console.error('❌ Error in image download/share process:', imageError);
        // Fall through to text-only share
      }
    }

    // Fallback: Share text only
    // Use react-native-share on native platforms, React Native Share API on web
    console.log(`Sharing text only (Platform: ${Platform.OS})`);
    
    try {
      if (Platform.OS !== 'web' && Share) {
        // Use react-native-share on native platforms
        const result = await Share.open({
          title: 'Share Recall',
          message: shareMessage.trim(),
        });
        
        console.log('Text-only share result (react-native-share):', result);
      } else {
        // Use React Native's built-in Share API on web
        const result = await RNShare.share({
          message: shareMessage.trim(),
          title: 'Share Recall',
        });
        
        console.log('Text-only share result (RN Share):', result);
      }
      
      Toast.show({
        type: 'success',
        text1: 'Recall Shared',
        text2: 'Successfully shared recall',
        position: 'bottom',
        visibilityTime: 2000,
      });
    } catch (shareError: any) {
      // User dismissed the share dialog
      if (shareError.message && (shareError.message.includes('User did not share') || shareError.message.includes('dismissed'))) {
        console.log('Share dismissed by user');
        return;
      }
      
      throw shareError;
    }
  } catch (error) {
    console.error('❌ Error sharing recall:', error);
    
    Toast.show({
      type: 'error',
      text1: 'Share Failed',
      text2: 'Could not share recall. Please try again.',
      position: 'bottom',
      visibilityTime: 3000,
    });
    
    throw error;
  }
}

/**
 * Clean up temporary downloaded files
 * @param fileUris - Array of file URIs to delete
 */
async function cleanupTempFiles(fileUris: string[]): Promise<void> {
  console.log(`Cleaning up ${fileUris.length} temporary file(s)`);
  
  for (const fileUri of fileUris) {
    try {
      // Remove file:// prefix if present for deletion
      const cleanUri = fileUri.replace('file://', '');
      await FileSystem.deleteAsync(cleanUri, { idempotent: true });
      console.log('Cleaned up temp file:', fileUri);
    } catch (cleanupError) {
      console.warn('Error cleaning up temp file:', cleanupError);
    }
  }
}

/**
 * Parse shared recall data from a deep link URL
 * @param url - The deep link URL
 * @returns Parsed shared recall data or null if invalid
 */
export function parseSharedRecallUrl(url: string): SharedRecallData | null {
  try {
    console.log('Parsing shared recall URL:', url);
    
    const parsed = Linking.parse(url);
    console.log('Parsed URL:', parsed);

    if (parsed.path !== 'shared-recall' && parsed.hostname !== 'shared-recall') {
      console.log('Not a shared recall URL');
      return null;
    }

    const dataParam = parsed.queryParams?.data;
    if (!dataParam || typeof dataParam !== 'string') {
      console.log('No data parameter found');
      return null;
    }

    const decodedData = decodeURIComponent(dataParam);
    const sharedData: SharedRecallData = JSON.parse(decodedData);

    console.log('Successfully parsed shared recall data:', sharedData);
    return sharedData;
  } catch (error) {
    console.error('Error parsing shared recall URL:', error);
    return null;
  }
}

/**
 * Check if a URL is a shared recall deep link
 * @param url - The URL to check
 * @returns True if the URL is a shared recall link
 */
export function isSharedRecallUrl(url: string): boolean {
  try {
    const parsed = Linking.parse(url);
    return parsed.path === 'shared-recall' || parsed.hostname === 'shared-recall';
  } catch {
    return false;
  }
}
