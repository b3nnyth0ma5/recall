import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';
import { Platform, Image } from 'react-native';
import { coalesce } from './requestCoalescer';

// Initialize constants at module scope
const supabaseUrl =
  (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ?? '';
const supabaseAnonKey =
  (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  // Loud, actionable startup error instead of a deep "supabaseUrl is required" stack later.
  const missing = [
    !supabaseUrl ? 'supabaseUrl' : null,
    !supabaseAnonKey ? 'supabaseAnonKey' : null,
  ].filter(Boolean).join(', ');
  const msg =
    `[Supabase] Missing required runtime config: ${missing}. ` +
    `Add these keys to expo.extra in app.json (or app.config.*). ` +
    `Without them, every Supabase call will throw.`;
  console.error(msg);
  // Don't `throw` here — the app's own ErrorBoundary already handles thrown
  // errors poorly during early module init on iOS. createClient() will throw
  // its own clear error on the first call, which is fine; the console.error
  // above is the real diagnostic.
}

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

    // Copy to stable cache path before upload (temp file may be deleted after upload)
    const stableUri = `${FileSystem.cacheDirectory}face-detect-${Date.now()}.jpg`;
    try {
      await FileSystem.copyAsync({ from: uri, to: stableUri });
      console.log('[uploadImageToDatabase] Copied to stable URI for face detection:', stableUri);
    } catch (copyErr) {
      console.warn('[uploadImageToDatabase] Could not copy to stable URI, face detection will be skipped:', copyErr);
    }

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

    // Measure original image dimensions from local URI
    let imageWidth: number | null = null;
    let imageHeight: number | null = null;
    await new Promise<void>((resolve) => {
      Image.getSize(
        uri,
        (w, h) => { imageWidth = w; imageHeight = h; resolve(); },
        () => { resolve(); } // non-fatal if it fails
      );
    });
    console.log('Image dimensions measured:', imageWidth, 'x', imageHeight);

    // Store the CDN URL in the database
    const { data, error } = await supabase
      .from('recall_images')
      .insert([{
        recall_id: recallId,
        content_type: contentType,
        user_id: session.user.id,
        cdn_url: cdnUrl,
        width: imageWidth,
        height: imageHeight,
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

    // Fire-and-forget face detection + embedding extraction + auto-matching
    // Uses stable cache file URI to avoid JSI bridge truncation of large base64 strings
    if (Platform.OS === 'ios') {
      const imageRowId = data.id;
      const userId = session.user.id;
      // stableUri captured in closure — copied before CDN upload above
      (async () => {
        try {
          const { detectFacesOnDevice, extractFaceEmbeddingOnDevice } = await import('@/modules/recall-native');
          const Toast = (await import('react-native-toast-message')).default;
          console.log('[uploadImageToDatabase] Starting face detection from stable URI:', stableUri);
          const faces = await detectFacesOnDevice(stableUri);
          if (faces && faces.length > 0) {
            console.log(`[uploadImageToDatabase] Detected ${faces.length} face(s), storing in recall_images_people`);
            const faceRows = faces.map(f => ({
              recall_image_id: imageRowId,
              recall_id: recallId,
              user_id: userId,
              face_uuid: f.faceUuid,
              bbox_x: f.bboxX,
              bbox_y: f.bboxY,
              bbox_w: f.bboxW,
              bbox_h: f.bboxH,
              roll: f.roll,
              yaw: f.yaw,
            }));
            const { data: insertedFaces, error: faceInsertError } = await supabase
              .from('recall_images_people')
              .insert(faceRows)
              .select('id, face_uuid, bbox_x, bbox_y, bbox_w, bbox_h');
            if (faceInsertError) {
              console.warn('[uploadImageToDatabase] Face insert error (non-fatal):', faceInsertError);
              Toast.show({
                type: 'info',
                text1: 'Face detection unavailable',
                position: 'bottom',
                visibilityTime: 3000,
              });
            } else {
              console.log('[uploadImageToDatabase] Face rows inserted successfully');
              const faceCount = faces.length;
              Toast.show({
                type: 'success',
                text1: `${faceCount} ${faceCount === 1 ? 'face' : 'faces'} detected`,
                position: 'bottom',
                visibilityTime: 3000,
              });

              // Extract embeddings and run auto-matching for each face
              for (const insertedFace of (insertedFaces ?? [])) {
                try {
                  console.log('[uploadImageToDatabase] Extracting embedding for face:', insertedFace.id);
                  const embedding = await extractFaceEmbeddingOnDevice(
                    stableUri,
                    insertedFace.bbox_x,
                    insertedFace.bbox_y,
                    insertedFace.bbox_w,
                    insertedFace.bbox_h,
                  );

                  if (embedding && embedding.length > 0) {
                    const vectorString = `[${embedding.join(',')}]`;
                    console.log('[uploadImageToDatabase] Got embedding, updating face row:', insertedFace.id);

                    // Store embedding on the face row
                    const { error: embeddingUpdateError } = await supabase
                      .from('recall_images_people')
                      .update({ face_embedding: vectorString })
                      .eq('id', insertedFace.id);
                    if (embeddingUpdateError) {
                      console.warn('[uploadImageToDatabase] Embedding update error (non-fatal):', embeddingUpdateError);
                    }

                    // Run auto-match RPC
                    console.log('[uploadImageToDatabase] Running match_face_to_person RPC for face:', insertedFace.id);
                    const { data: matchResult, error: matchError } = await supabase.rpc('match_face_to_person', {
                      p_embedding: vectorString,
                      p_threshold: 0.75,
                    });
                    if (matchError) {
                      console.warn('[uploadImageToDatabase] match_face_to_person RPC error (non-fatal):', matchError);
                    } else {
                      // RETURNS TABLE comes back as an array of up to 3 ranked rows
                      const matchRows = Array.isArray(matchResult) ? matchResult : (matchResult ? [matchResult] : []);
                      const top1 = matchRows.find((r: any) => r.rank === 1);
                      const top2 = matchRows.find((r: any) => r.rank === 2);
                      const top3 = matchRows.find((r: any) => r.rank === 3);

                      if (top1 && top1.person_id) {
                        console.log('[uploadImageToDatabase] Auto-match top1:', top1.person_id, 'similarity:', top1.best_similarity);
                        const updatePayload: any = {
                          suggested_person_id: top1.person_id,
                          match_confidence: top1.best_similarity,
                        };
                        if (top2?.person_id) {
                          updatePayload.suggested_person_id_2 = top2.person_id;
                          updatePayload.match_confidence_2 = top2.best_similarity;
                        }
                        if (top3?.person_id) {
                          updatePayload.suggested_person_id_3 = top3.person_id;
                          updatePayload.match_confidence_3 = top3.best_similarity;
                        }
                        const { error: suggestionUpdateError } = await supabase
                          .from('recall_images_people')
                          .update(updatePayload)
                          .eq('id', insertedFace.id);
                        if (suggestionUpdateError) {
                          console.warn('[uploadImageToDatabase] Suggestion update error (non-fatal):', suggestionUpdateError);
                        } else {
                          console.log('[uploadImageToDatabase] Suggestion stored for face:', insertedFace.id);
                        }
                      } else {
                        console.log('[uploadImageToDatabase] No auto-match found for face:', insertedFace.id);
                      }
                    }
                  } else {
                    console.log('[uploadImageToDatabase] No embedding returned for face:', insertedFace.id);
                  }
                } catch (embeddingErr) {
                  console.warn('[uploadImageToDatabase] Embedding/match error for face (non-fatal):', insertedFace.id, embeddingErr);
                }
              }
            }
          } else {
            console.log('[uploadImageToDatabase] No faces detected');
            Toast.show({
              type: 'info',
              text1: 'No faces detected in this image',
              position: 'bottom',
              visibilityTime: 3000,
            });
          }
        } catch (e) {
          console.warn('[uploadImageToDatabase] Face detection failed (non-fatal):', e);
          const Toast = (await import('react-native-toast-message')).default;
          Toast.show({
            type: 'info',
            text1: 'Face detection unavailable',
            position: 'bottom',
            visibilityTime: 3000,
          });
        } finally {
          // Clean up stable cache file
          try { await FileSystem.deleteAsync(stableUri, { idempotent: true }); } catch {}
        }
      })();
    }

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

/**
 * Delete a single search-history row for the given user.
 * Fire-and-forget cleanup of the associated Cloudflare collage asset (if any)
 * is handled separately by the caller via the cloudflare-delete edge function.
 */
export async function deleteSearchHistory(
  userId: string,
  searchHistoryId: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('search_history')
      .delete()
      .eq('id', searchHistoryId)
      .eq('user_id', userId);
    if (error) {
      console.error('Error deleting search_history row:', error);
      throw error;
    }
  } catch (e) {
    console.error('Exception in deleteSearchHistory:', e);
    throw e;
  }
}

/**
 * Save search_history_uploads rows and mark has_uploads=true on the search_history row.
 * Call this after OCR processing is complete, before triggering the search.
 */
export async function saveSearchHistoryUploads(
  userId: string,
  searchText: string,
  uploads: { text: string; explanation: string; type?: string; cdn_url?: string | null }[],
): Promise<void> {
  try {
    if (!searchText.trim() || uploads.length === 0) return;

    console.log('[saveSearchHistoryUploads] Saving', uploads.length, 'uploads for search:', searchText.trim());

    // Try to find existing row first
    let { data: historyRow, error: fetchError } = await supabase
      .from('search_history')
      .select('id')
      .eq('user_id', userId)
      .eq('search_text', searchText.trim())
      .maybeSingle();

    // If not found yet (race condition: saveSearchHistory is fire-and-forget), upsert it now
    if (!historyRow) {
      console.log('[saveSearchHistoryUploads] Row not found, upserting search_history row');
      const { data: upserted, error: upsertError } = await supabase
        .from('search_history')
        .upsert(
          {
            user_id: userId,
            search_text: searchText.trim(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,search_text', ignoreDuplicates: false }
        )
        .select('id')
        .single();

      if (upsertError || !upserted) {
        console.error('[saveSearchHistoryUploads] Could not upsert search_history row:', upsertError);
        return;
      }
      historyRow = upserted;
    }

    const searchHistoryId = historyRow.id;

    // Insert upload rows
    const rows = uploads.map((u) => ({
      search_history_id: searchHistoryId,
      type: u.type ?? 'image',
      text: u.text ?? null,
      explanation: u.explanation ?? null,
      cdn_url: u.cdn_url ?? null,
    }));

    const { error: insertError } = await supabase
      .from('search_history_uploads')
      .insert(rows);

    if (insertError) {
      console.error('[saveSearchHistoryUploads] Insert error:', insertError);
      return;
    }

    // Mark has_uploads = true
    const { error: updateError } = await supabase
      .from('search_history')
      .update({ has_uploads: true, updated_at: new Date().toISOString() })
      .eq('id', searchHistoryId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('[saveSearchHistoryUploads] Update has_uploads error:', updateError);
    } else {
      console.log('[saveSearchHistoryUploads] Saved successfully, searchHistoryId:', searchHistoryId);
    }

    // Generate a composite collage via the edge function and save it — fire-and-forget
    const cdnUrls = uploads
      .map(u => u.cdn_url)
      .filter((u): u is string => !!u)
      .slice(0, 4);

    if (cdnUrls.length > 0) {
      (async () => {
        try {
          console.log('[saveSearchHistoryUploads] Generating search collage for', cdnUrls.length, 'image(s)');
          const { data: collageData, error: collageError } = await supabase.functions.invoke(
            'generate-search-collage',
            { body: { userId, searchText: searchText.trim(), imageUrls: cdnUrls, previousCollageCdnUrl: null } },
          );
          if (collageError || !collageData?.success) {
            console.warn('[saveSearchHistoryUploads] Collage generation failed (non-fatal):', collageError ?? collageData?.reason);
            return;
          }
          const { error: updateError } = await supabase
            .from('search_history')
            .update({ collage_cdn_url: collageData.collageCdnUrl, updated_at: new Date().toISOString() })
            .eq('id', searchHistoryId)
            .eq('user_id', userId);
          if (updateError) {
            console.warn('[saveSearchHistoryUploads] collage_cdn_url update error (non-fatal):', updateError);
          } else {
            console.log('[saveSearchHistoryUploads] collage_cdn_url saved:', collageData.collageCdnUrl);
          }
        } catch (err) {
          console.warn('[saveSearchHistoryUploads] Collage generation exception (non-fatal):', err);
        }
      })();
    }
  } catch (e) {
    console.error('[saveSearchHistoryUploads] Exception:', e);
  }
}

/**
 * Fetch search_history_uploads for a given search_history row.
 */
export async function getSearchHistoryUploads(
  searchHistoryId: string,
): Promise<{ text: string | null; explanation: string | null; type: string; cdn_url: string | null }[]> {
  try {
    console.log('[getSearchHistoryUploads] Fetching uploads for searchHistoryId:', searchHistoryId);
    const { data, error } = await supabase
      .from('search_history_uploads')
      .select('text, explanation, type, cdn_url')
      .eq('search_history_id', searchHistoryId);

    if (error) {
      console.error('[getSearchHistoryUploads] Error:', error);
      return [];
    }
    console.log('[getSearchHistoryUploads] Found', data?.length ?? 0, 'uploads');
    return data ?? [];
  } catch (e) {
    console.error('[getSearchHistoryUploads] Exception:', e);
    return [];
  }
}

/**
 * Fire-and-forget cleanup of a Cloudflare Images asset.
 * Extracts the image ID from a CDN URL of the form
 * `https://imagedelivery.net/<accountHash>/<imageId>/<variant>` and invokes
 * the `cloudflare-delete` edge function. Never throws.
 */
export async function cleanupCloudflareCollage(cdnUrl: string | null | undefined): Promise<void> {
  if (!cdnUrl || typeof cdnUrl !== 'string') return;
  try {
    // Extract image ID
    const parts = cdnUrl.split('/');
    const idx = parts.findIndex((p) => p === 'imagedelivery.net');
    if (idx === -1 || parts.length <= idx + 2) return;
    const imageId = parts[idx + 2];
    if (!imageId) return;

    // Fire-and-forget call to cloudflare-delete edge function.
    // Don't await; never let cleanup failures bubble up.
    supabase.functions.invoke('cloudflare-delete', {
      body: { imageId },
    }).catch((err) => {
      console.warn('[cleanupCloudflareCollage] cloudflare-delete invocation failed (non-fatal):', err);
    });
  } catch (e) {
    console.warn('[cleanupCloudflareCollage] Failed (non-fatal):', e);
  }
}

export async function fetchNotesWithImagesForReels(userId: string, limit: number = 10): Promise<any[]> {
  return coalesce(`reels:${userId}`, async () => {
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
      .select('id, user_id, text, latitude, longitude, location, location_primary_type, created_at, updated_at')
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
  }); // end coalesce
}

export async function triggerOCRProcessing(imageId: string): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    console.log('=== Manually triggering OCR processing ===');
    console.log('Image ID:', imageId);
    console.log('Note: OCR is normally triggered automatically by database trigger');

    // Check fast-search toggle and attempt on-device OCR
    let preExtractedOcrText: string | undefined;
    if (Platform.OS === 'ios') {
      try {
        const fastSearch = await AsyncStorage.getItem('search_mode_fast');
        if (fastSearch === 'true') {
          const { extractTextFromImageOnDevice } = await import('@/modules/recall-native');
          // imageId is a DB row ID, not a URI — we need the CDN URL
          // Fetch it from the DB first
          const { data: imgRow } = await supabase
            .from('recall_images')
            .select('cdn_url')
            .eq('id', imageId)
            .single();
          if (imgRow?.cdn_url) {
            const onDeviceText = await extractTextFromImageOnDevice(imgRow.cdn_url);
            if (onDeviceText !== null) {
              preExtractedOcrText = onDeviceText;
              console.log('[triggerOCRProcessing] On-device OCR text length:', preExtractedOcrText.length);
            } else {
              console.log('[triggerOCRProcessing] On-device OCR unavailable, falling back to cloud');
            }
          }
        }
      } catch (e) {
        console.warn('[triggerOCRProcessing] Fast-search toggle read failed:', e);
      }
    }

    const { data, error } = await supabase.functions.invoke('ocr-image', {
      body: { 
        record: { id: imageId },
        ...(preExtractedOcrText !== undefined ? { pre_extracted_ocr_text: preExtractedOcrText } : {}),
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

    // Check fast-search toggle and attempt on-device NER
    if (Platform.OS === 'ios') {
      try {
        const fastSearch = await AsyncStorage.getItem('search_mode_fast');
        if (fastSearch === 'true') {
          const { extractPeopleFromTextOnDevice } = await import('@/modules/recall-native');
          const combinedForNER = [text, imageExplanation].filter(Boolean).join(' ').trim();
          if (combinedForNER.length > 0) {
            const onDeviceNames = await extractPeopleFromTextOnDevice(combinedForNER);
            if (onDeviceNames !== null) {
              requestBody.pre_extracted_names = onDeviceNames;
              console.log('[triggerPeopleFinder] On-device NER result:', onDeviceNames);
            } else {
              console.log('[triggerPeopleFinder] On-device NER unavailable, falling back to cloud');
            }
          }
        }
      } catch (e) {
        console.warn('[triggerPeopleFinder] Fast-search toggle read failed:', e);
      }
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
  return coalesce(`documents:${noteId}`, async () => {
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
  });
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

