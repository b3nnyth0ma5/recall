
import { createClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';
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

const STORAGE_BUCKET = 'recall-images';

/**
 * Upload image to Supabase Storage
 * @param uri - Local file URI of the image
 * @param recallId - The recall ID to associate the image with
 * @returns The storage path or null if failed
 */
export async function uploadImageToStorage(uri: string, recallId: string): Promise<string | null> {
  try {
    console.log('Uploading image to Supabase Storage:', uri);
    
    // Use the new File API to read the image as base64
    const file = new File(uri);
    const base64 = await file.base64();

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

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const extension = contentType.split('/')[1];
    const fileName = `${recallId}/${timestamp}-${randomString}.${extension}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, binaryData, {
        contentType: contentType,
        upsert: false,
      });

    if (error) {
      console.error('Error uploading image to storage:', error);
      return null;
    }

    console.log('Image uploaded successfully to storage:', data.path);
    return data.path;
  } catch (error) {
    console.error('Error in uploadImageToStorage:', error);
    return null;
  }
}

/**
 * Get public URL for an image in Supabase Storage
 * @param path - The storage path of the image
 * @returns Public URL for the image
 */
export function getImageUrl(path: string): string {
  if (!path) return '';
  
  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Delete image from Supabase Storage
 * @param path - The storage path of the image
 * @returns True if successful, false otherwise
 */
export async function deleteImageFromStorage(path: string): Promise<boolean> {
  try {
    if (!path) return false;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([path]);

    if (error) {
      console.error('Error deleting image from storage:', error);
      return false;
    }

    console.log('Image deleted successfully from storage');
    return true;
  } catch (error) {
    console.error('Error in deleteImageFromStorage:', error);
    return false;
  }
}

/**
 * Save image record to database
 * @param recallId - The recall ID
 * @param imagePath - The storage path
 * @param contentType - The content type
 * @returns The image record ID or null if failed
 */
export async function saveImageRecord(
  recallId: string,
  imagePath: string,
  contentType: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('recall_images')
      .insert([{
        recall_id: recallId,
        image_path: imagePath,
        content_type: contentType,
      }])
      .select('id')
      .single();

    if (error) {
      console.error('Error saving image record:', error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('Error in saveImageRecord:', error);
    return null;
  }
}

/**
 * Delete image record from database
 * @param imageId - The image record ID
 * @returns True if successful, false otherwise
 */
export async function deleteImageRecord(imageId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('recall_images')
      .delete()
      .eq('id', imageId);

    if (error) {
      console.error('Error deleting image record:', error);
      return false;
    }

    console.log('Image record deleted successfully');
    return true;
  } catch (error) {
    console.error('Error in deleteImageRecord:', error);
    return false;
  }
}

/**
 * Get image path from database
 * @param imageId - The image record ID
 * @returns The storage path or null if not found
 */
export async function getImagePath(imageId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('recall_images')
      .select('image_path')
      .eq('id', imageId)
      .single();

    if (error || !data) {
      console.error('Error fetching image path:', error);
      return null;
    }

    return data.image_path;
  } catch (error) {
    console.error('Error in getImagePath:', error);
    return null;
  }
}

/**
 * Legacy function - kept for compatibility but deprecated
 */
export async function uploadImageToDatabase(uri: string, recallId: string): Promise<string | null> {
  console.warn('uploadImageToDatabase is deprecated, use uploadImageToStorage instead');
  return null;
}

/**
 * Legacy function - kept for compatibility but deprecated
 */
export async function getImageDataUrl(imageId: string): Promise<string | null> {
  console.warn('getImageDataUrl is deprecated, use getImageUrl instead');
  return null;
}

/**
 * Legacy function - kept for compatibility but deprecated
 */
export async function deleteImageFromDatabase(imageId: string): Promise<boolean> {
  console.warn('deleteImageFromDatabase is deprecated, use deleteImageRecord instead');
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
