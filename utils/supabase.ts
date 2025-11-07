
import { createClient } from '@supabase/supabase-js';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://cesmsdnblkdjkskmiqib.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlc21zZG5ibGtkamtza21pcWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MDc1NzcsImV4cCI6MjA3ODA4MzU3N30.AlULDdolfFFcqfrjXY4XBC_fzD_Gz-bx2FCyqjx4nA4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Upload image data directly to the recall_images table
 * @param uri - Local file URI of the image
 * @param recallId - The recall ID to associate the image with
 * @returns The image record ID or null if failed
 */
export async function uploadImageToDatabase(uri: string, recallId: string): Promise<string | null> {
  try {
    console.log('Uploading image to database:', uri);
    
    // Read the image as base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });

    // Convert base64 to binary data
    const binaryData = decode(base64);

    // Determine content type from URI
    let contentType = 'image/jpeg';
    if (uri.toLowerCase().endsWith('.png')) {
      contentType = 'image/png';
    } else if (uri.toLowerCase().endsWith('.gif')) {
      contentType = 'image/gif';
    } else if (uri.toLowerCase().endsWith('.webp')) {
      contentType = 'image/webp';
    }

    // Insert the image data into the database
    const { data, error } = await supabase
      .from('recall_images')
      .insert([{
        recall_id: recallId,
        image_data: binaryData,
        content_type: contentType,
      }])
      .select('id')
      .single();

    if (error) {
      console.error('Error uploading image to database:', error);
      return null;
    }

    console.log('Image uploaded successfully to database:', data.id);
    return data.id;
  } catch (error) {
    console.error('Error in uploadImageToDatabase:', error);
    return null;
  }
}

/**
 * Get image data URL from the database
 * @param imageId - The image record ID
 * @returns Data URL for the image or null if failed
 */
export async function getImageDataUrl(imageId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('recall_images')
      .select('image_data, content_type')
      .eq('id', imageId)
      .single();

    if (error || !data) {
      console.error('Error fetching image data:', error);
      return null;
    }

    // Convert binary data to base64
    const base64 = btoa(
      new Uint8Array(data.image_data).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ''
      )
    );

    // Return as data URL
    return `data:${data.content_type};base64,${base64}`;
  } catch (error) {
    console.error('Error in getImageDataUrl:', error);
    return null;
  }
}

/**
 * Delete image from the database
 * @param imageId - The image record ID
 * @returns True if successful, false otherwise
 */
export async function deleteImageFromDatabase(imageId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('recall_images')
      .delete()
      .eq('id', imageId);

    if (error) {
      console.error('Error deleting image from database:', error);
      return false;
    }

    console.log('Image deleted successfully from database');
    return true;
  } catch (error) {
    console.error('Error in deleteImageFromDatabase:', error);
    return false;
  }
}

/**
 * Legacy function - kept for compatibility but no longer used
 */
export async function uploadImage(uri: string): Promise<string | null> {
  console.warn('uploadImage is deprecated, use uploadImageToDatabase instead');
  return null;
}

/**
 * Legacy function - kept for compatibility but no longer used
 */
export function getImageUrl(imagePath: string): string {
  console.warn('getImageUrl is deprecated, use getImageDataUrl instead');
  return '';
}

/**
 * Legacy function - kept for compatibility but no longer used
 */
export async function deleteImage(imagePath: string): Promise<boolean> {
  console.warn('deleteImage is deprecated, use deleteImageFromDatabase instead');
  return false;
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'RecallsApp/1.0',
        },
      }
    );

    const data = await response.json();
    
    if (data && data.address) {
      const suburb = data.address.suburb || data.address.neighbourhood || data.address.village || '';
      const city = data.address.city || data.address.town || data.address.county || '';
      
      if (suburb && city) {
        return `${suburb}, ${city}`;
      } else if (city) {
        return city;
      } else if (suburb) {
        return suburb;
      }
    }
    
    return 'Unknown Location';
  } catch (error) {
    console.error('Error in reverseGeocode:', error);
    return 'Unknown Location';
  }
}
