
/**
 * OPTIMIZED Global Image Cache System
 * 
 * This module provides a centralized, memory-efficient image caching system
 * with automatic cleanup, request deduplication, and performance monitoring.
 * 
 * Key Features:
 * - Global cache shared across all components
 * - Request deduplication (prevents multiple fetches of same image)
 * - Automatic memory management with LRU eviction
 * - Performance metrics and monitoring
 * - Prefetching support for better UX
 */

import { getImageDataUrl } from './supabase';

// Cache configuration
const MAX_CACHE_SIZE = 100; // Maximum number of images to cache
const MAX_CACHE_MEMORY_MB = 50; // Maximum memory usage in MB
const CACHE_CLEANUP_INTERVAL = 60000; // Cleanup every 60 seconds

interface CacheEntry {
  url: string;
  timestamp: number;
  size: number; // Estimated size in bytes
  accessCount: number;
  lastAccessed: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  cacheSize: number;
  memoryUsageMB: number;
}

class GlobalImageCache {
  private cache: Map<string, CacheEntry> = new Map();
  private loadingPromises: Map<string, Promise<string | null>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalRequests: 0,
    cacheSize: 0,
    memoryUsageMB: 0,
  };
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  /**
   * Get an image from cache or fetch it
   * Includes request deduplication
   */
  async get(imageId: string): Promise<string | null> {
    this.stats.totalRequests++;

    // Check cache first
    const cached = this.cache.get(imageId);
    if (cached) {
      this.stats.hits++;
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      console.log(`[ImageCache] HIT for ${imageId} (${cached.accessCount} accesses)`);
      return cached.url;
    }

    this.stats.misses++;

    // Check if already loading
    if (this.loadingPromises.has(imageId)) {
      console.log(`[ImageCache] Waiting for existing load of ${imageId}`);
      return this.loadingPromises.get(imageId)!;
    }

    // Start loading
    console.log(`[ImageCache] MISS - Loading ${imageId}`);
    const loadPromise = this.fetchAndCache(imageId);
    this.loadingPromises.set(imageId, loadPromise);

    try {
      const url = await loadPromise;
      return url;
    } finally {
      this.loadingPromises.delete(imageId);
    }
  }

  /**
   * Fetch image and add to cache
   */
  private async fetchAndCache(imageId: string): Promise<string | null> {
    try {
      const startTime = performance.now();
      const url = await getImageDataUrl(imageId);
      const fetchTime = performance.now() - startTime;

      if (url) {
        // Estimate size (base64 is ~1.33x original size)
        const estimatedSize = url.length;
        
        // Add to cache
        this.set(imageId, url, estimatedSize);
        
        console.log(`[ImageCache] Cached ${imageId} (${(estimatedSize / 1024).toFixed(2)} KB, ${fetchTime.toFixed(2)}ms)`);
      }

      return url;
    } catch (error) {
      console.error(`[ImageCache] Error loading ${imageId}:`, error);
      return null;
    }
  }

  /**
   * Set an image in cache with automatic eviction
   */
  set(imageId: string, url: string, size?: number): void {
    const estimatedSize = size || url.length;

    // Check if we need to evict
    this.evictIfNeeded(estimatedSize);

    // Add to cache
    this.cache.set(imageId, {
      url,
      timestamp: Date.now(),
      size: estimatedSize,
      accessCount: 1,
      lastAccessed: Date.now(),
    });

    this.updateStats();
  }

  /**
   * Check if image is in cache
   */
  has(imageId: string): boolean {
    return this.cache.has(imageId);
  }

  /**
   * Remove image from cache
   */
  remove(imageId: string): void {
    this.cache.delete(imageId);
    this.updateStats();
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    console.log('[ImageCache] Clearing cache');
    this.cache.clear();
    this.loadingPromises.clear();
    this.updateStats();
  }

  /**
   * Prefetch multiple images in parallel
   */
  async prefetch(imageIds: string[], maxConcurrent: number = 3): Promise<void> {
    console.log(`[ImageCache] Prefetching ${imageIds.length} images (max ${maxConcurrent} concurrent)`);
    
    const queue = [...imageIds];
    const inProgress: Promise<void>[] = [];

    const fetchOne = async (imageId: string) => {
      if (!this.has(imageId) && !this.loadingPromises.has(imageId)) {
        await this.get(imageId);
      }
    };

    while (queue.length > 0 || inProgress.length > 0) {
      // Start new fetches up to maxConcurrent
      while (inProgress.length < maxConcurrent && queue.length > 0) {
        const imageId = queue.shift()!;
        const promise = fetchOne(imageId);
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

    console.log(`[ImageCache] Prefetch complete`);
  }

  /**
   * Evict least recently used items if needed
   */
  private evictIfNeeded(newItemSize: number): void {
    const currentMemoryMB = this.stats.memoryUsageMB;
    const newItemSizeMB = newItemSize / (1024 * 1024);

    // Check if we need to evict based on count or memory
    if (this.cache.size >= MAX_CACHE_SIZE || 
        (currentMemoryMB + newItemSizeMB) > MAX_CACHE_MEMORY_MB) {
      
      console.log(`[ImageCache] Eviction needed (size: ${this.cache.size}/${MAX_CACHE_SIZE}, memory: ${currentMemoryMB.toFixed(2)}/${MAX_CACHE_MEMORY_MB} MB)`);
      
      // Sort by LRU (least recently used first)
      const entries = Array.from(this.cache.entries()).sort((a, b) => {
        // Prioritize by access count and recency
        const scoreA = a[1].accessCount * 0.3 + (Date.now() - a[1].lastAccessed) * 0.7;
        const scoreB = b[1].accessCount * 0.3 + (Date.now() - b[1].lastAccessed) * 0.7;
        return scoreB - scoreA; // Higher score = more likely to evict
      });

      // Evict until we have enough space
      let evicted = 0;
      for (const [imageId, entry] of entries) {
        if (this.cache.size < MAX_CACHE_SIZE * 0.8 && 
            this.stats.memoryUsageMB < MAX_CACHE_MEMORY_MB * 0.8) {
          break;
        }
        
        this.cache.delete(imageId);
        evicted++;
        this.stats.evictions++;
      }

      console.log(`[ImageCache] Evicted ${evicted} items`);
      this.updateStats();
    }
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.size;
    }

    this.stats.cacheSize = this.cache.size;
    this.stats.memoryUsageMB = totalSize / (1024 * 1024);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get hit rate percentage
   */
  getHitRate(): number {
    if (this.stats.totalRequests === 0) return 0;
    return (this.stats.hits / this.stats.totalRequests) * 100;
  }

  /**
   * Start automatic cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, CACHE_CLEANUP_INTERVAL);
  }

  /**
   * Stop automatic cleanup interval
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Cleanup old entries
   */
  private cleanup(): void {
    const now = Date.now();
    const MAX_AGE = 10 * 60 * 1000; // 10 minutes
    let cleaned = 0;

    for (const [imageId, entry] of this.cache.entries()) {
      // Remove entries that haven't been accessed in 10 minutes
      if (now - entry.lastAccessed > MAX_AGE && entry.accessCount < 2) {
        this.cache.delete(imageId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[ImageCache] Cleanup: removed ${cleaned} old entries`);
      this.updateStats();
    }
  }

  /**
   * Log cache statistics
   */
  logStats(): void {
    const stats = this.getStats();
    const hitRate = this.getHitRate();
    
    console.log('=== Image Cache Statistics ===');
    console.log(`Cache Size: ${stats.cacheSize}/${MAX_CACHE_SIZE}`);
    console.log(`Memory Usage: ${stats.memoryUsageMB.toFixed(2)}/${MAX_CACHE_MEMORY_MB} MB`);
    console.log(`Total Requests: ${stats.totalRequests}`);
    console.log(`Cache Hits: ${stats.hits} (${hitRate.toFixed(2)}%)`);
    console.log(`Cache Misses: ${stats.misses}`);
    console.log(`Evictions: ${stats.evictions}`);
    console.log('==============================');
  }
}

// Export singleton instance
export const globalImageCache = new GlobalImageCache();

// Export helper functions
export const getCachedImage = (imageId: string) => globalImageCache.get(imageId);
export const setCachedImage = (imageId: string, url: string, size?: number) => globalImageCache.set(imageId, url, size);
export const hasCachedImage = (imageId: string) => globalImageCache.has(imageId);
export const removeCachedImage = (imageId: string) => globalImageCache.remove(imageId);
export const clearImageCache = () => globalImageCache.clear();
export const prefetchImages = (imageIds: string[], maxConcurrent?: number) => globalImageCache.prefetch(imageIds, maxConcurrent);
export const getImageCacheStats = () => globalImageCache.getStats();
export const logImageCacheStats = () => globalImageCache.logStats();
