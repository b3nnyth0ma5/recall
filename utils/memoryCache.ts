
/**
 * NSCache-like Memory Cache Implementation for React Native
 * 
 * Provides iOS NSCache-style caching with:
 * - Cost-based memory management
 * - Count limits
 * - Total cost limits
 * - Automatic eviction (LRU)
 * - Memory pressure handling
 * 
 * Industry standard limits based on iOS best practices:
 * - Images: ~50MB total cost limit, 100 item count limit
 * - Text: ~10MB total cost limit, 500 item count limit
 * - Categories: ~5MB total cost limit, 200 item count limit
 */

export interface CacheItem<T> {
  value: T;
  cost: number;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheConfig {
  name: string;
  countLimit: number;
  totalCostLimit: number; // in bytes
  evictionPolicy?: 'lru' | 'lfu'; // Least Recently Used or Least Frequently Used
}

export class MemoryCache<T> {
  private cache: Map<string, CacheItem<T>>;
  private config: CacheConfig;
  private currentTotalCost: number;

  constructor(config: CacheConfig) {
    this.cache = new Map();
    this.config = {
      evictionPolicy: 'lru',
      ...config,
    };
    this.currentTotalCost = 0;

    if (__DEV__) {
      console.log(`[MemoryCache:${this.config.name}] Initialized with:`);
      console.log(`  - Count Limit: ${this.config.countLimit} items`);
      console.log(`  - Total Cost Limit: ${(this.config.totalCostLimit / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  - Eviction Policy: ${this.config.evictionPolicy}`);
    }
  }

  /**
   * Set an item in the cache with a cost
   * @param key - Cache key
   * @param value - Value to cache
   * @param cost - Cost in bytes (for memory management)
   */
  set(key: string, value: T, cost: number): void {
    // Check if we need to evict items before adding
    this.evictIfNeeded(cost);

    // Remove existing item if present (to update cost)
    if (this.cache.has(key)) {
      const existingItem = this.cache.get(key)!;
      this.currentTotalCost -= existingItem.cost;
    }

    // Add new item
    const item: CacheItem<T> = {
      value,
      cost,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
    };

    this.cache.set(key, item);
    this.currentTotalCost += cost;

    if (__DEV__) {
      console.log(`[MemoryCache:${this.config.name}] SET "${key}" (cost: ${(cost / 1024).toFixed(2)} KB)`);
      console.log(`  - Total items: ${this.cache.size}/${this.config.countLimit}`);
      console.log(`  - Total cost: ${(this.currentTotalCost / 1024 / 1024).toFixed(2)} MB / ${(this.config.totalCostLimit / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  /**
   * Get an item from the cache
   * @param key - Cache key
   * @returns Cached value or undefined
   */
  get(key: string): T | undefined {
    const item = this.cache.get(key);
    
    if (!item) {
      if (__DEV__) {
        console.log(`[MemoryCache:${this.config.name}] MISS "${key}"`);
      }
      return undefined;
    }

    // Update access statistics
    item.accessCount++;
    item.lastAccessed = Date.now();

    if (__DEV__) {
      console.log(`[MemoryCache:${this.config.name}] HIT "${key}" (accessed ${item.accessCount} times)`);
    }
    return item.value;
  }

  /**
   * Check if a key exists in the cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Remove an item from the cache
   */
  remove(key: string): boolean {
    const item = this.cache.get(key);
    
    if (!item) {
      return false;
    }

    this.cache.delete(key);
    this.currentTotalCost -= item.cost;

    if (__DEV__) {
      console.log(`[MemoryCache:${this.config.name}] REMOVE "${key}"`);
      console.log(`  - Total items: ${this.cache.size}/${this.config.countLimit}`);
      console.log(`  - Total cost: ${(this.currentTotalCost / 1024 / 1024).toFixed(2)} MB`);
    }

    return true;
  }

  /**
   * Clear all items from the cache
   */
  clear(): void {
    const itemCount = this.cache.size;
    const totalCost = this.currentTotalCost;

    this.cache.clear();
    this.currentTotalCost = 0;

    if (__DEV__) {
      console.log(`[MemoryCache:${this.config.name}] CLEAR - Removed ${itemCount} items (${(totalCost / 1024 / 1024).toFixed(2)} MB)`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    itemCount: number;
    totalCost: number;
    totalCostMB: number;
    countLimit: number;
    totalCostLimit: number;
    totalCostLimitMB: number;
    utilizationPercent: number;
  } {
    return {
      itemCount: this.cache.size,
      totalCost: this.currentTotalCost,
      totalCostMB: this.currentTotalCost / 1024 / 1024,
      countLimit: this.config.countLimit,
      totalCostLimit: this.config.totalCostLimit,
      totalCostLimitMB: this.config.totalCostLimit / 1024 / 1024,
      utilizationPercent: (this.currentTotalCost / this.config.totalCostLimit) * 100,
    };
  }

  /**
   * Evict items if necessary to make room for new item
   */
  private evictIfNeeded(newItemCost: number): void {
    // Check count limit
    while (this.cache.size >= this.config.countLimit) {
      this.evictOne();
    }

    // Check cost limit
    while (this.currentTotalCost + newItemCost > this.config.totalCostLimit) {
      this.evictOne();
    }
  }

  /**
   * Evict one item based on eviction policy
   */
  private evictOne(): void {
    if (this.cache.size === 0) {
      return;
    }

    let keyToEvict: string | null = null;

    if (this.config.evictionPolicy === 'lru') {
      // Least Recently Used
      let oldestAccess = Date.now();
      
      for (const [key, item] of this.cache.entries()) {
        if (item.lastAccessed < oldestAccess) {
          oldestAccess = item.lastAccessed;
          keyToEvict = key;
        }
      }
    } else {
      // Least Frequently Used
      let lowestAccessCount = Infinity;
      
      for (const [key, item] of this.cache.entries()) {
        if (item.accessCount < lowestAccessCount) {
          lowestAccessCount = item.accessCount;
          keyToEvict = key;
        }
      }
    }

    if (keyToEvict) {
      const item = this.cache.get(keyToEvict)!;
      if (__DEV__) {
        console.log(`[MemoryCache:${this.config.name}] EVICT "${keyToEvict}" (${this.config.evictionPolicy.toUpperCase()}) - cost: ${(item.cost / 1024).toFixed(2)} KB`);
      }
      this.remove(keyToEvict);
    }
  }

  /**
   * Get all keys in the cache
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get the size of the cache
   */
  size(): number {
    return this.cache.size;
  }
}

/**
 * Calculate cost for different data types
 */
export class CostCalculator {
  /**
   * Calculate cost for an image (base64 or URL)
   * Estimates based on string length
   */
  static forImage(imageData: string): number {
    // Base64 images are ~33% larger than binary
    // Estimate: 1 char ≈ 1 byte for base64
    const estimatedBytes = imageData.length;
    
    // Add overhead for object structure
    const overhead = 100; // bytes
    
    return estimatedBytes + overhead;
  }

  /**
   * Calculate cost for text content
   */
  static forText(text: string): number {
    // UTF-16 encoding: 2 bytes per character
    const textBytes = text.length * 2;
    
    // Add overhead for object structure
    const overhead = 50; // bytes
    
    return textBytes + overhead;
  }

  /**
   * Calculate cost for a note object
   */
  static forNote(note: any): number {
    let totalCost = 0;

    // Text content
    if (note.text) {
      totalCost += CostCalculator.forText(note.text);
    }

    // Location data
    if (note.location) {
      totalCost += CostCalculator.forText(note.location);
    }

    // Images (URLs only, not full image data)
    if (note.images && Array.isArray(note.images)) {
      note.images.forEach((url: string) => {
        totalCost += CostCalculator.forText(url);
      });
    }

    // People data
    if (note.people && Array.isArray(note.people)) {
      note.people.forEach((person: any) => {
        if (person.person_name) {
          totalCost += CostCalculator.forText(person.person_name);
        }
      });
    }

    // Base object overhead
    totalCost += 200; // bytes

    return totalCost;
  }

  /**
   * Calculate cost for a category object
   */
  static forCategory(category: any): number {
    let totalCost = 0;

    // Category name
    if (category.category_name) {
      totalCost += CostCalculator.forText(category.category_name);
    }

    // Description
    if (category.category_search_description) {
      totalCost += CostCalculator.forText(category.category_search_description);
    }

    // Icon URL
    if (category.icon_cdn_url) {
      totalCost += CostCalculator.forText(category.icon_cdn_url);
    }

    // Base object overhead
    totalCost += 150; // bytes

    return totalCost;
  }

  /**
   * Calculate cost for people data
   */
  static forPeople(people: any[]): number {
    let totalCost = 0;

    people.forEach(person => {
      if (person.person_name) {
        totalCost += CostCalculator.forText(person.person_name);
      }
      // ID overhead
      totalCost += 50;
    });

    return totalCost;
  }
}

/**
 * Pre-configured cache instances following iOS NSCache best practices
 */

// Image Cache: 50MB limit, 100 items
// Stores base64 image data or CDN URLs
export const imageCache = new MemoryCache<string>({
  name: 'ImageCache',
  countLimit: 100,
  totalCostLimit: 50 * 1024 * 1024, // 50 MB
  evictionPolicy: 'lru',
});

// Text/Note Cache: 10MB limit, 500 items
// Stores full note objects with text, location, etc.
export const noteCache = new MemoryCache<any>({
  name: 'NoteCache',
  countLimit: 500,
  totalCostLimit: 10 * 1024 * 1024, // 10 MB
  evictionPolicy: 'lru',
});

// Category Cache: 5MB limit, 200 items
// Stores category objects
export const categoryCache = new MemoryCache<any>({
  name: 'CategoryCache',
  countLimit: 200,
  totalCostLimit: 5 * 1024 * 1024, // 5 MB
  evictionPolicy: 'lru',
});

// People Cache: 5MB limit, 1000 items
// Stores people associations for recalls
export const peopleCache = new MemoryCache<any[]>({
  name: 'PeopleCache',
  countLimit: 1000,
  totalCostLimit: 5 * 1024 * 1024, // 5 MB
  evictionPolicy: 'lru',
});

/**
 * Global cache manager for monitoring and maintenance
 */
export class CacheManager {
  private static caches = [imageCache, noteCache, categoryCache, peopleCache];

  /**
   * Get statistics for all caches
   */
  static getAllStats() {
    return this.caches.map(cache => cache.getStats());
  }

  /**
   * Clear all caches
   */
  static clearAll(): void {
    if (__DEV__) {
      console.log('[CacheManager] Clearing all caches...');
    }
    this.caches.forEach(cache => cache.clear());
    if (__DEV__) {
      console.log('[CacheManager] All caches cleared');
    }
  }

  /**
   * Log statistics for all caches
   */
  static logStats(): void {
    if (__DEV__) {
      console.log('[CacheManager] ===== CACHE STATISTICS =====');
      
      this.caches.forEach(cache => {
        const stats = cache.getStats();
        console.log(`\n${stats.itemCount > 0 ? '📦' : '📭'} Cache: ${(cache as any).config.name}`);
        console.log(`  Items: ${stats.itemCount}/${stats.countLimit}`);
        console.log(`  Memory: ${stats.totalCostMB.toFixed(2)} MB / ${stats.totalCostLimitMB.toFixed(2)} MB`);
        console.log(`  Utilization: ${stats.utilizationPercent.toFixed(1)}%`);
      });
      
      console.log('\n========================================');
    }
  }

  /**
   * Handle memory warning (simulate iOS memory pressure)
   */
  static handleMemoryWarning(): void {
    if (__DEV__) {
      console.warn('[CacheManager] ⚠️ Memory warning received - clearing caches');
    }
    this.clearAll();
  }
}

// Export singleton instances
export default {
  imageCache,
  noteCache,
  categoryCache,
  peopleCache,
  CostCalculator,
  CacheManager,
};
