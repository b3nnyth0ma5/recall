
import { Platform, Share as RNShare } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
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
 * Share a recall using react-native-share library
 * Includes text, location, and all images as actual files in a single share prompt
 * @param recall - The note/recall to share
 * @param currentImageIndex - The index of the image currently being viewed (becomes primary)
 */
export async function shareRecall(recall: Note, currentImageIndex: number = 0, options?: { includeLocation?: boolean }): Promise<void> {
  const includeLocation = options?.includeLocation !== false;
  try {
    console.log('User tapped Share button for recall:', recall.id);
    console.log('Current image index:', currentImageIndex);
    console.log('Total images (in-memory):', recall.images?.length || 0);

    // Fetch the authoritative image list from the database so we always share ALL images,
    // not just the subset that was lazy-loaded into memory.
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

    // ── Fallback preview image when no recall photos exist ───────────────────
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

    // Build comprehensive share message with recall text, location, and image info
    let shareMessage = '';

    // Strip URLs from recall.text so they don't appear inline at the message head —
    // iOS Messages aggressively globs trailing content into a leading URL otherwise,
    // making the link unclickable and corrupting the rest of the message body.
    // The extracted URL(s) are placed below on a labeled line.
    const urlRegex = /https?:\/\/\S+/g;
    const extractedUrls = recall.text?.match(urlRegex) ?? [];
    const textWithoutUrls = (recall.text ?? '')
      .replace(urlRegex, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Recall body text (URLs removed)
    if (textWithoutUrls) {
      shareMessage += `${textWithoutUrls}\n\n`;
    }

    // Extracted URL(s) on a labeled line so iOS Messages parses each as its own link
    if (extractedUrls.length > 0) {
      for (const url of extractedUrls) {
        shareMessage += `🔗 ${url}\n`;
      }
      shareMessage += '\n';
    }

    // Location with Google Maps link on its own labeled line
    if (recall.location && includeLocation) {
      shareMessage += `📍 ${recall.location}\n`;
      if (recall.latitude && recall.longitude) {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${recall.latitude},${recall.longitude}`;
        shareMessage += `🗺️ ${mapsUrl}\n`;
      }
      shareMessage += '\n';
    }

    // Footer — shown on every share, not just shares with a location
    shareMessage += 'Shared from Recall';

    console.log('Share message prepared:', shareMessage.substring(0, 100) + '...');

    // If there are images, download the primary one and share it with expo-sharing
    if (imagesToShare.length > 0 && Platform.OS !== 'web' && await Sharing.isAvailableAsync()) {
      console.log(`Starting download process for primary image (1 of ${imagesToShare.length})`);

      try {
        const primaryUrl = imagesToShare[0];
        const fileExtension = getImageExtensionFromUrl(primaryUrl);
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);
        const fileName = `share_recall_${recall.id}_0_${timestamp}_${randomSuffix}.${fileExtension}`;
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

        console.log('[Image 1] Source URL:', primaryUrl);
        console.log('[Image 1] Target path:', fileUri);

        const downloadResult = await FileSystem.downloadAsync(primaryUrl, fileUri);
        console.log('[Image 1] Download result status:', downloadResult.status);

        if (downloadResult.status === 200) {
          const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
          console.log('[Image 1] File info:', fileInfo);

          if (fileInfo.exists) {
            let finalUri = downloadResult.uri;
            if (Platform.OS === 'ios' && !finalUri.startsWith('file://')) {
              finalUri = `file://${finalUri}`;
            }

            console.log('[Image 1] ✅ Successfully downloaded, calling Sharing.shareAsync');
            await Sharing.shareAsync(finalUri, { mimeType: 'image/jpeg', dialogTitle: 'Share Recall' });
            console.log('[Image 1] Sharing.shareAsync completed');

            await cleanupTempFiles([finalUri]);
            return;
          } else {
            console.error('[Image 1] ❌ File does not exist after download');
          }
        } else {
          console.error('[Image 1] ❌ Download failed with status:', downloadResult.status);
        }
      } catch (imageError) {
        console.error('❌ Error in image download/share process:', imageError);
        // Fall through to text-only share
      }
    } else if (fallbackPreviewUri && Platform.OS !== 'web' && await Sharing.isAvailableAsync()) {
      // Share fallback preview (OG image / doc thumbnail)
      try {
        console.log('[shareRecall] Sharing fallback preview URI:', fallbackPreviewUri);
        await Sharing.shareAsync(fallbackPreviewUri, { mimeType: 'image/jpeg', dialogTitle: 'Share Recall' });
        await cleanupTempFiles([fallbackPreviewUri]);
        return;
      } catch (imageError) {
        console.error('❌ Error sharing fallback preview:', imageError);
      }
    }

    // Fallback: Share text only using React Native's built-in Share API
    console.log(`Sharing text only (Platform: ${Platform.OS})`);

    try {
      const result = await RNShare.share({
        message: shareMessage.trim(),
        title: 'Share Recall',
      });
      console.log('Text-only share result:', result);
    } catch (shareError: any) {
      // User dismissed the share dialog
      if (shareError.message && (shareError.message.includes('User did not share') || shareError.message.includes('dismissed'))) {
        console.log('Share dismissed by user');
        return;
      }
      throw shareError;
    }

    // Clean up fallback preview if it was created but not already cleaned up
    if (fallbackPreviewUri) {
      await cleanupTempFiles([fallbackPreviewUri]).catch(() => {});
    }
  } catch (error) {
    console.error('❌ Error sharing recall:', error);
    
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
  console.log(`Cleaning up ${fileUris.length} temporary file(s)`);
  
  for (const fileUri of fileUris) {
    try {
      // Remove file:// prefix if present for deletion
      const cleanUri = fileUri.replace('file://', '');
      await FileSystem.deleteAsync(cleanUri, { idempotent: true });
      console.log('Cleaned up temp file:', fileUri);
    } catch (cleanupError) {
      console.warn('Error cleaning up temp file:', cleanupError);
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
    console.log('Parsing shared recall URL:', url);
    
    const parsed = Linking.parse(url);
    console.log('Parsed URL:', parsed);

    if (parsed.path !== 'shared-recall' && parsed.hostname !== 'shared-recall') {
      console.log('Not a shared recall URL');
      return null;
    }

    const dataParam = parsed.queryParams?.data;
    if (!dataParam || typeof dataParam !== 'string') {
      console.log('No data parameter found');
      return null;
    }

    const decodedData = decodeURIComponent(dataParam);
    const sharedData: SharedRecallData = JSON.parse(decodedData);

    console.log('Successfully parsed shared recall data:', sharedData);
    return sharedData;
  } catch (error) {
    console.error('Error parsing shared recall URL:', error);
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
