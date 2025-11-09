
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';

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

export async function uploadImageToDatabase(
  uri: string,
  recallId: string,
  contentType: string = 'image/jpeg'
): Promise<string | null> {
  try {
    console.log('=== Starting image upload to database ===');
    console.log('URI:', uri);
    console.log('Recall ID:', recallId);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('No active session - user must be logged in to upload images');
      return null;
    }
    console.log('User authenticated:', session.user.id);

    console.log('Converting image to base64...');
    // Use the new File API from expo-file-system
    const file = new File(uri);
    const base64 = await file.base64();
    console.log('Base64 conversion successful, length:', base64.length);

    // Insert the base64 string directly into the database as text
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

export async function getImageDataUrl(imageId: string): Promise<string | null> {
  try {
    console.log('Fetching image data for ID:', imageId);
    
    const { data, error } = await supabase
      .from('recall_images')
      .select('image_data, content_type')
      .eq('id', imageId)
      .single();

    if (error) {
      console.error('Error fetching image data for ID:', imageId);
      console.error('Error details:', error);
      return null;
    }

    if (!data || !data.image_data) {
      console.error('No image_data found for ID:', imageId);
      return null;
    }

    // The image_data is stored as a base64 string in the text column
    const base64String = data.image_data;
    const contentType = data.content_type || 'image/jpeg';
    
    // Convert to data URL for display
    const dataUrl = `data:${contentType};base64,${base64String}`;
    
    console.log('Successfully created data URL for image:', imageId);
    
    return dataUrl;
  } catch (error) {
    console.error('Exception in getImageDataUrl for ID:', imageId);
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
    return null;
  }
}

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

export async function saveSearchHistory(userId: string, searchText: string): Promise<void> {
  try {
    if (!searchText.trim()) {
      return;
    }

    console.log('Saving search history:', { userId, searchText: searchText.trim() });

    const { error } = await supabase
      .from('search_history')
      .upsert(
        { 
          user_id: userId, 
          search_text: searchText.trim(),
          updated_at: new Date().toISOString()
        },
        { 
          onConflict: 'user_id,search_text',
          ignoreDuplicates: false
        }
      );

    if (error) {
      console.error('Error upserting search history:', error);
    } else {
      console.log('Search history saved successfully');
    }
  } catch (e) {
    console.error('Error saving search history:', e);
  }
}

export async function triggerOCRProcessing(imageId: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('Triggering OCR processing for image:', imageId);

    const { data, error } = await supabase.functions.invoke('ocr-image', {
      body: { 
        record: { id: imageId } 
      },
    });

    if (error) {
      console.error('Error invoking OCR function:', error);
      return { success: false, error: error.message };
    }

    console.log('OCR processing triggered successfully:', data);
    return { success: true };
  } catch (error) {
    console.error('Exception in triggerOCRProcessing:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function getImageOCRResults(imageId: string): Promise<{
  ocrText?: string;
  explanation?: string;
  processedAt?: string;
} | null> {
  try {
    console.log('Fetching OCR results for image:', imageId);

    const { data, error } = await supabase
      .from('recall_images')
      .select('ocr_text, image_explanation, processed_at')
      .eq('id', imageId)
      .single();

    if (error) {
      console.error('Error fetching OCR results:', error);
      return null;
    }

    return {
      ocrText: data.ocr_text,
      explanation: data.image_explanation,
      processedAt: data.processed_at,
    };
  } catch (error) {
    console.error('Exception in getImageOCRResults:', error);
    return null;
  }
}
