
import { Platform } from 'react-native';
import Share from 'react-native-share';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import Toast from 'react-native-toast-message';
import { Note } from '@/types/Note';

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
export async function shareRecall(recall: Note, currentImageIndex: number = 0): Promise<void> {
  try {
    console.log('User tapped Share button for recall:', recall.id);
    console.log('Current image index:', currentImageIndex);
    console.log('Total images:', recall.images?.length || 0);

    // Build comprehensive share message with recall text, location, and image info
    let shareMessage = '';
    
    // Pre-enter the recall text at the top
    if (recall.text) {
      shareMessage += `${recall.text}\n\n`;
    }

    // Add location information with Google Maps link
    if (recall.location) {
      shareMessage += `📍 ${recall.location}\n`;
      
      if (recall.latitude && recall.longitude) {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${recall.latitude},${recall.longitude}`;
        shareMessage += `🗺️ ${mapsUrl}\n`;
      }
      
      shareMessage += '\n';
    }

    // Add image count information
    const imageCount = recall.images?.length || 0;
    if (imageCount > 0) {
      const imageText = imageCount === 1 ? 'image' : 'images';
      shareMessage += `📷 ${imageCount} ${imageText} attached`;
    }

    console.log('Share message prepared:', shareMessage.substring(0, 100) + '...');

    // If there are images, download them and share with the message
    if (recall.images && recall.images.length > 0) {
      console.log(`Downloading ${recall.images.length} image(s) for sharing`);
      
      try {
        // Download all images to temporary locations
        const downloadedFiles: string[] = [];
        const downloadPromises = recall.images.map(async (imageUrl, index) => {
          const fileExtension = imageUrl.includes('.png') ? 'png' : 'jpg';
          const timestamp = Date.now();
          const fileUri = `${FileSystem.cacheDirectory}share_recall_${recall.id}_${index}_${timestamp}.${fileExtension}`;
          
          console.log(`Downloading image ${index + 1}/${recall.images!.length} from URL:`, imageUrl);
          
          try {
            const downloadResult = await FileSystem.downloadAsync(imageUrl, fileUri);
            
            if (downloadResult.status === 200) {
              console.log(`Image ${index + 1} downloaded successfully to:`, downloadResult.uri);
              return downloadResult.uri;
            } else {
              console.warn(`Failed to download image ${index + 1}, status: ${downloadResult.status}`);
              return null;
            }
          } catch (downloadError) {
            console.error(`Error downloading image ${index + 1}:`, downloadError);
            return null;
          }
        });
        
        // Wait for all downloads to complete
        const results = await Promise.all(downloadPromises);
        const successfulDownloads = results.filter((uri): uri is string => uri !== null);
        downloadedFiles.push(...successfulDownloads);
        
        console.log(`Successfully downloaded ${downloadedFiles.length} out of ${recall.images.length} image(s)`);
        
        // If we successfully downloaded at least one image, share them using react-native-share
        if (downloadedFiles.length > 0) {
          console.log('Preparing to share with react-native-share');
          console.log('Downloaded file URIs:', downloadedFiles);
          
          // Use react-native-share which properly supports multiple files on both iOS and Android
          const shareOptions: any = {
            title: 'Share Recall',
            message: shareMessage.trim(),
            urls: downloadedFiles, // react-native-share supports multiple files on both platforms
          };
          
          console.log('Calling Share.open with options:', {
            title: shareOptions.title,
            message: shareOptions.message.substring(0, 50) + '...',
            urlCount: shareOptions.urls.length,
          });
          
          try {
            const result = await Share.open(shareOptions);
            console.log('Share result:', result);
            
            // Clean up temporary files after sharing
            await cleanupTempFiles(downloadedFiles);
            
            // Show success toast
            Toast.show({
              type: 'success',
              text1: 'Recall Shared',
              text2: `Successfully shared with ${downloadedFiles.length} image${downloadedFiles.length > 1 ? 's' : ''}`,
              position: 'bottom',
              visibilityTime: 2000,
            });
            
            return;
          } catch (shareError: any) {
            // User dismissed the share dialog
            if (shareError.message && shareError.message.includes('User did not share')) {
              console.log('Share dismissed by user');
              await cleanupTempFiles(downloadedFiles);
              return;
            }
            
            // Other errors
            console.error('Error during share:', shareError);
            await cleanupTempFiles(downloadedFiles);
            throw shareError;
          }
        } else {
          console.warn('No images were successfully downloaded, falling back to text-only share');
        }
      } catch (imageError) {
        console.error('Error downloading/sharing images:', imageError);
        // Fall through to text-only share
      }
    }

    // Fallback: Share text only using react-native-share
    console.log('Sharing with react-native-share (text only)');
    
    try {
      const result = await Share.open({
        title: 'Share Recall',
        message: shareMessage.trim(),
      });
      
      console.log('Text-only share result:', result);
      
      Toast.show({
        type: 'success',
        text1: 'Recall Shared',
        text2: 'Successfully shared recall',
        position: 'bottom',
        visibilityTime: 2000,
      });
    } catch (shareError: any) {
      // User dismissed the share dialog
      if (shareError.message && shareError.message.includes('User did not share')) {
        console.log('Share dismissed by user');
        return;
      }
      
      throw shareError;
    }
  } catch (error) {
    console.error('Error sharing recall:', error);
    
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
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
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
