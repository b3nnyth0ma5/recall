
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
 * Calculate resize dimensions based on aspect ratio and orientation
 * Portrait images (height > width): resize to fit within 1520x1976 maintaining aspect ratio
 * Landscape images (width > height): resize to fit within 1976x1520 maintaining aspect ratio
 * This ensures proper sizing for both regular photos and screenshots
 */
function calculateResizeDimensions(originalWidth: number, originalHeight: number): { width: number; height: number } {
  const aspectRatio = originalWidth / originalHeight;
  
  if (aspectRatio > 1) {
    // Landscape image - fit within 1976x1520
    console.log('[ImageOptimization] Landscape image detected - fitting within 1976x1520');
    
    // Calculate dimensions that fit within the landscape bounds
    if (originalWidth > UPLOAD_SIZE_LANDSCAPE.width || originalHeight > UPLOAD_SIZE_LANDSCAPE.height) {
      const widthRatio = UPLOAD_SIZE_LANDSCAPE.width / originalWidth;
      const heightRatio = UPLOAD_SIZE_LANDSCAPE.height / originalHeight;
      const ratio = Math.min(widthRatio, heightRatio);
      
      return {
        width: Math.round(originalWidth * ratio),
        height: Math.round(originalHeight * ratio),
      };
    }
    
    // Image is already smaller than target, return original dimensions
    return {
      width: originalWidth,
      height: originalHeight,
    };
  } else {
    // Portrait or square image - fit within 1520x1976
    console.log('[ImageOptimization] Portrait/square image detected - fitting within 1520x1976');
    
    // Calculate dimensions that fit within the portrait bounds
    if (originalWidth > UPLOAD_SIZE_PORTRAIT.width || originalHeight > UPLOAD_SIZE_PORTRAIT.height) {
      const widthRatio = UPLOAD_SIZE_PORTRAIT.width / originalWidth;
      const heightRatio = UPLOAD_SIZE_PORTRAIT.height / originalHeight;
      const ratio = Math.min(widthRatio, heightRatio);
      
      return {
        width: Math.round(originalWidth * ratio),
        height: Math.round(originalHeight * ratio),
      };
    }
    
    // Image is already smaller than target, return original dimensions
    return {
      width: originalWidth,
      height: originalHeight,
    };
  }
}

/**
 * Compress and optimize an image for upload
 * Reduces file size while maintaining good quality for mobile screens
 * Takes aspect ratio into account:
 * - Portrait images (height > width): fit within 1520x1976 maintaining aspect ratio
 * - Landscape images (width > height): fit within 1976x1520 maintaining aspect ratio
 * - Handles screenshots and photos correctly by preserving aspect ratio
 * 
 * @param uri - Original image URI
 * @returns Promise with optimized image URI
 */
export async function compressImageForUpload(uri: string): Promise<string> {
  try {
    console.log('[ImageOptimization] ========================================');
    console.log('[ImageOptimization] Starting image compression...');
    console.log('[ImageOptimization] Original URI:', uri);
    
    const startTime = Date.now();
    
    // Get original image dimensions
    const dimensions = await getImageDimensions(uri);
    console.log('[ImageOptimization] ========================================');
    console.log('[ImageOptimization] ORIGINAL IMAGE DIMENSIONS:');
    console.log('[ImageOptimization]   Width:', dimensions.width, 'px');
    console.log('[ImageOptimization]   Height:', dimensions.height, 'px');
    
    // Calculate aspect ratio
    const aspectRatio = dimensions.width / dimensions.height;
    console.log('[ImageOptimization] ========================================');
    console.log('[ImageOptimization] ASPECT RATIO ANALYSIS:');
    console.log('[ImageOptimization]   Aspect Ratio:', aspectRatio.toFixed(4));
    console.log('[ImageOptimization]   Ratio (W:H):', `${dimensions.width}:${dimensions.height}`);
    
    // Determine if landscape or portrait
    const landscape = isLandscape(dimensions.width, dimensions.height);
    console.log('[ImageOptimization] ========================================');
    console.log('[ImageOptimization] ORIENTATION DETECTION:');
    console.log('[ImageOptimization]   Orientation:', landscape ? 'LANDSCAPE' : 'PORTRAIT');
    console.log('[ImageOptimization]   Detection Logic:', aspectRatio > 1 ? 'Width > Height (Landscape)' : 'Height >= Width (Portrait)');
    
    // Calculate target dimensions based on aspect ratio (maintains original aspect ratio)
    const targetDimensions = calculateResizeDimensions(dimensions.width, dimensions.height);
    console.log('[ImageOptimization] ========================================');
    console.log('[ImageOptimization] TARGET DIMENSIONS:');
    console.log('[ImageOptimization]   Target Width:', targetDimensions.width, 'px');
    console.log('[ImageOptimization]   Target Height:', targetDimensions.height, 'px');
    console.log('[ImageOptimization]   Target Aspect Ratio:', (targetDimensions.width / targetDimensions.height).toFixed(4));
    console.log('[ImageOptimization]   Max Bounds:', landscape ? '1976x1520 (Landscape)' : '1520x1976 (Portrait)');
    
    // Check if aspect ratio is preserved
    const originalRatio = dimensions.width / dimensions.height;
    const targetRatio = targetDimensions.width / targetDimensions.height;
    const ratioDifference = Math.abs(originalRatio - targetRatio);
    console.log('[ImageOptimization] ========================================');
    console.log('[ImageOptimization] ASPECT RATIO PRESERVATION:');
    console.log('[ImageOptimization]   Original Ratio:', originalRatio.toFixed(4));
    console.log('[ImageOptimization]   Target Ratio:', targetRatio.toFixed(4));
    console.log('[ImageOptimization]   Difference:', ratioDifference.toFixed(6));
    console.log('[ImageOptimization]   Preserved:', ratioDifference < 0.001 ? 'YES ✓' : 'NO ✗');
    
    // Select quality based on orientation
    const quality = landscape ? UPLOAD_SIZE_LANDSCAPE.quality : UPLOAD_SIZE_PORTRAIT.quality;
    console.log('[ImageOptimization] ========================================');
    console.log('[ImageOptimization] COMPRESSION SETTINGS:');
    console.log('[ImageOptimization]   Quality:', quality);
    console.log('[ImageOptimization]   Format: JPEG');
    
    // Compress and resize the image
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [
        // Resize to target dimensions - this maintains aspect ratio
        { resize: { width: targetDimensions.width, height: targetDimensions.height } },
      ],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );
    
    const duration = Date.now() - startTime;
    console.log('[ImageOptimization] ========================================');
    console.log('[ImageOptimization] COMPRESSION COMPLETE:');
    console.log('[ImageOptimization]   Duration:', duration, 'ms');
    console.log('[ImageOptimization]   Optimized URI:', result.uri);
    console.log('[ImageOptimization] ========================================');
    console.log('[ImageOptimization] FINAL IMAGE DIMENSIONS:');
    console.log('[ImageOptimization]   Final Width:', result.width, 'px');
    console.log('[ImageOptimization]   Final Height:', result.height, 'px');
    console.log('[ImageOptimization]   Final Aspect Ratio:', (result.width / result.height).toFixed(4));
    console.log('[ImageOptimization] ========================================');
    console.log('[ImageOptimization] SIZE REDUCTION:');
    console.log('[ImageOptimization]   Width Reduction:', ((1 - result.width / dimensions.width) * 100).toFixed(1), '%');
    console.log('[ImageOptimization]   Height Reduction:', ((1 - result.height / dimensions.height) * 100).toFixed(1), '%');
    console.log('[ImageOptimization] ========================================');
    
    return result.uri;
  } catch (error) {
    console.error('[ImageOptimization] ========================================');
    console.error('[ImageOptimization] ERROR COMPRESSING IMAGE:');
    console.error('[ImageOptimization]   Error:', error);
    console.error('[ImageOptimization] ========================================');
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
