
import { Share, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
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
 * Share a recall using the native device sharing feature
 * Includes text, location, and all images as actual files (not URLs)
 * @param recall - The note/recall to share
 * @param currentImageIndex - The index of the image currently being viewed (becomes primary)
 */
export async function shareRecall(recall: Note, currentImageIndex: number = 0): Promise<void> {
  try {
    console.log('Sharing recall:', recall.id);
    console.log('Current image index:', currentImageIndex);
    console.log('Total images:', recall.images?.length || 0);

    // Prepare the shared data (excluding UUIDs)
    const sharedData: SharedRecallData = {
      text: recall.text || '',
      images: recall.images || [],
      primaryImageIndex: currentImageIndex,
      location: recall.location,
      latitude: recall.latitude,
      longitude: recall.longitude,
      location_primary_type: recall.location_primary_type,
      created_at: recall.created_at,
    };

    // Create a deep link with the shared data
    const encodedData = encodeURIComponent(JSON.stringify(sharedData));
    const deepLink = Linking.createURL('shared-recall', {
      queryParams: { data: encodedData },
    });

    console.log('Created deep link for recall sharing');

    // Build comprehensive share message with recall text pre-entered
    let shareMessage = '';
    
    // Pre-enter the recall text at the top
    if (sharedData.text) {
      shareMessage += `${sharedData.text}\n\n`;
    }

    // Add location information
    if (sharedData.location) {
      shareMessage += `📍 ${sharedData.location}\n`;
      
      // Add Google Maps link if coordinates available
      if (sharedData.latitude && sharedData.longitude) {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${sharedData.latitude},${sharedData.longitude}`;
        shareMessage += `🗺️ ${mapsUrl}\n`;
      }
      
      shareMessage += '\n';
    }

    // Add image count information
    if (sharedData.images && sharedData.images.length > 0) {
      const imageCount = sharedData.images.length;
      const imageText = imageCount === 1 ? 'image' : 'images';
      shareMessage += `📷 ${imageCount} ${imageText} attached\n\n`;
    }

    // Add app attribution with deep link
    shareMessage += `Shared from Natively\n${deepLink}`;

    console.log('Share message prepared with recall text, length:', shareMessage.length);

    // Try to share with actual image files (not URLs)
    if (sharedData.images && sharedData.images.length > 0) {
      console.log(`Attempting to download and share ${sharedData.images.length} image(s)`);
      
      try {
        // Download all images to temporary locations
        const downloadedFiles: string[] = [];
        
        for (let i = 0; i < sharedData.images.length; i++) {
          const imageUrl = sharedData.images[i];
          const fileExtension = imageUrl.includes('.png') ? 'png' : 'jpg';
          const timestamp = Date.now();
          const fileUri = `${FileSystem.cacheDirectory}share_recall_${recall.id}_${i}_${timestamp}.${fileExtension}`;
          
          console.log(`Downloading image ${i + 1}/${sharedData.images.length} from:`, imageUrl);
          
          try {
            const downloadResult = await FileSystem.downloadAsync(imageUrl, fileUri);
            
            if (downloadResult.status === 200) {
              downloadedFiles.push(downloadResult.uri);
              console.log(`Image ${i + 1} downloaded successfully to:`, downloadResult.uri);
            } else {
              console.log(`Failed to download image ${i + 1}, status:`, downloadResult.status);
            }
          } catch (downloadError) {
            console.error(`Error downloading image ${i + 1}:`, downloadError);
          }
        }
        
        // If we successfully downloaded at least one image, share them
        if (downloadedFiles.length > 0) {
          console.log(`Successfully downloaded ${downloadedFiles.length} image(s), preparing to share`);
          
          // Check if sharing is available
          const isAvailable = await Sharing.isAvailableAsync();
          
          if (isAvailable && Platform.OS === 'ios') {
            console.log(`Using expo-sharing for iOS with ${downloadedFiles.length} image(s)`);
            
            // For iOS, share the primary image with the full message
            const primaryFile = downloadedFiles[currentImageIndex] || downloadedFiles[0];
            const fileExtension = primaryFile.includes('.png') ? 'png' : 'jpg';
            const mimeType = fileExtension === 'png' ? 'image/png' : 'image/jpeg';
            const uti = fileExtension === 'png' ? 'public.png' : 'public.jpeg';
            
            await Sharing.shareAsync(primaryFile, {
              mimeType: mimeType,
              dialogTitle: 'Share Recall',
              UTI: uti,
            });
            
            console.log('Recall shared successfully with image(s) via expo-sharing');
            
            // Show success toast
            Toast.show({
              type: 'success',
              text1: 'Recall Shared',
              text2: `Successfully shared recall with ${downloadedFiles.length} image${downloadedFiles.length > 1 ? 's' : ''}`,
              position: 'bottom',
              visibilityTime: 2000,
            });
            
            // Clean up temporary files
            for (const fileUri of downloadedFiles) {
              try {
                await FileSystem.deleteAsync(fileUri, { idempotent: true });
                console.log('Cleaned up temp file:', fileUri);
              } catch (cleanupError) {
                console.log('Error cleaning up temp file:', cleanupError);
              }
            }
            
            return;
          } else if (Platform.OS === 'android') {
            // For Android, use Share API with the message and first image URL
            console.log('Using Share API for Android with message and image URL');
            
            const result = await Share.share(
              {
                message: shareMessage.trim(),
                url: sharedData.images[currentImageIndex] || sharedData.images[0],
              },
              {
                dialogTitle: 'Share Recall',
                subject: 'Check out this recall from Natively!',
              }
            );

            // Clean up temporary files
            for (const fileUri of downloadedFiles) {
              try {
                await FileSystem.deleteAsync(fileUri, { idempotent: true });
              } catch (cleanupError) {
                console.log('Error cleaning up temp file:', cleanupError);
              }
            }

            if (result.action === Share.sharedAction) {
              console.log('Recall shared successfully via Share API');
              
              Toast.show({
                type: 'success',
                text1: 'Recall Shared',
                text2: 'Successfully shared recall',
                position: 'bottom',
                visibilityTime: 2000,
              });
            } else if (result.action === Share.dismissedAction) {
              console.log('Share dismissed');
            }
            
            return;
          }
        } else {
          console.log('No images were successfully downloaded, falling back to text-only share');
        }
      } catch (imageError) {
        console.error('Error downloading/sharing images:', imageError);
        // Fall through to text-only share
      }
    }

    // Fallback: Share using React Native's Share API (text only)
    console.log('Sharing with standard Share API (text only)');
    
    const result = await Share.share(
      {
        message: shareMessage.trim(),
        title: 'Share Recall from Natively',
      },
      {
        dialogTitle: 'Share Recall',
        subject: 'Check out this recall from Natively!',
      }
    );

    if (result.action === Share.sharedAction) {
      console.log('Recall shared successfully (text only)');
      
      // Show success toast
      Toast.show({
        type: 'success',
        text1: 'Recall Shared',
        text2: 'Successfully shared recall',
        position: 'bottom',
        visibilityTime: 2000,
      });
      
      if (result.activityType) {
        console.log('Shared with activity type:', result.activityType);
      }
    } else if (result.action === Share.dismissedAction) {
      console.log('Share dismissed');
    }
  } catch (error) {
    console.error('Error sharing recall:', error);
    
    // Show error toast
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
