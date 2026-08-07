
import { Platform, Share as RNShare } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import Toast from 'react-native-toast-message';
import { Note } from '@/types/Note';
import { supabase } from '@/utils/supabase';

/**
 * Write a minimal solid-color BMP (64×64) to cacheDirectory and return its file:// URI.
 * Used as a fallback share-sheet thumbnail for document-only recalls.
 */
async function getDocTypeThumbnailUri(contentType: string): Promise<string | null> {
  try {
    // Brand colors per document type
    const colorMap: Record<string, [number, number, number]> = {
      'application/pdf':                                                    [220,  53,  69],
      'application/msword':                                                 [ 40, 100, 200],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [40, 100, 200],
      'application/vnd.ms-excel':                                           [ 33, 115,  70],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [ 33, 115,  70],
      'text/csv':                                                           [ 33, 115,  70],
      'application/vnd.ms-powerpoint':                                      [209,  52,  56],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': [209, 52, 56],
      'text/plain':                                                         [108, 117, 125],
      'application/vnd.apple.pages':                                        [255, 159,  10],
      'application/vnd.apple.numbers':                                      [ 52, 199,  89],
    };
    const [r, g, b] = colorMap[contentType] ?? [90, 90, 90];

    const width = 64, height = 64;
    const rowSize = Math.floor((width * 3 + 3) / 4) * 4;
    const pixelDataSize = rowSize * height;
    const fileSize = 54 + pixelDataSize;

    const buf = new Uint8Array(fileSize);
    // BMP file header
    buf[0] = 0x42; buf[1] = 0x4D; // 'BM'
    buf[2] = fileSize & 0xFF; buf[3] = (fileSize >> 8) & 0xFF;
    buf[4] = (fileSize >> 16) & 0xFF; buf[5] = (fileSize >> 24) & 0xFF;
    buf[6] = 0; buf[7] = 0; buf[8] = 0; buf[9] = 0;
    buf[10] = 54; buf[11] = 0; buf[12] = 0; buf[13] = 0;
    // DIB header (BITMAPINFOHEADER, 40 bytes)
    buf[14] = 40; buf[15] = 0; buf[16] = 0; buf[17] = 0;
    buf[18] = width & 0xFF; buf[19] = (width >> 8) & 0xFF; buf[20] = 0; buf[21] = 0;
    buf[22] = (-height) & 0xFF; buf[23] = 0xFF; buf[24] = 0xFF; buf[25] = 0xFF;
    buf[26] = 1; buf[27] = 0;
    buf[28] = 24; buf[29] = 0;
    for (let i = 30; i < 54; i++) buf[i] = 0;
    // Pixel data (BGR order)
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const offset = 54 + row * rowSize + col * 3;
        buf[offset] = b;
        buf[offset + 1] = g;
        buf[offset + 2] = r;
      }
    }

    let binary = '';
    for (let i = 0; i < buf.length; i++) {
      binary += String.fromCharCode(buf[i]);
    }
    const base64 = btoa(binary);

    const fileName = `doc_thumb_${contentType.replace(/[^a-z0-9]/gi, '_')}.bmp`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return fileUri;
  } catch (e) {
    console.warn('[shareRecall] getDocTypeThumbnailUri failed:', e);
    return null;
  }
}

/**
 * Determine a safe file extension from a URL by parsing the pathname only
 * (ignoring query string) and matching common image formats. Defaults to 'jpg'.
 */
function getImageExtensionFromUrl(url: string): 'jpg' | 'jpeg' | 'png' | 'webp' | 'heic' | 'gif' {
  try {
    // Strip query string and fragment, then take the segment after the last '.'
    const pathname = url.split('?')[0].split('#')[0];
    const ext = (pathname.split('.').pop() || '').toLowerCase();
    if (ext === 'png' || ext === 'webp' || ext === 'heic' || ext === 'gif' || ext === 'jpeg') {
      return ext;
    }
    return 'jpg';
  } catch {
    return 'jpg';
  }
}

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
 * Returns true if the error represents a user cancellation (not a real error).
 */
function isUserCancelError(error: unknown): boolean {
  if (!error) return false;
  const msg: string = (error as any)?.message ?? '';
  const errField: string = (error as any)?.error ?? '';
  return (
    msg.includes('User did not share') ||
    msg.includes('dismissed') ||
    msg.includes('cancel') ||
    errField === 'User did not share'
  );
}

/**
 * Share a recall using react-native-share library.
 * Includes text, location, and ALL images as actual files in a single share prompt.
 * @param recall - The note/recall to share
 * @param currentImageIndex - The index of the image currently being viewed (becomes primary)
 */
export async function shareRecall(recall: Note, currentImageIndex: number = 0, options?: { includeLocation?: boolean }): Promise<void> {
  const includeLocation = options?.includeLocation !== false;
  // Lazy-load react-native-share to avoid TurboModuleRegistry crash at bundle load time.
  // In a proper EAS build the native module is present and this succeeds.
  // In Expo Go / dev client without the native build it throws and RNShareLib stays null,
  // causing the code to fall through to the single-image fallback automatically.
  let RNShareLib: any = null;
  try {
    RNShareLib = require('react-native-share').default;
  } catch {
    console.log('[shareRecall] react-native-share native module not available, will use fallback');
  }
  try {
    console.log('[shareRecall] User tapped Share button for recall:', recall.id);
    console.log('[shareRecall] currentImageIndex:', currentImageIndex);
    console.log('[shareRecall] Total images (in-memory):', recall.images?.length ?? 0);

    // ── 1. Fetch authoritative image list from DB ────────────────────────────
    console.log('[shareRecall] Fetching authoritative image list from DB for recall:', recall.id);
    const { data: dbImages, error: dbImagesError } = await supabase
      .from('recall_images')
      .select('id, cdn_url, created_at')
      .eq('recall_id', recall.id)
      .order('created_at', { ascending: true });

    if (dbImagesError) {
      console.warn('[shareRecall] Failed to fetch authoritative image list, falling back to in-memory:', dbImagesError);
    }

    const authoritativeImages: string[] = (dbImages ?? [])
      .map((row: { id: string; cdn_url: string | null; created_at: string }) => row.cdn_url)
      .filter((url): url is string => typeof url === 'string' && url.length > 0);

    console.log('[shareRecall] Authoritative image count from DB:', authoritativeImages.length);

    // If DB fetch returned nothing but in-memory has images, fall back to in-memory
    const imagesToShare: string[] =
      authoritativeImages.length > 0
        ? authoritativeImages
        : (recall.images ?? []).filter((url): url is string => typeof url === 'string' && url.length > 0);

    // If the caller specified a currentImageIndex that maps to a URL in the in-memory list,
    // find that URL in the authoritative list and move it to position 0 so the user-selected
    // image stays primary.
    if (
      currentImageIndex > 0 &&
      recall.images &&
      recall.images[currentImageIndex] &&
      authoritativeImages.length > 0
    ) {
      const primaryUrl = recall.images[currentImageIndex];
      const authIdx = authoritativeImages.indexOf(primaryUrl);
      if (authIdx > 0) {
        const reordered = [...authoritativeImages];
        reordered.splice(authIdx, 1);
        reordered.unshift(primaryUrl);
        imagesToShare.splice(0, imagesToShare.length, ...reordered);
        console.log('[shareRecall] Moved user-selected image to position 0:', primaryUrl);
      }
    }

    console.log('[shareRecall] Total images to share:', imagesToShare.length);

    // ── 2. Fallback preview image when no recall photos exist ────────────────
    let fallbackPreviewUri: string | null = null;
    if (imagesToShare.length === 0) {
      // Priority 1: URL OG image
      const ogImageUrl = recall.urls?.[0]?.og_image_url;
      if (ogImageUrl) {
        try {
          console.log('[shareRecall] No photos — downloading OG image for share preview:', ogImageUrl);
          const ext = getImageExtensionFromUrl(ogImageUrl);
          const ogDest = `${FileSystem.cacheDirectory}share_og_${recall.id}_${Date.now()}.${ext}`;
          const ogResult = await FileSystem.downloadAsync(ogImageUrl, ogDest);
          if (ogResult.status === 200) {
            fallbackPreviewUri = ogResult.uri.startsWith('file://') ? ogResult.uri : `file://${ogResult.uri}`;
            console.log('[shareRecall] OG image downloaded for preview:', fallbackPreviewUri);
          }
        } catch (e) {
          console.warn('[shareRecall] Failed to download OG image:', e);
        }
      }

      // Priority 2: Document thumbnail or type-specific color swatch
      if (!fallbackPreviewUri && recall.documents && recall.documents.length > 0) {
        const firstDoc = recall.documents[0];
        if (firstDoc.thumbnail_url) {
          try {
            console.log('[shareRecall] Downloading document thumbnail for share preview:', firstDoc.thumbnail_url);
            const thumbDest = `${FileSystem.cacheDirectory}share_thumb_${recall.id}_${Date.now()}.jpg`;
            const thumbResult = await FileSystem.downloadAsync(firstDoc.thumbnail_url, thumbDest);
            if (thumbResult.status === 200) {
              fallbackPreviewUri = thumbResult.uri.startsWith('file://') ? thumbResult.uri : `file://${thumbResult.uri}`;
              console.log('[shareRecall] Document thumbnail downloaded:', fallbackPreviewUri);
            }
          } catch (e) {
            console.warn('[shareRecall] Failed to download document thumbnail:', e);
          }
        }
        if (!fallbackPreviewUri) {
          fallbackPreviewUri = await getDocTypeThumbnailUri(firstDoc.content_type);
          console.log('[shareRecall] Using doc-type color swatch for preview:', fallbackPreviewUri);
        }
      }
    }

    // ── 3. Build share message ───────────────────────────────────────────────
    // Use the canonical URL from recall_urls table (more reliable than regex extraction)
    const canonicalUrl = recall.urls?.[0]?.url ?? null;

    const urlRegex = /https?:\/\/\S+/g;
    let cleanText = recall.text ?? '';
    // Strip the canonical URL specifically to avoid duplication
    if (canonicalUrl) {
      cleanText = cleanText.replace(canonicalUrl, '');
    }
    // Also strip any remaining URLs from text (belt-and-suspenders)
    cleanText = cleanText
      .replace(urlRegex, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    let shareMessage = '';

    if (cleanText) {
      shareMessage += `${cleanText}\n\n`;
    }

    const hasUrl = !!canonicalUrl;
    const hasLocation = !!(recall.location && includeLocation);

    if (hasUrl && hasLocation) {
      // Both present — use icons so each line is clearly labelled
      shareMessage += `🔗 ${canonicalUrl}\n\n`;
      shareMessage += `📍 ${recall.location}\n`;
      if (recall.latitude && recall.longitude) {
        const locationQuery = recall.location
          ? `${recall.latitude},${recall.longitude}+${encodeURIComponent(recall.location)}`
          : `${recall.latitude},${recall.longitude}`;
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${locationQuery}`;
        shareMessage += `${mapsUrl}\n`;
      }
      shareMessage += '\n';
    } else if (hasUrl) {
      // URL only — no icon, bare URL so iOS generates a native link preview card
      shareMessage += `${canonicalUrl}\n\n`;
    } else if (hasLocation) {
      // Location only — no icon, plain text + maps URL so iOS can preview it
      shareMessage += `${recall.location}\n`;
      if (recall.latitude && recall.longitude) {
        const locationQuery = recall.location
          ? `${recall.latitude},${recall.longitude}+${encodeURIComponent(recall.location)}`
          : `${recall.latitude},${recall.longitude}`;
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${locationQuery}`;
        shareMessage += `${mapsUrl}\n`;
      }
      shareMessage += '\n';
    }

    shareMessage += 'Shared from Recall';
    shareMessage = shareMessage.trim();

    console.log('[shareRecall] Share message prepared (first 120 chars):', shareMessage.substring(0, 120));

    // ── 4. Download and share all images ────────────────────────────────────
    if (imagesToShare.length > 0 && Platform.OS !== 'web') {
      // Cap at 10 images to avoid memory pressure
      const urlsToDownload = imagesToShare.slice(0, 10);

      console.log(`[shareRecall] Downloading ${urlsToDownload.length} image(s) in parallel`);

      const downloadResults = await Promise.allSettled(
        urlsToDownload.map(async (url, index) => {
          const ext = getImageExtensionFromUrl(url);
          const fileName = `share_recall_${recall.id}_${index}_${Date.now()}.${ext}`;
          const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
          console.log(`[shareRecall] [Image ${index + 1}] Downloading:`, url);
          const result = await FileSystem.downloadAsync(url, fileUri);
          if (result.status !== 200) {
            throw new Error(`Download failed with status ${result.status} for image ${index + 1}`);
          }
          let finalUri = result.uri;
          if (Platform.OS === 'ios' && !finalUri.startsWith('file://')) {
            finalUri = `file://${finalUri}`;
          }
          console.log(`[shareRecall] [Image ${index + 1}] Downloaded to:`, finalUri);
          return finalUri;
        })
      );

      const successfulUris: string[] = downloadResults
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map(r => r.value);

      const failedCount = downloadResults.filter(r => r.status === 'rejected').length;
      if (failedCount > 0) {
        console.warn(`[shareRecall] ${failedCount} image(s) failed to download`);
      }
      console.log(`[shareRecall] Successfully downloaded ${successfulUris.length} of ${urlsToDownload.length} images`);

      if (successfulUris.length > 0) {
        // Primary path: react-native-share with all images + text
        try {
          console.log('[shareRecall] Opening share sheet via RNShareLib with', successfulUris.length, 'image(s)');
          if (!RNShareLib) throw new Error('react-native-share not available');
          await RNShareLib.open({
            urls: successfulUris,
            message: shareMessage,
            title: 'Share Recall',
            failOnCancel: false,
          });
          console.log('[shareRecall] RNShareLib.open completed');
          await cleanupTempFiles(successfulUris);
          return;
        } catch (multiShareError: unknown) {
          if (isUserCancelError(multiShareError)) {
            console.log('[shareRecall] User cancelled share sheet');
            await cleanupTempFiles(successfulUris);
            return;
          }
          console.warn('[shareRecall] RNShareLib.open failed, trying single-image fallback:', multiShareError);

          // Fallback: single image + text via RNShare (iOS built-in)
          try {
            console.log('[shareRecall] Falling back to RNShare.share with single image');
            await RNShare.share({
              message: shareMessage,
              url: successfulUris[0],
              title: 'Share Recall',
            });
            console.log('[shareRecall] RNShare.share (single image) completed');
            await cleanupTempFiles(successfulUris);
            return;
          } catch (singleShareError: unknown) {
            if (isUserCancelError(singleShareError)) {
              console.log('[shareRecall] User cancelled single-image share sheet');
              await cleanupTempFiles(successfulUris);
              return;
            }
            console.warn('[shareRecall] Single-image fallback also failed:', singleShareError);
            await cleanupTempFiles(successfulUris);
            // Fall through to text-only
          }
        }
      }
    } else if (fallbackPreviewUri && Platform.OS !== 'web') {
      // ── 5. Fallback preview path (OG image / doc thumbnail) ─────────────
      try {
        console.log('[shareRecall] Sharing fallback preview via RNShareLib:', fallbackPreviewUri);
        if (!RNShareLib) throw new Error('react-native-share not available');
        await RNShareLib.open({
          urls: [fallbackPreviewUri],
          message: shareMessage,
          title: 'Share Recall',
          failOnCancel: false,
        });
        console.log('[shareRecall] RNShareLib fallback preview share completed');
        await cleanupTempFiles([fallbackPreviewUri]);
        return;
      } catch (fallbackShareError: unknown) {
        if (isUserCancelError(fallbackShareError)) {
          console.log('[shareRecall] User cancelled fallback preview share sheet');
          await cleanupTempFiles([fallbackPreviewUri]);
          return;
        }
        console.warn('[shareRecall] RNShareLib fallback preview failed, trying RNShare:', fallbackShareError);

        try {
          console.log('[shareRecall] Falling back to RNShare.share with fallback preview URI');
          await RNShare.share({
            message: shareMessage,
            url: fallbackPreviewUri,
            title: 'Share Recall',
          });
          console.log('[shareRecall] RNShare fallback preview share completed');
          await cleanupTempFiles([fallbackPreviewUri]);
          return;
        } catch (rnShareFallbackError: unknown) {
          if (isUserCancelError(rnShareFallbackError)) {
            console.log('[shareRecall] User cancelled RNShare fallback preview share sheet');
            await cleanupTempFiles([fallbackPreviewUri]);
            return;
          }
          console.warn('[shareRecall] RNShare fallback preview also failed:', rnShareFallbackError);
          await cleanupTempFiles([fallbackPreviewUri]).catch(() => {});
          // Fall through to text-only
        }
      }
    }

    // ── 6. Text-only fallback ────────────────────────────────────────────────
    console.log(`[shareRecall] Sharing text only (Platform: ${Platform.OS})`);
    try {
      const result = await RNShare.share({
        message: shareMessage,
        title: 'Share Recall',
      });
      console.log('[shareRecall] Text-only share result:', result);
    } catch (shareError: unknown) {
      if (isUserCancelError(shareError)) {
        console.log('[shareRecall] User cancelled text-only share sheet');
        return;
      }
      throw shareError;
    }

    // Clean up fallback preview if it was created but not already cleaned up
    if (fallbackPreviewUri) {
      await cleanupTempFiles([fallbackPreviewUri]).catch(() => {});
    }
  } catch (error) {
    console.error('[shareRecall] Error sharing recall:', error);

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
 * Clean up temporary downloaded files
 * @param fileUris - Array of file URIs to delete
 */
async function cleanupTempFiles(fileUris: string[]): Promise<void> {
  console.log(`[shareRecall] Cleaning up ${fileUris.length} temporary file(s)`);

  for (const fileUri of fileUris) {
    try {
      // Remove file:// prefix if present for deletion
      const cleanUri = fileUri.replace('file://', '');
      await FileSystem.deleteAsync(cleanUri, { idempotent: true });
      console.log('[shareRecall] Cleaned up temp file:', fileUri);
    } catch (cleanupError) {
      console.warn('[shareRecall] Error cleaning up temp file:', cleanupError);
    }
  }
}

/**
 * Parse shared recall data from a deep link URL
 * @param url - The deep link URL
 * @returns Parsed shared recall data or null if invalid
 */
export function parseSharedRecallUrl(url: string): SharedRecallData | null {
  try {
    console.log('[shareRecall] Parsing shared recall URL:', url);

    const parsed = Linking.parse(url);
    console.log('[shareRecall] Parsed URL:', parsed);

    if (parsed.path !== 'shared-recall' && parsed.hostname !== 'shared-recall') {
      console.log('[shareRecall] Not a shared recall URL');
      return null;
    }

    const dataParam = parsed.queryParams?.data;
    if (!dataParam || typeof dataParam !== 'string') {
      console.log('[shareRecall] No data parameter found');
      return null;
    }

    const decodedData = decodeURIComponent(dataParam);
    const sharedData: SharedRecallData = JSON.parse(decodedData);

    console.log('[shareRecall] Successfully parsed shared recall data:', sharedData);
    return sharedData;
  } catch (error) {
    console.error('[shareRecall] Error parsing shared recall URL:', error);
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
