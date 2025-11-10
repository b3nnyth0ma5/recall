
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

// CDN configuration
const CDN_ENABLED = true; // Toggle CDN usage
const CDN_BASE_URL = `${supabaseUrl}/functions/v1/serve-image`;

// In-memory cache for image URLs
const imageUrlCache = new Map<string, string>();

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
    
    // Clear cache for this image
    imageUrlCache.delete(data.id);
    
    // Automatically trigger OCR processing after successful upload
    console.log('Triggering OCR processing...');
    triggerOCRProcessing(data.id).then(result => {
      if (result.success) {
        console.log('OCR processing triggered successfully for image:', data.id);
      } else {
        console.error('Failed to trigger OCR processing:', result.error);
      }
    }).catch(err => {
      console.error('Exception while triggering OCR:', err);
    });
    
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
 * Get CDN URL for an image
 * Uses Supabase Edge Function with aggressive caching headers
 * 
 * @param imageId - The ID of the image
 * @param options - Optional size and quality parameters
 * @returns CDN URL for the image
 */
export function getImageCDNUrl(
  imageId: string,
  options?: {
    width?: number;
    height?: number;
    quality?: number;
  }
): string {
  const params = new URLSearchParams({ id: imageId });
  
  if (options?.width) {
    params.append('width', options.width.toString());
  }
  if (options?.height) {
    params.append('height', options.height.toString());
  }
  if (options?.quality) {
    params.append('quality', options.quality.toString());
  }
  
  return `${CDN_BASE_URL}?${params.toString()}`;
}

/**
 * Get image data URL (legacy method, now uses CDN)
 * Returns a CDN URL for faster loading with browser caching
 * 
 * @param imageId - The ID of the image
 * @returns CDN URL or data URL as fallback
 */
export async function getImageDataUrl(imageId: string): Promise<string | null> {
  try {
    // Check in-memory cache first
    if (imageUrlCache.has(imageId)) {
      console.log('Returning cached URL for image:', imageId);
      return imageUrlCache.get(imageId)!;
    }

    if (CDN_ENABLED) {
      // Use CDN URL for faster loading
      const cdnUrl = getImageCDNUrl(imageId);
      console.log('Using CDN URL for image:', imageId);
      
      // Cache the URL
      imageUrlCache.set(imageId, cdnUrl);
      
      return cdnUrl;
    }

    // Fallback to data URL (legacy method)
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
    
    // Cache the URL
    imageUrlCache.set(imageId, dataUrl);
    
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

/**
 * Get optimized image URL for specific use cases
 * 
 * @param imageId - The ID of the image
 * @param size - Predefined size (thumbnail, card, preview, full)
 * @returns Optimized CDN URL
 */
export function getOptimizedImageUrl(
  imageId: string,
  size: 'thumbnail' | 'card' | 'preview' | 'full' = 'card'
): string {
  const sizeMap = {
    thumbnail: { width: 150, height: 150, quality: 70 },
    card: { width: 400, height: 400, quality: 80 },
    preview: { width: 800, height: 800, quality: 85 },
    full: { width: 1200, height: 1200, quality: 90 },
  };

  return getImageCDNUrl(imageId, sizeMap[size]);
}

/**
 * Preload images for better performance
 * Triggers browser/native cache by making requests
 * 
 * @param imageIds - Array of image IDs to preload
 */
export async function preloadImages(imageIds: string[]): Promise<void> {
  try {
    console.log(`Preloading ${imageIds.length} images...`);
    
    const promises = imageIds.map(async (imageId) => {
      const url = await getImageDataUrl(imageId);
      if (url && CDN_ENABLED) {
        // Make a HEAD request to warm up the cache
        try {
          await fetch(url, { method: 'HEAD' });
        } catch (error) {
          console.error(`Failed to preload image ${imageId}:`, error);
        }
      }
    });

    await Promise.all(promises);
    console.log(`Successfully preloaded ${imageIds.length} images`);
  } catch (error) {
    console.error('Error preloading images:', error);
  }
}

/**
 * Clear image URL cache
 * Useful when images are updated or deleted
 */
export function clearImageCache(imageId?: string): void {
  if (imageId) {
    imageUrlCache.delete(imageId);
    console.log('Cleared cache for image:', imageId);
  } else {
    imageUrlCache.clear();
    console.log('Cleared entire image cache');
  }
}

export async function deleteImageRecord(imageId: string): Promise<boolean> {
  try {
    console.log('Deleting image record from database:', imageId);
    
    // Clear cache for this image
    clearImageCache(imageId);
    
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

/**
 * Fetch all notes with images for story reels
 * This queries the database directly to get all recalls that have at least one image
 * 
 * @param userId - The user ID to fetch notes for
 * @param limit - Maximum number of notes to fetch (default: 10)
 * @returns Promise with array of notes with images
 */
export async function fetchNotesWithImagesForReels(userId: string, limit: number = 10): Promise<any[]> {
  try {
    console.log('=== Fetching notes with images for story reels ===');
    console.log('User ID:', userId);
    console.log('Limit:', limit);

    // First, get all recall IDs that have images
    const { data: recallsWithImages, error: recallsError } = await supabase
      .from('recall_images')
      .select('recall_id')
      .eq('user_id', userId);

    if (recallsError) {
      console.error('Error fetching recalls with images:', recallsError);
      return [];
    }

    if (!recallsWithImages || recallsWithImages.length === 0) {
      console.log('No recalls with images found');
      return [];
    }

    // Get unique recall IDs
    const uniqueRecallIds = [...new Set(recallsWithImages.map(r => r.recall_id))];
    console.log(`Found ${uniqueRecallIds.length} unique recalls with images`);

    // Fetch the recall details for these IDs
    const { data: recallsData, error: recallDetailsError } = await supabase
      .from('recalls')
      .select('*')
      .in('id', uniqueRecallIds)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (recallDetailsError) {
      console.error('Error fetching recall details:', recallDetailsError);
      return [];
    }

    if (!recallsData || recallsData.length === 0) {
      console.log('No recall details found');
      return [];
    }

    console.log(`Fetched ${recallsData.length} recalls with images`);

    // Load images for each recall
    const notesWithImages = await Promise.all(
      recallsData.map(async (recall) => {
        try {
          const { data: imagesData, error: imagesError } = await supabase
            .from('recall_images')
            .select('id')
            .eq('recall_id', recall.id)
            .order('created_at', { ascending: true });

          if (imagesError) {
            console.error('Error loading images for recall:', recall.id, imagesError);
            return { ...recall, images: [], imageIds: [] };
          }

          const imageResults = await Promise.all(
            (imagesData || []).map(async (img) => {
              try {
                const dataUrl = await getImageDataUrl(img.id);
                if (!dataUrl) {
                  return { url: '', id: img.id };
                }
                return { url: dataUrl, id: img.id };
              } catch (error) {
                console.error(`Exception processing image ${img.id}:`, error);
                return { url: '', id: img.id };
              }
            })
          );

          const validImageUrls = imageResults.filter(result => result.url !== '').map(result => result.url);
          const imageIds = imageResults.map(result => result.id);
          
          return { 
            ...recall, 
            images: validImageUrls, 
            imageIds: imageIds
          };
        } catch (error) {
          console.error(`Exception processing recall ${recall.id}:`, error);
          return { ...recall, images: [], imageIds: [] };
        }
      })
    );

    // Filter out notes without valid images
    const validNotes = notesWithImages.filter(note => note.images && note.images.length > 0);
    
    // Randomize the order
    const shuffledNotes = [...validNotes].sort(() => Math.random() - 0.5);
    
    // Take up to the limit
    const limitedNotes = shuffledNotes.slice(0, limit);
    
    console.log(`Returning ${limitedNotes.length} randomized notes with images for story reels`);
    
    return limitedNotes;
  } catch (error) {
    console.error('Exception in fetchNotesWithImagesForReels:', error);
    return [];
  }
}

/**
 * Trigger OCR processing for an image
 * This calls the Supabase Edge Function to process the image with OpenAI Vision API
 * 
 * @param imageId - The ID of the image in the recall_images table
 * @returns Promise with success status and optional error message
 */
export async function triggerOCRProcessing(imageId: string): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    console.log('=== Triggering OCR processing ===');
    console.log('Image ID:', imageId);

    const { data, error } = await supabase.functions.invoke('ocr-image', {
      body: { 
        record: { id: imageId } 
      },
    });

    if (error) {
      console.error('Error invoking OCR function:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to invoke OCR function' 
      };
    }

    console.log('OCR function invoked successfully');
    console.log('Response:', data);
    
    return { 
      success: true, 
      data 
    };
  } catch (error) {
    console.error('Exception in triggerOCRProcessing:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get OCR results for an image
 * Fetches the processed OCR text and explanation from the database
 * 
 * @param imageId - The ID of the image in the recall_images table
 * @returns Promise with OCR results or null if not found/error
 */
export async function getImageOCRResults(imageId: string): Promise<{
  ocrText?: string;
  explanation?: string;
  processedAt?: string;
  isProcessing?: boolean;
} | null> {
  try {
    console.log('Fetching OCR results for image:', imageId);

    const { data, error } = await supabase
      .from('recall_images')
      .select('ocr_text, image_explanation, processed_at, created_at')
      .eq('id', imageId)
      .single();

    if (error) {
      console.error('Error fetching OCR results:', error);
      return null;
    }

    if (!data) {
      console.error('No data found for image:', imageId);
      return null;
    }

    // Determine if the image is still being processed
    const isProcessing = !data.processed_at && data.created_at;
    
    console.log('OCR results fetched:', {
      hasOcrText: !!data.ocr_text,
      hasExplanation: !!data.image_explanation,
      processedAt: data.processed_at,
      isProcessing,
    });

    return {
      ocrText: data.ocr_text,
      explanation: data.image_explanation,
      processedAt: data.processed_at,
      isProcessing,
    };
  } catch (error) {
    console.error('Exception in getImageOCRResults:', error);
    return null;
  }
}

/**
 * Batch get OCR results for multiple images
 * Useful for displaying OCR data for all images in a note
 * 
 * @param imageIds - Array of image IDs
 * @returns Promise with map of imageId to OCR results
 */
export async function getBatchImageOCRResults(imageIds: string[]): Promise<Map<string, {
  ocrText?: string;
  explanation?: string;
  processedAt?: string;
  isProcessing?: boolean;
}>> {
  try {
    if (imageIds.length === 0) {
      return new Map();
    }

    console.log('Fetching batch OCR results for', imageIds.length, 'images');

    const { data, error } = await supabase
      .from('recall_images')
      .select('id, ocr_text, image_explanation, processed_at, created_at')
      .in('id', imageIds);

    if (error) {
      console.error('Error fetching batch OCR results:', error);
      return new Map();
    }

    const resultsMap = new Map();
    
    if (data) {
      data.forEach(item => {
        const isProcessing = !item.processed_at && item.created_at;
        resultsMap.set(item.id, {
          ocrText: item.ocr_text,
          explanation: item.image_explanation,
          processedAt: item.processed_at,
          isProcessing,
        });
      });
    }

    console.log('Batch OCR results fetched for', resultsMap.size, 'images');
    
    return resultsMap;
  } catch (error) {
    console.error('Exception in getBatchImageOCRResults:', error);
    return new Map();
  }
}

/**
 * Retry OCR processing for a failed image
 * Useful if the initial processing failed or timed out
 * 
 * @param imageId - The ID of the image to reprocess
 * @returns Promise with success status
 */
export async function retryOCRProcessing(imageId: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('Retrying OCR processing for image:', imageId);

    // Clear any existing OCR data to indicate reprocessing
    const { error: clearError } = await supabase
      .from('recall_images')
      .update({
        ocr_text: null,
        image_explanation: null,
        processed_at: null,
      })
      .eq('id', imageId);

    if (clearError) {
      console.error('Error clearing OCR data:', clearError);
      return { success: false, error: 'Failed to clear existing OCR data' };
    }

    // Trigger new processing
    return await triggerOCRProcessing(imageId);
  } catch (error) {
    console.error('Exception in retryOCRProcessing:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
