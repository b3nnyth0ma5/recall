
/**
 * Image optimization utilities for efficient image loading and uploading
 * Provides functions to compress images and generate optimized image URLs
 */

import * as ImageManipulator from 'expo-image-manipulator';

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
 */
export const UPLOAD_SIZE = {
  width: 1520, // Full HD width
  height: 1920, // Full HD height
  quality: 0.8, // 80% quality - good balance
} as const;

/**
 * Compress and optimize an image for upload
 * Reduces file size while maintaining good quality for mobile screens
 * 
 * @param uri - Original image URI
 * @returns Promise with optimized image URI
 */
export async function compressImageForUpload(uri: string): Promise<string> {
  try {
    console.log('[ImageOptimization] Starting image compression...');
    console.log('[ImageOptimization] Original URI:', uri);
    
    const startTime = Date.now();
    
    // Compress and resize the image
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [
        // Resize to max dimensions while maintaining aspect ratio
        { resize: { width: UPLOAD_SIZE.width, height: UPLOAD_SIZE.height } },
      ],
      {
        compress: UPLOAD_SIZE.quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );
    
    const duration = Date.now() - startTime;
    console.log(`[ImageOptimization] Compression complete in ${duration}ms`);
    console.log('[ImageOptimization] Optimized URI:', result.uri);
    console.log('[ImageOptimization] New dimensions:', result.width, 'x', result.height);
    
    return result.uri;
  } catch (error) {
    console.error('[ImageOptimization] Error compressing image:', error);
    // Return original URI if compression fails
    return uri;
  }
}

/**
 * Batch compress multiple images for upload
 * Processes images in parallel for faster performance
 * 
 * @param uris - Array of original image URIs
 * @returns Promise with array of optimized image URIs
 */
export async function compressImagesForUpload(uris: string[]): Promise<string[]> {
  try {
    console.log(`[ImageOptimization] Starting batch compression for ${uris.length} images...`);
    const startTime = Date.now();
    
    const compressedUris = await Promise.all(
      uris.map(uri => compressImageForUpload(uri))
    );
    
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
