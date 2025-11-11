
import { supabase } from './supabase';

const GCORE_API_BASE_URL = 'https://api.gcore.com/storage';
const GCORE_STORAGE_NAME = '919491-recall-images'; // You can customize this

/**
 * Upload an image to Gcore CDN via Supabase Edge Function
 * This keeps the API key secure on the server side
 * 
 * @param base64Data - Base64 encoded image data
 * @param fileName - Name for the file (e.g., 'image-123.jpg')
 * @param contentType - MIME type of the image
 * @returns Promise with CDN URL or null on error
 */
export async function uploadImageToGcore(
  base64Data: string,
  fileName: string,
  contentType: string = 'image/jpeg'
): Promise<string | null> {
  try {
    console.log('=== Uploading image to Gcore CDN ===');
    console.log('File name:', fileName);
    console.log('Content type:', contentType);
    console.log('Base64 data length:', base64Data.length);

    const { data, error } = await supabase.functions.invoke('gcore-upload', {
      body: {
        base64Data,
        fileName,
        contentType,
      },
    });

    if (error) {
      console.error('Error uploading to Gcore:', error);
      return null;
    }

    if (!data || !data.cdnUrl) {
      console.error('No CDN URL returned from Gcore upload');
      return null;
    }

    console.log('=== Upload successful ===');
    console.log('CDN URL:', data.cdnUrl);
    
    return data.cdnUrl;
  } catch (error) {
    console.error('Exception in uploadImageToGcore:', error);
    return null;
  }
}

/**
 * Delete an image from Gcore CDN via Supabase Edge Function
 * 
 * @param cdnUrl - The CDN URL of the image to delete
 * @returns Promise with success status
 */
export async function deleteImageFromGcore(cdnUrl: string): Promise<boolean> {
  try {
    console.log('=== Deleting image from Gcore CDN ===');
    console.log('CDN URL:', cdnUrl);

    const { data, error } = await supabase.functions.invoke('gcore-delete', {
      body: {
        cdnUrl,
      },
    });

    if (error) {
      console.error('Error deleting from Gcore:', error);
      return false;
    }

    console.log('=== Delete successful ===');
    return true;
  } catch (error) {
    console.error('Exception in deleteImageFromGcore:', error);
    return false;
  }
}

/**
 * Generate an optimized CDN URL with transformation parameters
 * Gcore CDN supports image transformations via URL parameters
 * 
 * @param cdnUrl - Original CDN URL
 * @param options - Transformation options
 * @returns Optimized CDN URL
 */
export function getOptimizedGcoreUrl(
  cdnUrl: string,
  options?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'jpeg' | 'png';
  }
): string {
  if (!options) {
    return cdnUrl;
  }

  try {
    const url = new URL(cdnUrl);
    const params = new URLSearchParams();

    if (options.width) {
      params.append('width', options.width.toString());
    }
    if (options.height) {
      params.append('height', options.height.toString());
    }
    if (options.quality) {
      params.append('quality', options.quality.toString());
    }
    if (options.format) {
      params.append('format', options.format);
    }

    const paramsString = params.toString();
    if (paramsString) {
      url.search = paramsString;
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
export function getGcoreImagePresets(cdnUrl: string) {
  return {
    thumbnail: getOptimizedGcoreUrl(cdnUrl, { width: 150, height: 150, quality: 70 }),
    card: getOptimizedGcoreUrl(cdnUrl, { width: 400, height: 400, quality: 80 }),
    preview: getOptimizedGcoreUrl(cdnUrl, { width: 800, height: 800, quality: 85 }),
    full: cdnUrl,
  };
}

/**
 * Check if Gcore CDN is properly configured
 * This calls the edge function to verify API key is set
 */
export async function isGcoreCDNConfigured(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('gcore-check-config', {
      body: {},
    });

    if (error) {
      console.error('Error checking Gcore configuration:', error);
      return false;
    }

    return data?.configured === true;
  } catch (error) {
    console.error('Exception checking Gcore configuration:', error);
    return false;
  }
}
