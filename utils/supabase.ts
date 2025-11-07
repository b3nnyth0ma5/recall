
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

export interface ImageUploadResult {
  id: string;
  base64: string;
  name: string;
  type: string;
  size: number;
}

export async function uploadImage(uri: string): Promise<ImageUploadResult | null> {
  try {
    console.log('Processing image:', uri);
    
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });

    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    
    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(uri);
    const fileSize = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0;

    console.log('Image processed successfully');
    return {
      id: fileName,
      base64: base64,
      name: fileName,
      type: 'image/jpeg',
      size: fileSize || 0,
    };
  } catch (error) {
    console.error('Error in uploadImage:', error);
    return null;
  }
}

export async function saveImageToDatabase(
  recallId: string,
  imageData: ImageUploadResult
): Promise<string | null> {
  try {
    console.log('Saving image to database for recall:', recallId);
    
    const { data, error } = await supabase
      .from('recall_images')
      .insert({
        recall_id: recallId,
        image_data: imageData.base64,
        image_name: imageData.name,
        image_type: imageData.type,
        file_size: imageData.size,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving image to database:', error);
      return null;
    }

    console.log('Image saved to database successfully:', data.id);
    return data.id;
  } catch (error) {
    console.error('Error in saveImageToDatabase:', error);
    return null;
  }
}

export async function getImageFromDatabase(imageId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('recall_images')
      .select('image_data, image_type')
      .eq('id', imageId)
      .single();

    if (error) {
      console.error('Error getting image from database:', error);
      return null;
    }

    return `data:${data.image_type};base64,${data.image_data}`;
  } catch (error) {
    console.error('Error in getImageFromDatabase:', error);
    return null;
  }
}

export async function getImagesForRecall(recallId: string): Promise<Array<{id: string, uri: string}>> {
  try {
    const { data, error } = await supabase
      .from('recall_images')
      .select('id, image_data, image_type')
      .eq('recall_id', recallId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error getting images for recall:', error);
      return [];
    }

    return (data || []).map(img => ({
      id: img.id,
      uri: `data:${img.image_type};base64,${img.image_data}`,
    }));
  } catch (error) {
    console.error('Error in getImagesForRecall:', error);
    return [];
  }
}

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

    console.log('Image deleted from database successfully');
    return true;
  } catch (error) {
    console.error('Error in deleteImageFromDatabase:', error);
    return false;
  }
}

// Legacy function for backward compatibility
export function getImageUrl(imagePath: string): string {
  // This is now deprecated but kept for compatibility
  return imagePath;
}

export async function deleteImage(imagePath: string): Promise<boolean> {
  // This is now deprecated but kept for compatibility
  console.log('deleteImage called with path:', imagePath);
  return true;
}

export interface LocationSearchResult {
  display_name: string;
  lat: string;
  lon: string;
  address: {
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

export async function searchLocations(query: string): Promise<LocationSearchResult[]> {
  try {
    console.log('Searching locations for:', query);
    
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'RecallsApp/1.0',
        },
      }
    );

    const data = await response.json();
    console.log('Location search results:', data.length);
    
    return data || [];
  } catch (error) {
    console.error('Error in searchLocations:', error);
    return [];
  }
}

export function formatLocationName(result: LocationSearchResult): string {
  const address = result.address;
  const suburb = address.suburb || address.neighbourhood || address.village || '';
  const city = address.city || address.town || address.county || '';
  
  if (suburb && city) {
    return `${suburb}, ${city}`;
  } else if (city) {
    return city;
  } else if (suburb) {
    return suburb;
  }
  
  return result.display_name.split(',').slice(0, 2).join(',').trim();
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
