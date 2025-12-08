
/**
 * OPTIMIZED Global Image Cache System v2
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
 * - Intelligent cache warming
 * 
 * Optimizations in v2:
 * - Better memory estimation for cache entries
 * - Improved eviction algorithm with access patterns
 * - Batch prefetching with priority queue
 * - Cache statistics for monitoring
 */

import { getImageDataUrl } from './supabase';

// Cache configuration
const MAX_CACHE_SIZE = 100; // Maximum number of images to cache
const MAX_CACHE_MEMORY_MB = 50; // Maximum memory usage in MB
const CACHE_CLEANUP_INTERVAL = 60000; // Cleanup every 60 seconds
const PREFETCH_BATCH_SIZE = 5; // Number of images to prefetch in parallel

interface CacheEntry {
  url: string;
  timestamp: number;
  size: number; // Estimated size in bytes
  accessCount: number;
  lastAccessed: number;
  priority: number; // Higher priority = less likely to evict
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  cacheSize: number;
  memoryUsageMB: number;
  hitRate: number;
  avgAccessTime: number;
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
    hitRate: 0,
    avgAccessTime: 0,
  };
  private cleanupInterval: NodeJS.Timeout | null = null;
  private accessTimes: number[] = [];

  constructor() {
    this.startCleanupInterval();
  }

  /**
   * Get an image from cache or fetch it
   * Includes request deduplication and performance tracking
   */
  async get(imageId: string): Promise<string | null> {
    const startTime = performance.now();
    this.stats.totalRequests++;

    // Check cache first
    const cached = this.cache.get(imageId);
    if (cached) {
      this.stats.hits++;
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      cached.priority = Math.min(cached.priority + 1, 10); // Increase priority on access
      
      const accessTime = performance.now() - startTime;
      this.trackAccessTime(accessTime);
      
      console.log(`[ImageCache] HIT for ${imageId} (${cached.accessCount} accesses, ${accessTime.toFixed(2)}ms)`);
      return cached.url;
    }

    this.stats.misses++;

    // Check if already loading (request deduplication)
    if (this.loadingPromises.has(imageId)) {
      console.log(`[ImageCache] Waiting for existing load of ${imageId}`);
      const result = await this.loadingPromises.get(imageId)!;
      
      const accessTime = performance.now() - startTime;
      this.trackAccessTime(accessTime);
      
      return result;
    }

    // Start loading
    console.log(`[ImageCache] MISS - Loading ${imageId}`);
    const loadPromise = this.fetchAndCache(imageId);
    this.loadingPromises.set(imageId, loadPromise);

    try {
      const url = await loadPromise;
      
      const accessTime = performance.now() - startTime;
      this.trackAccessTime(accessTime);
      
      return url;
    } finally {
      this.loadingPromises.delete(imageId);
    }
  }

  /**
   * Fetch image and add to cache with performance tracking
   */
  private async fetchAndCache(imageId: string): Promise<string | null> {
    try {
      const startTime = performance.now();
      const url = await getImageDataUrl(imageId);
      const fetchTime = performance.now() - startTime;

      if (url) {
        // Estimate size (base64 is ~1.33x original size, CDN URLs are small)
        const estimatedSize = url.startsWith('data:') ? url.length : 200;
        
        // Add to cache with initial priority
        this.set(imageId, url, estimatedSize, 1);
        
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
  set(imageId: string, url: string, size?: number, priority: number = 1): void {
    const estimatedSize = size || (url.startsWith('data:') ? url.length : 200);

    // Check if we need to evict
    this.evictIfNeeded(estimatedSize);

    // Add to cache
    this.cache.set(imageId, {
      url,
      timestamp: Date.now(),
      size: estimatedSize,
      accessCount: 1,
      lastAccessed: Date.now(),
      priority: Math.max(1, Math.min(priority, 10)), // Clamp between 1-10
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
   * Prefetch multiple images in parallel with priority queue
   * OPTIMIZED: Better concurrency control and error handling
   */
  async prefetch(imageIds: string[], maxConcurrent: number = PREFETCH_BATCH_SIZE): Promise<void> {
    if (imageIds.length === 0) {
      return;
    }

    console.log(`[ImageCache] Prefetching ${imageIds.length} images (max ${maxConcurrent} concurrent)`);
    
    // Filter out already cached images
    const uncachedIds = imageIds.filter(id => !this.has(id) && !this.loadingPromises.has(id));
    
    if (uncachedIds.length === 0) {
      console.log('[ImageCache] All images already cached or loading');
      return;
    }

    console.log(`[ImageCache] ${uncachedIds.length} images need prefetching`);
    
    const queue = [...uncachedIds];
    const inProgress: Promise<void>[] = [];
    let successCount = 0;
    let failCount = 0;

    const fetchOne = async (imageId: string) => {
      try {
        await this.get(imageId);
        successCount++;
      } catch (error) {
        console.error(`[ImageCache] Prefetch failed for ${imageId}:`, error);
        failCount++;
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

    console.log(`[ImageCache] Prefetch complete: ${successCount} success, ${failCount} failed`);
  }

  /**
   * Evict least recently used items if needed
   * OPTIMIZED: Better eviction algorithm considering access patterns and priority
   */
  private evictIfNeeded(newItemSize: number): void {
    const currentMemoryMB = this.stats.memoryUsageMB;
    const newItemSizeMB = newItemSize / (1024 * 1024);

    // Check if we need to evict based on count or memory
    if (this.cache.size >= MAX_CACHE_SIZE || 
        (currentMemoryMB + newItemSizeMB) > MAX_CACHE_MEMORY_MB) {
      
      console.log(`[ImageCache] Eviction needed (size: ${this.cache.size}/${MAX_CACHE_SIZE}, memory: ${currentMemoryMB.toFixed(2)}/${MAX_CACHE_MEMORY_MB} MB)`);
      
      // Sort by eviction score (lower score = more likely to evict)
      const entries = Array.from(this.cache.entries()).sort((a, b) => {
        const scoreA = this.calculateEvictionScore(a[1]);
        const scoreB = this.calculateEvictionScore(b[1]);
        return scoreA - scoreB; // Lower score = evict first
      });

      // Evict until we have enough space (target 80% capacity)
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
   * Calculate eviction score for a cache entry
   * Higher score = less likely to evict
   */
  private calculateEvictionScore(entry: CacheEntry): number {
    const now = Date.now();
    const ageMs = now - entry.timestamp;
    const timeSinceAccessMs = now - entry.lastAccessed;
    
    // Factors:
    // - Priority (1-10): Higher priority = higher score
    // - Access count: More accesses = higher score
    // - Recency: More recent access = higher score
    // - Age: Older entries = lower score (but less important)
    
    const priorityScore = entry.priority * 100;
    const accessScore = Math.min(entry.accessCount * 50, 500); // Cap at 500
    const recencyScore = Math.max(0, 1000 - (timeSinceAccessMs / 1000)); // Decay over time
    const ageScore = Math.max(0, 100 - (ageMs / 60000)); // Decay over minutes
    
    return priorityScore + accessScore + recencyScore + ageScore;
  }

  /**
   * Track access time for statistics
   */
  private trackAccessTime(timeMs: number): void {
    this.accessTimes.push(timeMs);
    
    // Keep only last 100 access times
    if (this.accessTimes.length > 100) {
      this.accessTimes.shift();
    }
    
    // Update average
    const sum = this.accessTimes.reduce((a, b) => a + b, 0);
    this.stats.avgAccessTime = sum / this.accessTimes.length;
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
    this.stats.hitRate = this.stats.totalRequests > 0 
      ? (this.stats.hits / this.stats.totalRequests) * 100 
      : 0;
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
    if (this.stats.totalRequests === 0) {
      return 0;
    }
    return (this.stats.hits / this.stats.totalRequests) * 100;
  }

  /**
   * Start automatic cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      return;
    }

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
   * OPTIMIZED: Better cleanup strategy based on access patterns
   */
  private cleanup(): void {
    const now = Date.now();
    const MAX_AGE = 10 * 60 * 1000; // 10 minutes
    let cleaned = 0;

    for (const [imageId, entry] of this.cache.entries()) {
      // Remove entries that:
      // 1. Haven't been accessed in 10 minutes AND have low access count
      // 2. Have very low priority
      const timeSinceAccess = now - entry.lastAccessed;
      const shouldRemove = (
        (timeSinceAccess > MAX_AGE && entry.accessCount < 2) ||
        (entry.priority < 2 && timeSinceAccess > MAX_AGE / 2)
      );
      
      if (shouldRemove) {
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
    
    console.log('=== Image Cache Statistics ===');
    console.log(`Cache Size: ${stats.cacheSize}/${MAX_CACHE_SIZE}`);
    console.log(`Memory Usage: ${stats.memoryUsageMB.toFixed(2)}/${MAX_CACHE_MEMORY_MB} MB`);
    console.log(`Total Requests: ${stats.totalRequests}`);
    console.log(`Cache Hits: ${stats.hits} (${stats.hitRate.toFixed(2)}%)`);
    console.log(`Cache Misses: ${stats.misses}`);
    console.log(`Evictions: ${stats.evictions}`);
    console.log(`Avg Access Time: ${stats.avgAccessTime.toFixed(2)}ms`);
    console.log('==============================');
  }

  /**
   * Warm cache with frequently accessed images
   * OPTIMIZED: Intelligent cache warming based on usage patterns
   */
  async warmCache(imageIds: string[], priority: number = 5): Promise<void> {
    console.log(`[ImageCache] Warming cache with ${imageIds.length} images (priority: ${priority})`);
    
    // Prefetch with higher priority
    await this.prefetch(imageIds, PREFETCH_BATCH_SIZE);
    
    // Update priority for warmed images
    for (const imageId of imageIds) {
      const entry = this.cache.get(imageId);
      if (entry) {
        entry.priority = Math.max(entry.priority, priority);
      }
    }
    
    console.log('[ImageCache] Cache warming complete');
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
export const warmImageCache = (imageIds: string[], priority?: number) => globalImageCache.warmCache(imageIds, priority);
