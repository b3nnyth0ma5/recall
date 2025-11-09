
import { createClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';
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
 * Upload image directly to database as base64
 * @param uri - Local file URI of the image
 * @param recallId - The recall ID to associate the image with
 * @param contentType - The content type of the image
 * @returns The image record ID or null if failed
 */
export async function uploadImageToDatabase(
  uri: string,
  recallId: string,
  contentType: string = 'image/jpeg'
): Promise<string | null> {
  try {
    console.log('=== Starting image upload to database ===');
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

    // Use the File API to read the image as base64
    const file = new File(cleanUri);
    console.log('File object created');
    
    const base64 = await file.base64();
    console.log('Base64 conversion successful, length:', base64.length);

    // Insert image data directly into database
    const { data, error } = await supabase
      .from('recall_images')
      .insert([{
        recall_id: recallId,
        image_data: base64,
        content_type: contentType,
        user_id: session.user.id,
      }])
      .select('id')
      .single();

    if (error) {
      console.error('=== Database insert error ===');
      console.error('Error message:', error.message);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return null;
    }

    console.log('=== Upload successful ===');
    console.log('Image ID:', data.id);
    return data.id;
  } catch (error) {
    console.error('=== Exception in uploadImageToDatabase ===');
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return null;
  }
}

/**
 * Get image data URL from database
 * @param imageId - The image record ID
 * @returns Data URL for the image or null if not found
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

    if (!data.image_data) {
      console.error('No image data found for ID:', imageId);
      return null;
    }

    // Return as data URL
    const contentType = data.content_type || 'image/jpeg';
    return `data:${contentType};base64,${data.image_data}`;
  } catch (error) {
    console.error('Error in getImageDataUrl:', error);
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
