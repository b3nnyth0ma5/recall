
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

const STORAGE_BUCKET = 'media';

/**
 * Upload image to Supabase Storage
 * @param uri - Local file URI of the image
 * @param recallId - The recall ID to associate the image with
 * @returns The storage path or null if failed
 */
export async function uploadImageToStorage(uri: string, recallId: string): Promise<string | null> {
  try {
    console.log('=== Starting image upload ===');
    console.log('URI:', uri);
    console.log('Recall ID:', recallId);
    
    // Check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('No active session - user must be logged in to upload images');
      return null;
    }
    console.log('User authenticated:', session.user.id);

    // Clean the URI - remove file:// prefix if present
    let cleanUri = uri;
    if (uri.startsWith('file://')) {
      cleanUri = uri.substring(7);
    }
    console.log('Clean URI:', cleanUri);

    // Use the new File API to read the image as base64
    const file = new File(cleanUri);
    console.log('File object created');
    
    const base64 = await file.base64();
    console.log('Base64 conversion successful, length:', base64.length);

    // Convert base64 to binary data
    const binaryData = decode(base64);
    console.log('Binary data decoded, size:', binaryData.byteLength, 'bytes');

    // Determine content type from URI
    let contentType = 'image/jpeg';
    const lowerUri = uri.toLowerCase();
    if (lowerUri.endsWith('.png') || lowerUri.includes('.png?')) {
      contentType = 'image/png';
    } else if (lowerUri.endsWith('.gif') || lowerUri.includes('.gif?')) {
      contentType = 'image/gif';
    } else if (lowerUri.endsWith('.webp') || lowerUri.includes('.webp?')) {
      contentType = 'image/webp';
    } else if (lowerUri.endsWith('.jpg') || lowerUri.endsWith('.jpeg') || 
               lowerUri.includes('.jpg?') || lowerUri.includes('.jpeg?')) {
      contentType = 'image/jpeg';
    }
    console.log('Content type:', contentType);

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const extension = contentType.split('/')[1];
    const fileName = `${recallId}/${timestamp}-${randomString}.${extension}`;
    console.log('Generated filename:', fileName);

    // Check if bucket exists and is accessible
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    if (bucketsError) {
      console.error('Error listing buckets:', bucketsError);
    } else {
      console.log('Available buckets:', buckets?.map(b => b.name).join(', '));
      const bucketExists = buckets?.some(b => b.name === STORAGE_BUCKET);
      if (!bucketExists) {
        console.error(`Bucket '${STORAGE_BUCKET}' does not exist!`);
        console.log('Please create the bucket in Supabase Dashboard or run the setup migration');
        return null;
      }
    }

    // Upload to Supabase Storage
    console.log('Uploading to storage...');
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, binaryData, {
        contentType: contentType,
        upsert: false,
      });

    if (error) {
      console.error('=== Storage upload error v2 ===');
      console.error('Error message:', error.message);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return null;
    }

    console.log('=== Upload successful ===');
    console.log('Storage path:', data.path);
    return data.path;
  } catch (error) {
    console.error('=== Exception in uploadImageToStorage ===');
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
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

    console.log('Deleting image from storage:', path);
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
    console.log('Saving image record to database:', { recallId, imagePath, contentType });
    
    // Get current user
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('No active session - cannot save image record');
      return null;
    }

    const { data, error } = await supabase
      .from('recall_images')
      .insert([{
        recall_id: recallId,
        image_path: imagePath,
        content_type: contentType,
        user_id: session.user.id,
      }])
      .select('id')
      .single();

    if (error) {
      console.error('Error saving image record:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return null;
    }

    console.log('Image record saved successfully, ID:', data.id);
    return data.id;
  } catch (error) {
    console.error('Error in saveImageRecord:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
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
    console.log('Deleting image record from database:', imageId);
    
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
 * Initialize storage bucket if it doesn't exist
 * This should be called once during app initialization
 */
export async function initializeStorageBucket(): Promise<boolean> {
  try {
    console.log('Checking storage bucket...');
    
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.error('Error listing buckets:', error);
      return false;
    }

    const bucketExists = buckets?.some(b => b.name === STORAGE_BUCKET);
    
    if (!bucketExists) {
      console.log(`Bucket '${STORAGE_BUCKET}' does not exist. Please create it in Supabase Dashboard.`);
      console.log('Go to: Storage > Create a new bucket');
      console.log(`Bucket name: ${STORAGE_BUCKET}`);
      console.log('Make sure to set it as public or configure appropriate RLS policies');
      return false;
    }

    console.log(`Bucket '${STORAGE_BUCKET}' exists and is accessible`);
    return true;
  } catch (error) {
    console.error('Error in initializeStorageBucket:', error);
    return false;
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
