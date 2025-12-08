
import { supabase } from './supabase';

/**
 * Upload an image to Cloudflare CDN via Supabase Edge Function
 * This keeps the API key secure on the server side
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
    console.log('=== Uploading image to Cloudflare CDN ===');
    console.log('File name:', fileName);
    console.log('Content type:', contentType);
    console.log('Base64 data length:', base64Data.length);

    const { data, error } = await supabase.functions.invoke('cloudflare-upload', {
      body: {
        base64Data,
        fileName,
        contentType,
      },
    });

    if (error) {
      console.error('Error uploading to Cloudflare:', error);
      return null;
    }

    if (!data || !data.cdnUrl) {
      console.error('No CDN URL returned from Cloudflare upload');
      return null;
    }

    console.log('=== Upload successful ===');
    console.log('CDN URL:', data.cdnUrl);
    
    return data.cdnUrl;
  } catch (error) {
    console.error('Exception in uploadImageToCloudflare:', error);
    return null;
  }
}

/**
 * Delete an image from Cloudflare CDN via Supabase Edge Function
 * 
 * @param cdnUrl - The CDN URL of the image to delete
 * @returns Promise with success status
 */
export async function deleteImageFromCloudflare(cdnUrl: string): Promise<boolean> {
  try {
    console.log('=== Deleting image from Cloudflare CDN ===');
    console.log('CDN URL:', cdnUrl);

    // Extract the image ID from the CDN URL
    const urlParts = cdnUrl.split('/');
    const imageId = urlParts[urlParts.length - 2];

    const { data, error } = await supabase.functions.invoke('cloudflare-delete', {
      body: {
        imageId,
      },
    });

    if (error) {
      console.error('Error deleting from Cloudflare:', error);
      return false;
    }

    console.log('=== Delete successful ===');
    return true;
  } catch (error) {
    console.error('Exception in deleteImageFromCloudflare:', error);
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
