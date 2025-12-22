
/**
 * Image optimization utilities for efficient image loading and uploading
 * Provides functions to compress images and generate optimized image URLs
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

export interface ImageSize {
  width: number;
  height: number;
  quality?: number;
}

/**
 * Predefined image sizes for different use cases
 */
export const IMAGE_SIZES = {
  THUMBNAIL: { width: 130, height: 150, quality: 70 },
  CARD: { width: 320, height: 400, quality: 80 },
  PREVIEW: { width: 720, height: 900, quality: 85 },
  FULL: { width: 720, height: 900, quality: 90 },
} as const;

/**
 * Optimal upload size for mobile devices
 * Balances quality and upload speed
 * Portrait: 1:1.3 ratio (1520x1976)
 * Landscape: 1.3:1 ratio (1976x1520) - inverse of portrait
 */
export const UPLOAD_SIZE_PORTRAIT = {
  width: 1520,
  height: 1976, // 1520 * 1.3
  quality: 0.8,
} as const;

export const UPLOAD_SIZE_LANDSCAPE = {
  width: 1976, // 1520 * 1.3
  height: 1520,
  quality: 0.8,
} as const;

/**
 * Get image dimensions from URI
 */
async function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => {
        resolve({ width, height });
      },
      (error) => {
        console.error('[ImageOptimization] Error getting image dimensions:', error);
        reject(error);
      }
    );
  });
}

/**
 * Determine if image is landscape or portrait based on aspect ratio
 */
function isLandscape(width: number, height: number): boolean {
  const aspectRatio = width / height;
  return aspectRatio > 1;
}

/**
 * Calculate resize dimensions based on aspect ratio
 * Portrait images (height > width): resize to 1:1.3 ratio
 * Landscape images (width > height): resize to 1.3:1 ratio (inverse)
 */
function calculateResizeDimensions(originalWidth: number, originalHeight: number): { width: number; height: number } {
  const aspectRatio = originalWidth / originalHeight;
  
  if (aspectRatio > 1) {
    // Landscape image - use 1.3:1 ratio
    console.log('[ImageOptimization] Landscape image detected - using 1.3:1 ratio');
    return {
      width: UPLOAD_SIZE_LANDSCAPE.width,
      height: UPLOAD_SIZE_LANDSCAPE.height,
    };
  } else {
    // Portrait or square image - use 1:1.3 ratio
    console.log('[ImageOptimization] Portrait/square image detected - using 1:1.3 ratio');
    return {
      width: UPLOAD_SIZE_PORTRAIT.width,
      height: UPLOAD_SIZE_PORTRAIT.height,
    };
  }
}

/**
 * Compress and optimize an image for upload
 * Reduces file size while maintaining good quality for mobile screens
 * Takes aspect ratio into account:
 * - Portrait images (height > width): 1:1.3 ratio (1520x1976)
 * - Landscape images (width > height): 1.3:1 ratio (1976x1520) - inverse
 * 
 * @param uri - Original image URI
 * @returns Promise with optimized image URI
 */
export async function compressImageForUpload(uri: string): Promise<string> {
  try {
    console.log('[ImageOptimization] Starting image compression...');
    console.log('[ImageOptimization] Original URI:', uri);
    
    const startTime = Date.now();
    
    // Get original image dimensions
    const dimensions = await getImageDimensions(uri);
    console.log('[ImageOptimization] Original dimensions:', dimensions.width, 'x', dimensions.height);
    
    // Calculate aspect ratio
    const aspectRatio = dimensions.width / dimensions.height;
    console.log('[ImageOptimization] Aspect ratio:', aspectRatio.toFixed(2));
    
    // Determine if landscape or portrait
    const landscape = isLandscape(dimensions.width, dimensions.height);
    console.log('[ImageOptimization] Image orientation:', landscape ? 'LANDSCAPE' : 'PORTRAIT');
    
    // Calculate target dimensions based on aspect ratio
    const targetDimensions = calculateResizeDimensions(dimensions.width, dimensions.height);
    console.log('[ImageOptimization] Target dimensions:', targetDimensions.width, 'x', targetDimensions.height);
    console.log('[ImageOptimization] Target aspect ratio:', (targetDimensions.width / targetDimensions.height).toFixed(2));
    
    // Select quality based on orientation
    const quality = landscape ? UPLOAD_SIZE_LANDSCAPE.quality : UPLOAD_SIZE_PORTRAIT.quality;
    
    // Compress and resize the image
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [
        // Resize to target dimensions while maintaining aspect ratio
        { resize: { width: targetDimensions.width, height: targetDimensions.height } },
      ],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );
    
    const duration = Date.now() - startTime;
    console.log(`[ImageOptimization] Compression complete in ${duration}ms`);
    console.log('[ImageOptimization] Optimized URI:', result.uri);
    console.log('[ImageOptimization] New dimensions:', result.width, 'x', result.height);
    console.log('[ImageOptimization] New aspect ratio:', (result.width / result.height).toFixed(2));
    
    return result.uri;
  } catch (error) {
    console.error('[ImageOptimization] Error compressing image:', error);
    // Return original URI if compression fails
    return uri;
  }
}

/**
 * Batch compress multiple images for upload
 * Processes images sequentially to avoid memory issues
 * Returns optimized URIs one at a time via callback
 * 
 * @param uris - Array of original image URIs
 * @param onImageOptimized - Callback called when each image is optimized
 * @returns Promise with array of optimized image URIs
 */
export async function compressImagesForUpload(
  uris: string[],
  onImageOptimized?: (optimizedUri: string, index: number) => void
): Promise<string[]> {
  try {
    console.log(`[ImageOptimization] Starting batch compression for ${uris.length} images...`);
    const startTime = Date.now();
    
    const compressedUris: string[] = [];
    
    // Process images sequentially to avoid memory issues
    for (let i = 0; i < uris.length; i++) {
      const uri = uris[i];
      console.log(`[ImageOptimization] Compressing image ${i + 1}/${uris.length}...`);
      
      const compressedUri = await compressImageForUpload(uri);
      compressedUris.push(compressedUri);
      
      // Notify callback that this image is ready
      if (onImageOptimized) {
        onImageOptimized(compressedUri, i);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[ImageOptimization] Batch compression complete in ${duration}ms`);
    console.log(`[ImageOptimization] Average time per image: ${Math.round(duration / uris.length)}ms`);
    
    return compressedUris;
  } catch (error) {
    console.error('[ImageOptimization] Error in batch compression:', error);
    // Return original URIs if batch compression fails
    return uris;
  }
}

/**
 * Get optimized image URL for Supabase storage
 * Note: This is a placeholder for future Supabase image transformation support
 * Currently returns the original URL, but structure is ready for optimization
 */
export function getOptimizedImageUrl(
  originalUrl: string,
  size: ImageSize = IMAGE_SIZES.CARD
): string {
  // For now, return the original URL
  // In the future, this could use Supabase image transformations or a CDN
  // Example: `${originalUrl}?width=${size.width}&height=${size.height}&quality=${size.quality}`
  
  console.log(`Image optimization requested: ${size.width}x${size.height} @ ${size.quality}% quality`);
  
  return originalUrl;
}

/**
 * Preload images for better performance
 */
export async function preloadImages(urls: string[]): Promise<void> {
  const promises = urls.map(url => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = url;
    });
  });

  try {
    await Promise.all(promises);
    console.log(`Preloaded ${urls.length} images`);
  } catch (error) {
    console.error('Error preloading images:', error);
  }
}

/**
 * Get the appropriate image size based on screen dimensions
 */
export function getImageSizeForScreen(screenWidth: number): ImageSize {
  if (screenWidth <= 375) {
    return IMAGE_SIZES.CARD;
  } else if (screenWidth <= 768) {
    return IMAGE_SIZES.PREVIEW;
  } else {
    return IMAGE_SIZES.FULL;
  }
}
