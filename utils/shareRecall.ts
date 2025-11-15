
import { Share, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as Linking from 'expo-linking';
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
 * @param recall - The note/recall to share
 * @param currentImageIndex - The index of the image currently being viewed (becomes primary)
 */
export async function shareRecall(recall: Note, currentImageIndex: number = 0): Promise<void> {
  try {
    console.log('Sharing recall:', recall.id);
    console.log('Current image index:', currentImageIndex);

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

    console.log('Created deep link:', deepLink);

    // Prepare share message
    let shareMessage = 'Check out this Recall!\n\n';
    
    if (sharedData.text) {
      const previewText = sharedData.text.length > 100 
        ? sharedData.text.substring(0, 100) + '...' 
        : sharedData.text;
      shareMessage += `"${previewText}"\n\n`;
    }

    if (sharedData.location) {
      shareMessage += `📍 ${sharedData.location}\n`;
    }

    if (sharedData.images && sharedData.images.length > 0) {
      shareMessage += `📷 ${sharedData.images.length} ${sharedData.images.length === 1 ? 'image' : 'images'}\n\n`;
    }

    // If there's an image, try to download and share it with the message
    if (sharedData.images && sharedData.images.length > 0) {
      const primaryImageUrl = sharedData.images[currentImageIndex] || sharedData.images[0];
      console.log('Attempting to share with image:', primaryImageUrl);
      
      try {
        // Download the image to a temporary location
        const fileExtension = primaryImageUrl.includes('.png') ? 'png' : 'jpg';
        const fileUri = FileSystem.cacheDirectory + `share_image_${Date.now()}.${fileExtension}`;
        console.log('Downloading image to:', fileUri);
        
        const downloadResult = await FileSystem.downloadAsync(primaryImageUrl, fileUri);
        
        if (downloadResult.status === 200) {
          console.log('Image downloaded successfully:', downloadResult.uri);
          
          // Check if Sharing is available
          const isAvailable = await Sharing.isAvailableAsync();
          
          if (isAvailable) {
            // On iOS, we can use expo-sharing which will show the image in the preview
            // We'll create a text file with the link and share both
            if (Platform.OS === 'ios') {
              // For iOS, use expo-sharing with the image
              // The share sheet will show the image preview
              console.log('Using expo-sharing for iOS with image preview');
              
              // Create a temporary text file with the message and link
              const textFileUri = FileSystem.cacheDirectory + `share_message_${Date.now()}.txt`;
              const messageWithLink = shareMessage + `\nOpen in Recall app: ${deepLink}`;
              await FileSystem.writeAsStringAsync(textFileUri, messageWithLink);
              
              // Share the image (which will show in preview)
              await Sharing.shareAsync(downloadResult.uri, {
                mimeType: fileExtension === 'png' ? 'image/png' : 'image/jpeg',
                dialogTitle: 'Share Recall',
                UTI: fileExtension === 'png' ? 'public.png' : 'public.jpeg',
              });
              
              console.log('Recall shared successfully with image preview');
              
              // Clean up temporary files
              try {
                await FileSystem.deleteAsync(textFileUri, { idempotent: true });
                await FileSystem.deleteAsync(fileUri, { idempotent: true });
              } catch (cleanupError) {
                console.log('Error cleaning up temp files:', cleanupError);
              }
              
              return;
            } else {
              // For Android, use React Native Share API with files parameter
              console.log('Using Share API for Android with image');
              
              const result = await Share.share(
                {
                  message: shareMessage,
                  url: deepLink, // This will be hyperlinked on Android
                  title: 'Share Recall',
                },
                {
                  dialogTitle: 'Share this Recall',
                  subject: 'Check out this Recall!',
                }
              );

              // Clean up temporary file
              try {
                await FileSystem.deleteAsync(fileUri, { idempotent: true });
              } catch (cleanupError) {
                console.log('Error cleaning up temp file:', cleanupError);
              }

              if (result.action === Share.sharedAction) {
                console.log('Recall shared successfully');
              } else if (result.action === Share.dismissedAction) {
                console.log('Share dismissed');
              }
              
              return;
            }
          }
        } else {
          console.log('Failed to download image, status:', downloadResult.status);
        }
      } catch (imageError) {
        console.error('Error downloading/sharing image:', imageError);
        // Fall through to share without image
      }
    }

    // Fallback: Share without image using React Native's Share API
    console.log('Sharing without image');
    
    // Prepare share options
    const shareOptions: any = {
      title: 'Share Recall',
    };

    // On iOS, the URL parameter creates a hyperlink separate from the message
    // On Android, we include it in the message
    if (Platform.OS === 'ios') {
      shareOptions.message = shareMessage + '\nTap the link below to open in Recall app';
      shareOptions.url = deepLink; // This will be shown as a tappable link
    } else {
      shareOptions.message = shareMessage + `\nOpen in Recall app: ${deepLink}`;
    }

    // Use React Native's Share API
    const result = await Share.share(shareOptions, {
      dialogTitle: 'Share this Recall',
      subject: 'Check out this Recall!',
    });

    if (result.action === Share.sharedAction) {
      console.log('Recall shared successfully');
      if (result.activityType) {
        console.log('Shared with activity type:', result.activityType);
      }
    } else if (result.action === Share.dismissedAction) {
      console.log('Share dismissed');
    }
  } catch (error) {
    console.error('Error sharing recall:', error);
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
