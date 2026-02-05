
import { Share, Platform, Alert } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import Toast from 'react-native-toast-message';
import { Note } from '@/types/Note';
import { generateSharedNoteHTML } from '@/components/SharedNote';

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
 * Includes text, location, and all images
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

    console.log('Created deep link:', deepLink);

    // Build comprehensive share message
    let shareMessage = '';
    
    // Add text content
    if (sharedData.text) {
      shareMessage += `${sharedData.text}\n\n`;
    }

    // Add location
    if (sharedData.location) {
      shareMessage += `📍 Location: ${sharedData.location}\n`;
      
      // Add Google Maps link if coordinates available
      if (sharedData.latitude && sharedData.longitude) {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${sharedData.latitude},${sharedData.longitude}`;
        shareMessage += `🗺️ View on Maps: ${mapsUrl}\n`;
      }
      
      shareMessage += '\n';
    }

    // Add image count
    if (sharedData.images && sharedData.images.length > 0) {
      shareMessage += `📷 ${sharedData.images.length} ${sharedData.images.length === 1 ? 'image' : 'images'} attached\n\n`;
      
      // Add image URLs for platforms that support them
      sharedData.images.forEach((imageUrl, index) => {
        shareMessage += `Image ${index + 1}: ${imageUrl}\n`;
      });
      
      shareMessage += '\n';
    }

    // Add app attribution
    shareMessage += `Shared from Natively\n${deepLink}`;

    console.log('Share message prepared, length:', shareMessage.length);

    // Get the primary image URL
    const primaryImageUrl = sharedData.images && sharedData.images.length > 0
      ? sharedData.images[currentImageIndex] || sharedData.images[0]
      : undefined;

    // Try to share with image preview on iOS
    if (primaryImageUrl && Platform.OS === 'ios') {
      console.log('Attempting to share with image preview on iOS:', primaryImageUrl);
      
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
            console.log('Using expo-sharing for iOS with image preview');
            
            // Share the image with the message
            await Sharing.shareAsync(downloadResult.uri, {
              mimeType: fileExtension === 'png' ? 'image/png' : 'image/jpeg',
              dialogTitle: shareMessage.trim(),
              UTI: fileExtension === 'png' ? 'public.png' : 'public.jpeg',
            });
            
            console.log('Recall shared successfully with image preview');
            
            // Show success toast
            Toast.show({
              type: 'success',
              text1: 'Recall Shared',
              text2: 'Successfully shared recall with image',
              position: 'bottom',
              visibilityTime: 2000,
            });
            
            // Clean up temporary file
            try {
              await FileSystem.deleteAsync(fileUri, { idempotent: true });
            } catch (cleanupError) {
              console.log('Error cleaning up temp file:', cleanupError);
            }
            
            return;
          }
        } else {
          console.log('Failed to download image, status:', downloadResult.status);
        }
      } catch (imageError) {
        console.error('Error downloading/sharing image:', imageError);
        // Fall through to share without image
      }
    }

    // Fallback: Share using React Native's Share API
    console.log('Sharing with standard Share API');
    
    const result = await Share.share(
      {
        message: shareMessage.trim(),
        title: 'Share Recall from Natively',
        url: Platform.OS === 'ios' ? deepLink : undefined, // iOS supports URL separately
      },
      {
        dialogTitle: 'Share this Recall',
        subject: 'Check out this recall from Natively!',
      }
    );

    if (result.action === Share.sharedAction) {
      console.log('Recall shared successfully');
      
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
