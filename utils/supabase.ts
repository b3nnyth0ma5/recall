import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

// Initialize constants at module scope
const supabaseUrl = (Constants.expoConfig?.extra?.supabaseUrl as string) ?? '';
const supabaseAnonKey = (Constants.expoConfig?.extra?.supabaseAnonKey as string) ?? '';

// Create and export supabase client at module scope with improved error handling
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // We handle URL-based sessions manually in update-password.tsx
  },
});

// Add global error handler for auth errors
supabase.auth.onAuthStateChange((event, session) => {
  console.log('[Supabase Auth] Event:', event);
  
  if (event === 'TOKEN_REFRESHED') {
    console.log('[Supabase Auth] Token refreshed successfully');
    if (session) {
      console.log('[Supabase Auth] Session expires at:', new Date(session.expires_at || 0).toISOString());
    }
  } else if (event === 'SIGNED_OUT') {
    console.log('[Supabase Auth] User signed out');
  } else if (event === 'SIGNED_IN') {
    console.log('[Supabase Auth] User signed in');
    if (session) {
      console.log('[Supabase Auth] Session expires at:', new Date(session.expires_at || 0).toISOString());
    }
  } else if (event === 'PASSWORD_RECOVERY') {
    console.log('[Supabase Auth] Password recovery session established');
    if (session) {
      console.log('[Supabase Auth] Recovery session expires at:', new Date(session.expires_at || 0).toISOString());
    }
  } else if (event === 'INITIAL_SESSION') {
    console.log('[Supabase Auth] Initial session loaded');
    if (session) {
      console.log('[Supabase Auth] Session user:', session.user?.email);
      console.log('[Supabase Auth] Session expires at:', new Date(session.expires_at || 0).toISOString());
    } else {
      console.log('[Supabase Auth] No initial session found');
    }
  }
});

// Add error logging for refresh token issues
const originalRefreshSession = supabase.auth.refreshSession.bind(supabase.auth);
supabase.auth.refreshSession = async () => {
  try {
    console.log('[Supabase Auth] Attempting to refresh session...');
    const result = await originalRefreshSession();
    
    if (result.error) {
      console.error('[Supabase Auth] Refresh session error:', result.error);
      
      // If refresh token is invalid, clear the session
      if (result.error.message?.includes('Invalid Refresh Token') || 
          result.error.message?.includes('Refresh Token Not Found')) {
        console.log('[Supabase Auth] Invalid refresh token detected - clearing session');
        await supabase.auth.signOut();
      }
    } else {
      console.log('[Supabase Auth] Session refreshed successfully');
    }
    
    return result;
  } catch (error) {
    console.error('[Supabase Auth] Exception during session refresh:', error);
    throw error;
  }
};

export async function uploadImageToDatabase(
  uri: string,
  recallId: string,
  contentType: string = 'image/jpeg'
): Promise<string | null> {
  try {
    console.log('=== Starting image upload to Cloudflare CDN ===');
    console.log('URI:', uri);
    console.log('Recall ID:', recallId);
    console.log('Content Type:', contentType);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('No active session - user must be logged in to upload images');
      return null;
    }
    console.log('User authenticated:', session.user.id);

    console.log('Converting image to base64...');
    // Use the legacy File API from expo-file-system
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log('Base64 conversion successful, length:', base64.length);

    // Upload to Cloudflare CDN
    const { uploadImageToCloudflare } = await import('./cloudflareCDN');
    const fileName = `image-${Date.now()}-${Math.random().toString(36).substring(7)}.${contentType.split('/')[1]}`;
    
    console.log('Uploading to Cloudflare CDN with filename:', fileName);
    const cdnUrl = await uploadImageToCloudflare(base64, fileName, contentType);
    
    if (!cdnUrl) {
      console.error('Failed to upload to Cloudflare CDN - no URL returned');
      return null;
    }

    console.log('CDN upload successful, URL:', cdnUrl);
    console.log('Storing metadata in database...');
    
    // Store the CDN URL in the database
    const { data, error } = await supabase
      .from('recall_images')
      .insert([{
        recall_id: recallId,
        content_type: contentType,
        user_id: session.user.id,
        cdn_url: cdnUrl,
      }])
      .select('id')
      .single();

    if (error) {
      console.error('=== Database insert error ===');
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      // Try to clean up the CDN upload
      console.log('Attempting to clean up CDN upload...');
      const { deleteImageFromCloudflare } = await import('./cloudflareCDN');
      const cleanupSuccess = await deleteImageFromCloudflare(cdnUrl);
      console.log('CDN cleanup', cleanupSuccess ? 'successful' : 'failed');
      
      return null;
    }

    console.log('=== Upload successful ===');
    console.log('Image ID:', data.id);
    console.log('CDN URL:', cdnUrl);
    console.log('Recall ID:', recallId);
    
    // NOTE: OCR processing is automatically triggered by the database trigger
    // No need to manually call triggerOCRProcessing here
    console.log('OCR processing will be automatically triggered by database trigger');
    console.log('Database trigger: trigger-ocr-on-image-insert');
    
    return data.id;
  } catch (error) {
    console.error('=== Exception in uploadImageToDatabase ===');
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Error name:', error.name);
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
      .select('cdn_url')
      .eq('id', imageId)
      .single();

    if (error) {
      console.error('Error fetching image data for ID:', imageId);
      console.error('Error details:', error);
      return null;
    }

    if (!data) {
      console.error('No data found for ID:', imageId);
      return null;
    }

    // Return CDN URL
    if (data.cdn_url) {
      console.log('Using CDN URL for image:', imageId);
      return data.cdn_url;
    }

    console.error('No CDN URL found for ID:', imageId);
    return null;
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
    
    // First, get the CDN URL and recall_id if it exists
    const { data: imageData, error: fetchError } = await supabase
      .from('recall_images')
      .select('cdn_url, recall_id')
      .eq('id', imageId)
      .single();

    if (fetchError) {
      console.error('Error fetching image data for deletion:', fetchError);
    }

    const recallId = imageData?.recall_id;

    // Delete from Cloudflare CDN if URL exists
    if (imageData?.cdn_url) {
      console.log('Deleting from Cloudflare CDN...');
      const { deleteImageFromCloudflare } = await import('./cloudflareCDN');
      const cdnDeleted = await deleteImageFromCloudflare(imageData.cdn_url);
      if (!cdnDeleted) {
        console.warn('Failed to delete from CDN, but continuing with database deletion');
      } else {
        console.log('Successfully deleted from CDN');
      }
    }
    
    // Delete from database
    const { error } = await supabase
      .from('recall_images')
      .delete()
      .eq('id', imageId);

    if (error) {
      console.error('Error deleting image record:', error);
      return false;
    }

    console.log('Image record deleted successfully');

    // Trigger category matching after image deletion
    if (recallId) {
      console.log('Triggering category matching after image deletion for recall:', recallId);
      triggerCategoryMatching(recallId).then(result => {
        if (result.success) {
          console.log('Category matching triggered successfully after image deletion');
        } else {
          console.error('Failed to trigger category matching:', result.error);
        }
      }).catch(err => {
        console.error('Exception while triggering category matching:', err);
      });
    }

    return true;
  } catch (error) {
    console.error('Error in deleteImageRecord:', error);
    return false;
  }
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  try {
    // Try Google Places API first
    const { reverseGeocodeGoogle, isGooglePlacesConfigured } = await import('./googlePlaces');
    
    if (isGooglePlacesConfigured()) {
      console.log('Using Google Places API for reverse geocoding');
      const result = await reverseGeocodeGoogle(latitude, longitude);
      if (result !== 'Unknown Location') {
        return result;
      }
      console.log('Google Places API returned Unknown Location, falling back to OpenStreetMap');
    } else {
      console.log('Google Places API not configured, using OpenStreetMap');
    }

    // Fallback to OpenStreetMap Nominatim
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

export async function updateSearchHistoryCollage(
  userId: string,
  searchText: string,
  collageCdnUrl: string,
): Promise<void> {
  try {
    if (!searchText.trim()) return;
    console.log('[updateSearchHistoryCollage] Updating collage for search:', searchText.trim());
    const { error } = await supabase
      .from('search_history')
      .update({ collage_cdn_url: collageCdnUrl, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('search_text', searchText.trim());
    if (error) console.error('Error updating search_history collage:', error);
  } catch (e) {
    console.error('Exception in updateSearchHistoryCollage:', e);
  }
}

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

export async function triggerOCRProcessing(imageId: string): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    console.log('=== Manually triggering OCR processing ===');
    console.log('Image ID:', imageId);
    console.log('Note: OCR is normally triggered automatically by database trigger');

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

export async function triggerCategoryMatching(recallId: string): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    console.log('=== Triggering category matching ===');
    console.log('Recall ID:', recallId);

    const { data, error } = await supabase.functions.invoke('match-recollection-category', {
      body: { 
        recallId: recallId 
      },
    });

    if (error) {
      console.error('Error invoking category matching function:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to invoke category matching function' 
      };
    }

    console.log('Category matching function invoked successfully');
    console.log('Response:', data);
    
    return { 
      success: true, 
      data 
    };
  } catch (error) {
    console.error('Exception in triggerCategoryMatching:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function triggerRecallEmbedding(
  recallId: string,
  text?: string,
  location?: string,
  locationPrimaryType?: string
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    console.log('=== Triggering recall embedding generation ===');
    console.log('Recall ID:', recallId);

    const requestBody: any = { recall_id: recallId };
    
    // Include optional parameters if provided
    if (text !== undefined) {
      requestBody.text = text;
    }
    if (location !== undefined) {
      requestBody.location = location;
    }
    if (locationPrimaryType !== undefined) {
      requestBody.location_primary_type = locationPrimaryType;
    }

    const { data, error } = await supabase.functions.invoke('embedding-recall', {
      body: requestBody,
    });

    if (error) {
      console.error('Error invoking embedding-recall function:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to invoke embedding-recall function' 
      };
    }

    console.log('Embedding-recall function invoked successfully');
    console.log('Response:', data);
    
    return { 
      success: true, 
      data 
    };
  } catch (error) {
    console.error('Exception in triggerRecallEmbedding:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function triggerPeopleFinder(
  recallId: string,
  userId: string,
  text?: string,
  imageExplanation?: string
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    console.log('=== Triggering people-finder ===');
    console.log('Recall ID:', recallId);
    console.log('User ID:', userId);

    const requestBody: any = { 
      recall_id: recallId,
      user_id: userId,
    };
    
    // Include optional parameters if provided
    if (text !== undefined && text.trim().length > 0) {
      requestBody.text = text;
    }
    if (imageExplanation !== undefined && imageExplanation.trim().length > 0) {
      requestBody.image_explanation = imageExplanation;
    }

    const { data, error } = await supabase.functions.invoke('people-finder', {
      body: requestBody,
    });

    if (error) {
      console.error('Error invoking people-finder function:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to invoke people-finder function' 
      };
    }

    console.log('People-finder function invoked successfully');
    console.log('Response:', data);
    
    return { 
      success: true, 
      data 
    };
  } catch (error) {
    console.error('Exception in triggerPeopleFinder:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// ============================================================
// Document utilities
// ============================================================

export async function uploadDocumentToDatabase(
  noteId: string,
  fileUri: string,
  thumbnailUri: string | undefined,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<{ id: string; cdn_url?: string } | null> {
  try {
    console.log('=== Starting document upload ===');
    console.log('Note ID:', noteId);
    console.log('File name:', fileName);
    console.log('Content type:', contentType);
    console.log('File size:', fileSize);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('[uploadDocumentToDatabase] No active session');
      return null;
    }

    // Read file as base64
    console.log('[uploadDocumentToDatabase] Reading file as base64...');
    const base64Data = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log('[uploadDocumentToDatabase] Base64 length:', base64Data.length);

    // Insert a row into recall_documents first (without cdn_url — edge function will update it)
    const { data: docRow, error: insertError } = await supabase
      .from('recall_documents')
      .insert([{
        recall_id: noteId,
        user_id: session.user.id,
        file_name: fileName,
        file_size: fileSize,
        content_type: contentType,
      }])
      .select('id')
      .single();

    if (insertError || !docRow) {
      console.error('[uploadDocumentToDatabase] Insert error:', insertError);
      return null;
    }

    console.log('[uploadDocumentToDatabase] Document row created, id:', docRow.id);

    // Call cloudflare-upload-document edge function
    console.log('[uploadDocumentToDatabase] Calling cloudflare-upload-document edge function...');
    const { data: uploadData, error: uploadError } = await supabase.functions.invoke('cloudflare-upload-document', {
      body: {
        base64Data,
        fileName,
        contentType,
        userId: session.user.id,
        documentId: docRow.id,
      },
    });

    if (uploadError) {
      console.error('[uploadDocumentToDatabase] Edge function error:', uploadError);
      // Row was inserted but upload failed — leave it for retry
      return { id: docRow.id };
    }

    const cdnUrl: string | undefined = uploadData?.cdnUrl;
    console.log('[uploadDocumentToDatabase] CDN URL:', cdnUrl);

    // Upload thumbnail if present (PDF)
    let thumbnailPersisted = false;
    if (thumbnailUri) {
      try {
        console.log('[uploadDocumentToDatabase] Uploading PDF thumbnail from:', thumbnailUri);
        const thumbBase64 = await FileSystem.readAsStringAsync(thumbnailUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const thumbFileName = `thumb-${docRow.id}.jpg`;
        const { uploadImageToCloudflare } = await import('./cloudflareCDN');
        const thumbCdnUrl = await uploadImageToCloudflare(thumbBase64, thumbFileName, 'image/jpeg');
        if (thumbCdnUrl) {
          const { error: thumbUpdateError } = await supabase
            .from('recall_documents')
            .update({ thumbnail_url: thumbCdnUrl })
            .eq('id', docRow.id);
          if (thumbUpdateError) {
            console.error('[uploadDocumentToDatabase] ❌ Failed to persist thumbnail_url:', thumbUpdateError);
          } else {
            thumbnailPersisted = true;
            console.log('[uploadDocumentToDatabase] ✅ thumbnail_url persisted:', thumbCdnUrl);
          }
        } else {
          console.warn('[uploadDocumentToDatabase] ⚠️ uploadImageToCloudflare returned null/undefined for thumbnail — server-side fallback will handle it');
        }
      } catch (thumbErr) {
        console.error('[uploadDocumentToDatabase] ❌ Thumbnail upload failed (non-fatal):', thumbErr);
        // Don't block document upload — server-side fallback will fill thumbnail_url
      }
    }

    console.log(`=== Document upload complete — thumbnail_url persisted: ${thumbnailPersisted} ===`);
    return { id: docRow.id, cdn_url: cdnUrl };
  } catch (error) {
    console.error('[uploadDocumentToDatabase] Exception:', error);
    return null;
  }
}

export async function getDocumentSignedUrl(cdnUrl: string): Promise<string | null> {
  try {
    if (!cdnUrl) return null;
    // If it's already an https URL (CDN), return as-is
    if (cdnUrl.startsWith('https://')) {
      return cdnUrl;
    }
    // Otherwise treat as a Supabase Storage path
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(cdnUrl, 3600); // 1 hour TTL
    if (error) {
      console.error('[getDocumentSignedUrl] Error creating signed URL:', error);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (error) {
    console.error('[getDocumentSignedUrl] Exception:', error);
    return null;
  }
}

export async function deleteDocumentRecord(documentId: string): Promise<boolean> {
  try {
    console.log('[deleteDocumentRecord] Deleting document:', documentId);
    const { error } = await supabase
      .from('recall_documents')
      .delete()
      .eq('id', documentId);
    if (error) {
      console.error('[deleteDocumentRecord] Error:', error);
      return false;
    }
    console.log('[deleteDocumentRecord] Deleted successfully');
    return true;
  } catch (error) {
    console.error('[deleteDocumentRecord] Exception:', error);
    return false;
  }
}

export async function getDocumentAnalysis(documentId: string): Promise<{
  ocrText: string | undefined;
  explanation: string | undefined;
  processedAt: string | undefined;
  isProcessing: boolean;
} | null> {
  try {
    console.log('[getDocumentAnalysis] Fetching analysis for document:', documentId);
    const { data, error } = await supabase
      .from('recall_documents')
      .select('extracted_text, doc_explanation, processed_at, created_at')
      .eq('id', documentId)
      .single();
    if (error) {
      console.error('[getDocumentAnalysis] Error:', error);
      return null;
    }
    const result = {
      ocrText: data.extracted_text ?? undefined,
      explanation: data.doc_explanation ?? undefined,
      processedAt: data.processed_at ?? undefined,
      isProcessing: !data.processed_at && !!data.created_at,
    };
    console.log('[getDocumentAnalysis] Result — processedAt:', result.processedAt, 'isProcessing:', result.isProcessing);
    return result;
  } catch (error) {
    console.error('[getDocumentAnalysis] Exception:', error);
    return null;
  }
}

export async function fetchDocumentsForNote(noteId: string): Promise<any[]> {
  try {
    console.log('[fetchDocumentsForNote] Fetching documents for note:', noteId);
    const { data, error } = await supabase
      .from('recall_documents')
      .select('*')
      .eq('recall_id', noteId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[fetchDocumentsForNote] Error:', error);
      return [];
    }
    console.log('[fetchDocumentsForNote] Found', data?.length ?? 0, 'documents');
    return data ?? [];
  } catch (error) {
    console.error('[fetchDocumentsForNote] Exception:', error);
    return [];
  }
}

export async function batchUploadImagesToCloudflare(batchSize: number = 100): Promise<{
  success: boolean;
  processed: number;
  updated: number;
  failed: number;
  errors: { imageId: string; error: string }[];
}> {
  try {
    console.log('=== Starting batch upload to Cloudflare ===');
    console.log('Batch size:', batchSize);

    // Note: This function is deprecated as all new images are uploaded directly to CDN
    // Keeping for backward compatibility with any legacy data
    console.log('Note: All new images are uploaded directly to Cloudflare CDN');

    return {
      success: true,
      processed: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };
  } catch (error) {
    console.error('Exception in batchUploadImagesToCloudflare:', error);
    return {
      success: false,
      processed: 0,
      updated: 0,
      failed: 0,
      errors: [
        {
          imageId: 'exception',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      ],
    };
  }
}
