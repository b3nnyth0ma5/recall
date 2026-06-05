
import { Alert } from 'react-native';
import { supabase } from './supabase';

/**
 * Upload an image to Cloudflare CDN via Supabase Edge Function.
 * The edge function now requires a valid user JWT (attached automatically
 * by supabase.functions.invoke via the stored session).
 *
 * @param base64Data - Base64 encoded image data
 * @param fileName - Name for the file (e.g., 'image-123.jpg')
 * @param contentType - MIME type of the image
 * @returns Promise with CDN URL or null on error
 */
export async function uploadImageToCloudflare(
  base64Data: string,
  fileName: string,
  contentType: string = 'image/jpeg'
): Promise<string | null> {
  try {
    console.log('[cloudflare-upload] Starting upload:', { fileName, contentType, base64Length: base64Data.length });

    const { data, error } = await supabase.functions.invoke('cloudflare-upload', {
      body: {
        base64Data,
        fileName,
        contentType,
      },
    });

    if (error) {
      console.error('[cloudflare-upload] Edge function error:', error);

      // Surface auth errors — user session has expired
      const status = (error as any)?.status ?? (error as any)?.context?.status;
      if (status === 401) {
        console.warn('[cloudflare-upload] 401 — session expired');
        Alert.alert('Session expired', 'Please sign in again to continue uploading.');
        return null;
      }

      // Rate-limit
      if (status === 429) {
        console.warn('[cloudflare-upload] 429 — rate limited');
        Alert.alert('Too many uploads', 'Please wait a moment and try again.');
        return null;
      }

      return null;
    }

    if (!data || !data.cdnUrl) {
      console.error('[cloudflare-upload] No CDN URL returned');
      return null;
    }

    console.log('[cloudflare-upload] Upload successful, CDN URL:', data.cdnUrl);
    return data.cdnUrl;
  } catch (error) {
    console.error('[cloudflare-upload] Exception:', error);
    return null;
  }
}

/**
 * Delete an image from Cloudflare CDN via Supabase Edge Function.
 * The edge function now requires a valid user JWT (attached automatically
 * by supabase.functions.invoke via the stored session).
 *
 * @param cdnUrl - The CDN URL of the image to delete
 * @returns Promise with success status
 */
export async function deleteImageFromCloudflare(cdnUrl: string): Promise<boolean> {
  try {
    console.log('[cloudflare-delete] Deleting image:', cdnUrl);

    // Extract the image ID from the CDN URL
    const urlParts = cdnUrl.split('/');
    const imageId = urlParts[urlParts.length - 2];

    const { data, error } = await supabase.functions.invoke('cloudflare-delete', {
      body: {
        imageId,
      },
    });

    if (error) {
      console.error('[cloudflare-delete] Edge function error:', error);

      const status = (error as any)?.status ?? (error as any)?.context?.status;

      // 401 — session expired
      if (status === 401) {
        console.warn('[cloudflare-delete] 401 — session expired');
        Alert.alert('Session expired', 'Please sign in again to continue.');
        return false;
      }

      // 404 — asset doesn't exist or caller doesn't own it; treat as success
      if (status === 404) {
        console.log('[cloudflare-delete] 404 — asset not found or not owned; treating as success');
        return true;
      }

      return false;
    }

    console.log('[cloudflare-delete] Delete successful');
    return true;
  } catch (error) {
    console.error('[cloudflare-delete] Exception:', error);
    return false;
  }
}

/**
 * Generate an optimized CDN URL with Cloudflare Image Resizing
 * Cloudflare supports image transformations via URL parameters
 * 
 * @param cdnUrl - Original CDN URL
 * @param options - Transformation options
 * @returns Optimized CDN URL
 */
export function getOptimizedCloudflareUrl(
  cdnUrl: string,
  options?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'jpeg' | 'png' | 'avif';
    fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  }
): string {
  if (!options) {
    return cdnUrl;
  }

  try {
    // Cloudflare Images uses a specific URL format for transformations
    // Format: https://imagedelivery.net/<account-hash>/<image-id>/<variant-name>
    // For custom transformations, we can use the flexible variant
    
    const url = new URL(cdnUrl);
    const pathParts = url.pathname.split('/');
    
    // Build transformation string
    const transformations: string[] = [];
    
    if (options.width) {
      transformations.push(`w=${options.width}`);
    }
    if (options.height) {
      transformations.push(`h=${options.height}`);
    }
    if (options.quality) {
      transformations.push(`q=${options.quality}`);
    }
    if (options.format) {
      transformations.push(`f=${options.format}`);
    }
    if (options.fit) {
      transformations.push(`fit=${options.fit}`);
    }

    // If we have transformations, append them to the URL
    if (transformations.length > 0) {
      // For Cloudflare Images, we can use the flexible variant
      // Replace the last part of the path with our transformation string
      pathParts[pathParts.length - 1] = transformations.join(',');
      url.pathname = pathParts.join('/');
    }

    return url.toString();
  } catch (error) {
    console.error('Error generating optimized URL:', error);
    return cdnUrl;
  }
}

/**
 * Get predefined optimized URLs for common use cases
 */
export function getCloudflareImagePresets(cdnUrl: string) {
  return {
    thumbnail: getOptimizedCloudflareUrl(cdnUrl, { 
      width: 150, 
      height: 150, 
      quality: 70,
      fit: 'cover',
      format: 'webp'
    }),
    card: getOptimizedCloudflareUrl(cdnUrl, { 
      width: 400, 
      height: 400, 
      quality: 80,
      fit: 'cover',
      format: 'webp'
    }),
    preview: getOptimizedCloudflareUrl(cdnUrl, { 
      width: 800, 
      height: 800, 
      quality: 85,
      fit: 'scale-down',
      format: 'webp'
    }),
    full: cdnUrl,
  };
}

/**
 * Get a document URL — if it's already an https URL return it as-is,
 * otherwise generate a Supabase Storage signed URL (1h TTL).
 */
export async function getDocumentUrl(cdnUrl: string): Promise<string | null> {
  if (!cdnUrl) return null;
  if (cdnUrl.startsWith('https://')) return cdnUrl;
  try {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(cdnUrl, 3600);
    if (error) {
      console.error('[getDocumentUrl] Error creating signed URL:', error);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (error) {
    console.error('[getDocumentUrl] Exception:', error);
    return null;
  }
}

/**
 * Check if Cloudflare CDN is properly configured
 * This calls the edge function to verify API key is set
 */
export async function isCloudflareCDNConfigured(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('cloudflare-check-config', {
      body: {},
    });

    if (error) {
      console.error('Error checking Cloudflare configuration:', error);
      return false;
    }

    return data?.configured === true;
  } catch (error) {
    console.error('Exception checking Cloudflare configuration:', error);
    return false;
  }
}
