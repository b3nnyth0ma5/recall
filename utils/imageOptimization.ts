
/**
 * Image optimization utilities for efficient image loading
 * Provides functions to generate optimized image URLs with proper sizing
 */

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
