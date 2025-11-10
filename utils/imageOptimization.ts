
/**
 * Image optimization utilities for efficient image loading
 * Provides functions to generate optimized image URLs with proper sizing
 */

import { getImageCDNUrl, getOptimizedImageUrl as getOptimizedUrl } from './supabase';

export interface ImageSize {
  width: number;
  height: number;
  quality?: number;
}

/**
 * Predefined image sizes for different use cases
 */
export const IMAGE_SIZES = {
  THUMBNAIL: { width: 150, height: 150, quality: 70 },
  CARD: { width: 400, height: 400, quality: 80 },
  PREVIEW: { width: 800, height: 800, quality: 85 },
  FULL: { width: 1200, height: 1200, quality: 90 },
} as const;

/**
 * Get optimized image URL using CDN
 * Now uses the Supabase Edge Function with caching
 */
export function getOptimizedImageUrl(
  imageId: string,
  size: ImageSize = IMAGE_SIZES.CARD
): string {
  console.log(`Getting optimized image URL: ${size.width}x${size.height} @ ${size.quality}% quality`);
  
  return getImageCDNUrl(imageId, {
    width: size.width,
    height: size.height,
    quality: size.quality || 85,
  });
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

/**
 * Get optimized image URL by size name
 */
export function getOptimizedImageUrlBySize(
  imageId: string,
  sizeName: 'thumbnail' | 'card' | 'preview' | 'full' = 'card'
): string {
  return getOptimizedUrl(imageId, sizeName);
}
