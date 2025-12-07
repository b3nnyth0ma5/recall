
import { supabase } from './supabase';

/**
 * Upload an image to Cloudflare CDN via Supabase Edge Function
 * OPTIMIZED: Includes retry logic and better error handling
 * 
 * @param base64Data - Base64 encoded image data
 * @param fileName - Name for the file (e.g., 'image-123.jpg')
 * @param contentType - MIME type of the image
 * @param retries - Number of retry attempts (default: 2)
 * @returns Promise with CDN URL or null on error
 */
export async function uploadImageToCloudflare(
  base64Data: string,
  fileName: string,
  contentType: string = 'image/jpeg',
  retries: number = 2
): Promise<string | null> {
  let lastError: any = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt}/${retries} for ${fileName}`);
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
      }

      console.log('=== Uploading image to Cloudflare CDN ===');
      console.log('File name:', fileName);
      console.log('Content type:', contentType);
      console.log('Base64 data length:', base64Data.length);
      console.log('Attempt:', attempt + 1);

      const startTime = performance.now();

      const { data, error } = await supabase.functions.invoke('cloudflare-upload', {
        body: {
          base64Data,
          fileName,
          contentType,
        },
      });

      const duration = performance.now() - startTime;
      console.log(`Upload completed in ${duration.toFixed(2)}ms`);

      if (error) {
        console.error('Error uploading to Cloudflare:', error);
        lastError = error;
        
        // Don't retry on client errors (4xx)
        if (error.status && error.status >= 400 && error.status < 500) {
          console.log('Client error detected, not retrying');
          return null;
        }
        
        // Retry on server errors (5xx) or network errors
        continue;
      }

      if (!data || !data.cdnUrl) {
        console.error('No CDN URL returned from Cloudflare upload');
        lastError = new Error('No CDN URL in response');
        continue;
      }

      console.log('=== Upload successful ===');
      console.log('CDN URL:', data.cdnUrl);
      
      // Log performance metrics if available
      if (data.metrics) {
        console.log('Performance metrics:', data.metrics);
      }
      
      return data.cdnUrl;
    } catch (error) {
      console.error(`Exception in uploadImageToCloudflare (attempt ${attempt + 1}):`, error);
      lastError = error;
      
      // Don't retry on certain errors
      if (error instanceof TypeError && error.message.includes('network')) {
        console.log('Network error detected, retrying...');
        continue;
      }
    }
  }

  console.error(`Failed to upload after ${retries + 1} attempts`);
  console.error('Last error:', lastError);
  return null;
}

/**
 * Delete an image from Cloudflare CDN via Supabase Edge Function
 * OPTIMIZED: Includes retry logic
 * 
 * @param cdnUrl - The CDN URL of the image to delete
 * @param retries - Number of retry attempts (default: 1)
 * @returns Promise with success status
 */
export async function deleteImageFromCloudflare(
  cdnUrl: string,
  retries: number = 1
): Promise<boolean> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt}/${retries} for deletion`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }

      console.log('=== Deleting image from Cloudflare CDN ===');
      console.log('CDN URL:', cdnUrl);

      // Extract the image ID from the CDN URL
      const urlParts = cdnUrl.split('/');
      const imageId = urlParts[urlParts.length - 2];

      if (!imageId) {
        console.error('Could not extract image ID from URL');
        return false;
      }

      const { data, error } = await supabase.functions.invoke('cloudflare-delete', {
        body: {
          imageId,
        },
      });

      if (error) {
        console.error('Error deleting from Cloudflare:', error);
        lastError = error;
        
        // Don't retry on 404 (already deleted)
        if (error.status === 404) {
          console.log('Image already deleted (404), considering as success');
          return true;
        }
        
        continue;
      }

      console.log('=== Delete successful ===');
      return true;
    } catch (error) {
      console.error(`Exception in deleteImageFromCloudflare (attempt ${attempt + 1}):`, error);
      lastError = error;
    }
  }

  console.error(`Failed to delete after ${retries + 1} attempts`);
  console.error('Last error:', lastError);
  return false;
}

/**
 * Generate an optimized CDN URL with Cloudflare Image Resizing
 * OPTIMIZED: Better URL construction and validation
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
  if (!options || Object.keys(options).length === 0) {
    return cdnUrl;
  }

  try {
    // Validate URL format
    if (!cdnUrl.includes('imagedelivery.net')) {
      console.warn('URL does not appear to be a Cloudflare Images URL');
      return cdnUrl;
    }

    const url = new URL(cdnUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    // Expected format: /account-hash/image-id/variant
    if (pathParts.length < 3) {
      console.warn('Unexpected URL format');
      return cdnUrl;
    }

    // Build transformation string
    const transformations: string[] = [];
    
    if (options.width && options.width > 0) {
      transformations.push(`w=${Math.round(options.width)}`);
    }
    if (options.height && options.height > 0) {
      transformations.push(`h=${Math.round(options.height)}`);
    }
    if (options.quality && options.quality > 0 && options.quality <= 100) {
      transformations.push(`q=${Math.round(options.quality)}`);
    }
    if (options.format) {
      transformations.push(`f=${options.format}`);
    }
    if (options.fit) {
      transformations.push(`fit=${options.fit}`);
    }

    // Replace the variant with our transformation string
    if (transformations.length > 0) {
      pathParts[pathParts.length - 1] = transformations.join(',');
      url.pathname = '/' + pathParts.join('/');
    }

    return url.toString();
  } catch (error) {
    console.error('Error generating optimized URL:', error);
    return cdnUrl;
  }
}

/**
 * Get predefined optimized URLs for common use cases
 * OPTIMIZED: Better presets for different screen sizes
 */
export function getCloudflareImagePresets(cdnUrl: string) {
  return {
    // Thumbnail for lists and grids
    thumbnail: getOptimizedCloudflareUrl(cdnUrl, { 
      width: 200, 
      height: 200, 
      quality: 75,
      fit: 'cover',
      format: 'webp'
    }),
    // Card view in feeds
    card: getOptimizedCloudflareUrl(cdnUrl, { 
      width: 600, 
      height: 600, 
      quality: 80,
      fit: 'cover',
      format: 'webp'
    }),
    // Preview/detail view
    preview: getOptimizedCloudflareUrl(cdnUrl, { 
      width: 1200, 
      height: 1200, 
      quality: 85,
      fit: 'scale-down',
      format: 'webp'
    }),
    // Full resolution
    full: cdnUrl,
  };
}

/**
 * Check if Cloudflare CDN is properly configured
 * OPTIMIZED: Includes caching to avoid repeated checks
 */
let configCheckCache: { configured: boolean; timestamp: number } | null = null;
const CONFIG_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function isCloudflareCDNConfigured(): Promise<boolean> {
  try {
    // Check cache first
    if (configCheckCache && (Date.now() - configCheckCache.timestamp) < CONFIG_CACHE_DURATION) {
      console.log('Using cached Cloudflare configuration check');
      return configCheckCache.configured;
    }

    const { data, error } = await supabase.functions.invoke('cloudflare-check-config', {
      body: {},
    });

    if (error) {
      console.error('Error checking Cloudflare configuration:', error);
      return false;
    }

    const configured = data?.configured === true;
    
    // Update cache
    configCheckCache = {
      configured,
      timestamp: Date.now(),
    };

    return configured;
  } catch (error) {
    console.error('Exception checking Cloudflare configuration:', error);
    return false;
  }
}

/**
 * OPTIMIZATION: Batch upload multiple images with concurrency control
 * 
 * @param images - Array of {base64Data, fileName, contentType}
 * @param maxConcurrent - Maximum concurrent uploads (default: 3)
 * @returns Array of CDN URLs (null for failed uploads)
 */
export async function batchUploadImages(
  images: Array<{ base64Data: string; fileName: string; contentType: string }>,
  maxConcurrent: number = 3
): Promise<Array<string | null>> {
  console.log(`=== Batch uploading ${images.length} images with max ${maxConcurrent} concurrent ===`);
  
  const results: Array<string | null> = new Array(images.length).fill(null);
  const queue = [...images.map((img, index) => ({ ...img, index }))];
  const inProgress: Promise<void>[] = [];

  const uploadOne = async (item: typeof queue[0]) => {
    try {
      const url = await uploadImageToCloudflare(
        item.base64Data,
        item.fileName,
        item.contentType
      );
      results[item.index] = url;
      console.log(`Batch upload ${item.index + 1}/${images.length}: ${url ? 'success' : 'failed'}`);
    } catch (error) {
      console.error(`Batch upload ${item.index + 1} exception:`, error);
      results[item.index] = null;
    }
  };

  while (queue.length > 0 || inProgress.length > 0) {
    // Start new uploads up to maxConcurrent
    while (inProgress.length < maxConcurrent && queue.length > 0) {
      const item = queue.shift()!;
      const promise = uploadOne(item);
      inProgress.push(promise);
    }

    // Wait for at least one to complete
    if (inProgress.length > 0) {
      await Promise.race(inProgress);
      // Remove completed promises
      for (let i = inProgress.length - 1; i >= 0; i--) {
        const promise = inProgress[i];
        const isResolved = await Promise.race([
          promise.then(() => true),
          Promise.resolve(false)
        ]);
        if (isResolved) {
          inProgress.splice(i, 1);
        }
      }
    }
  }

  const successCount = results.filter(r => r !== null).length;
  console.log(`=== Batch upload complete: ${successCount}/${images.length} successful ===`);
  
  return results;
}
