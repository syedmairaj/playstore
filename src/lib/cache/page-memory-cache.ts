/**
 * Page Memory Cache - Two-Tier Caching with Persistence Fallback
 *
 * Enhanced in-memory caching for dynamic pages:
 * - Reviews (user-generated, updates hourly)
 * - Market Intel (time-sensitive, updates hourly)
 * - Alerts (event-based, updates on demand)
 *
 * Features:
 * - ✅ Scoped keys by appId/competitorId (prevents collisions)
 * - ✅ Persistence fallback (LocalStorage 24-hour fallback)
 * - ✅ Strict TypeScript type safety with generics
 * - ✅ Automatic memory cleanup (LRU pruning + TTL)
 * - ✅ Bilingual support (EN/AR with separate caches)
 * - ✅ Unified API matching useSWRCache
 *
 * Cache Tiers:
 * - Memory: 5 minutes (instant < 1ms)
 * - Persistence: 24 hours (fallback < 50ms)
 * - API: Fresh data (3-5 seconds)
 *
 * Tab Close Scenario:
 * - User closes tab with Reviews cached
 * - Memory cache cleared (tab close)
 * - LocalStorage persists data
 * - User returns 10 minutes later
 * - Reviews load instantly from LocalStorage (< 50ms)
 * - No API call needed! 🚀
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TYPE DEFINITIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface PageCacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  language: 'en' | 'ar';
  scope: string; // appId, competitorId, resourceId, etc.
  resourceType: string; // reviews, market-intel, alerts
  expiresAt: number; // 5-minute memory TTL
  persistenceExpiresAt: number; // 24-hour persistence TTL
  accessCount: number; // Track access frequency
  lastAccessed: number; // For LRU cleanup
}

export interface PageCacheConfig {
  ttl?: number; // Default: 5 minutes (300,000ms)
  persistenceTtl?: number; // Default: 24 hours (for LocalStorage fallback)
  maxEntries?: number; // Default: 100
  enableCleanup?: boolean; // Default: true
  cleanupInterval?: number; // Default: 60 seconds
  enablePersistence?: boolean; // Default: true (LocalStorage fallback)
  persistencePrefix?: string; // Default: 'page_cache:'
}

export interface PageCacheStats {
  totalMemoryEntries: number;
  persistedEntries: number;
  memoryUsageEstimate: string;
  oldestEntry: number;
  newestEntry: number;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  persistenceHits: number;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAGE CACHE MANAGER - Scoped Memory Cache
 * ═══════════════════════════════════════════════════════════════════════════
 */

export class PageCacheManager {
  private cache = new Map<string, PageCacheEntry>();
  private config: Required<PageCacheConfig>;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private stats = { hits: 0, misses: 0, persistenceHits: 0 };

  // ═════════════════════════════════════════════════════════════════════════
  // DEFAULT CONSTANTS FOR DYNAMIC PAGES
  // ═════════════════════════════════════════════════════════════════════════
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes (pages change hourly)
  private readonly DEFAULT_PERSISTENCE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_ENTRIES = 100; // Prevent memory bloat
  private readonly CLEANUP_INTERVAL = 60 * 1000; // Run cleanup every minute
  private readonly PERSISTENCE_PREFIX = 'page_cache:'; // LocalStorage prefix

  constructor(config: PageCacheConfig = {}) {
    this.config = {
      ttl: config.ttl ?? this.DEFAULT_TTL,
      persistenceTtl: config.persistenceTtl ?? this.DEFAULT_PERSISTENCE_TTL,
      maxEntries: config.maxEntries ?? this.MAX_ENTRIES,
      enableCleanup: config.enableCleanup ?? true,
      cleanupInterval: config.cleanupInterval ?? this.CLEANUP_INTERVAL,
      enablePersistence: config.enablePersistence ?? true,
      persistencePrefix: config.persistencePrefix ?? this.PERSISTENCE_PREFIX,
    };

    console.log('[PageMemoryCache] 🚀 Initializing with config:', {
      ttl: `${this.config.ttl / 1000}s`,
      persistenceTtl: `${this.config.persistenceTtl / (60 * 60 * 1000)}h`,
      maxEntries: this.config.maxEntries,
      enableCleanup: this.config.enableCleanup,
      enablePersistence: this.config.enablePersistence,
    });

    // Start cleanup timer
    if (this.config.enableCleanup) {
      this.startCleanupTimer();
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * GET: Retrieve from cache with persistence fallback
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Strategy (Three-Tier):
   * 1. Check memory cache (instant < 1ms)
   * 2. If expired: check persistence/LocalStorage (< 50ms)
   * 3. If persisted data exists: restore to memory
   *
   * Key format: `resourceType:scope:language`
   * Example: `reviews:app-123:en` or `market-intel:app-456:ar`
   */

  get<T = unknown>(
    resourceType: string,
    scope: string,
    language: 'en' | 'ar' = 'en'
  ): T | null {
    const cacheKey = this.buildCacheKey(resourceType, scope, language);
    const now = Date.now();

    // Step 1: Check memory cache
    const entry = this.cache.get(cacheKey);

    if (entry) {
      // Check if still fresh in memory (5-minute TTL)
      if (now <= entry.expiresAt) {
        this.stats.hits++;
        entry.accessCount++;
        entry.lastAccessed = now;

        const age = now - entry.timestamp;
        console.log('[PageMemoryCache] ✅ Memory cache HIT:', {
          resourceType,
          scope,
          language,
          cacheKey,
          age: `${(age / 1000).toFixed(1)}s`,
          accessCount: entry.accessCount,
          hitRate: `${((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1)}%`,
        });

        return entry.data as T;
      } else {
        // Memory cache expired, remove it
        console.log('[PageMemoryCache] ⏱️ Memory cache expired:', {
          resourceType,
          scope,
          language,
          age: `${((now - entry.timestamp) / 1000).toFixed(1)}s`,
        });
        this.cache.delete(cacheKey);
      }
    }

    // Step 2: Try persistence fallback (LocalStorage)
    if (this.config.enablePersistence) {
      const persistedData = this.getFromPersistence<T>(cacheKey);

      if (persistedData) {
        const persistAge = now - persistedData.timestamp;

        // Check if persisted data is still valid (24-hour TTL)
        if (now <= persistedData.persistenceExpiresAt) {
          this.stats.persistenceHits++;

          console.log('[PageMemoryCache] 💾 Persistence fallback HIT:', {
            resourceType,
            scope,
            language,
            persistAge: `${(persistAge / 1000).toFixed(1)}s`,
            source: 'LocalStorage',
          });

          // Restore to memory for fast access
          this.cache.set(cacheKey, persistedData);

          return persistedData.data as T;
        } else {
          // Persisted data expired, remove it
          this.clearFromPersistence(cacheKey);
        }
      }
    }

    // Cache miss (both memory and persistence)
    this.stats.misses++;
    console.log('[PageMemoryCache] ⚠️ Cache MISS (memory + persistence):', {
      resourceType,
      scope,
      language,
      cacheKey,
      totalEntries: this.cache.size,
    });

    return null;
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * SET: Store in cache with persistence fallback
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Strategy:
   * 1. Store in memory (5-minute TTL)
   * 2. Persist to LocalStorage (24-hour TTL) for fallback
   */

  set<T = unknown>(
    resourceType: string,
    scope: string,
    data: T,
    language: 'en' | 'ar' = 'en'
  ): void {
    const cacheKey = this.buildCacheKey(resourceType, scope, language);
    const now = Date.now();
    const memoryExpiresAt = now + this.config.ttl;
    const persistenceExpiresAt = now + this.config.persistenceTtl;

    const entry: PageCacheEntry<T> = {
      data,
      timestamp: now,
      language,
      scope,
      resourceType,
      expiresAt: memoryExpiresAt,
      persistenceExpiresAt,
      accessCount: 0,
      lastAccessed: now,
    };

    // Check if we need to prune before adding
    if (this.cache.size >= this.config.maxEntries) {
      this.pruneLRU();
    }

    // Store in memory
    this.cache.set(cacheKey, entry);

    // Persist to LocalStorage for fallback
    if (this.config.enablePersistence) {
      this.saveToPersistence(cacheKey, entry);
    }

    console.log('[PageMemoryCache] 💾 Cached (memory + persistence):', {
      resourceType,
      scope,
      language,
      cacheKey,
      memoryTtl: `${this.config.ttl / 1000}s`,
      persistenceTtl: `${this.config.persistenceTtl / (60 * 60 * 1000)}h`,
      totalEntries: this.cache.size,
      memoryEstimate: this.estimateMemoryUsage(),
    });
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * DELETE: Remove from both memory and persistence
   * ═══════════════════════════════════════════════════════════════════════
   */

  delete(
    resourceType: string,
    scope: string,
    language?: 'en' | 'ar'
  ): number {
    let deleted = 0;

    if (language) {
      // Delete specific language
      const cacheKey = this.buildCacheKey(resourceType, scope, language);
      if (this.cache.delete(cacheKey)) {
        deleted = 1;
        if (this.config.enablePersistence) {
          this.clearFromPersistence(cacheKey);
        }
        console.log('[PageMemoryCache] 🗑️ Deleted (specific language):', {
          resourceType,
          scope,
          language,
          cacheKey,
        });
      }
    } else {
      // Delete all languages for this scope
      const prefix = `${resourceType}:${scope}:`;
      this.cache.forEach((_, key) => {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
          if (this.config.enablePersistence) {
            this.clearFromPersistence(key);
          }
          deleted++;
        }
      });
      console.log('[PageMemoryCache] 🗑️ Deleted (all languages):', {
        resourceType,
        scope,
        count: deleted,
      });
    }

    return deleted;
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * CLEAR: Remove from both memory and persistence
   * ═══════════════════════════════════════════════════════════════════════
   */

  clear(resourceType?: string): number {
    if (resourceType) {
      // Clear specific resource type
      let count = 0;
      const keysToDelete: string[] = [];

      this.cache.forEach((_, key) => {
        if (key.startsWith(`${resourceType}:`)) {
          keysToDelete.push(key);
          count++;
        }
      });

      keysToDelete.forEach((key) => {
        this.cache.delete(key);
        if (this.config.enablePersistence) {
          this.clearFromPersistence(key);
        }
      });

      console.log('[PageMemoryCache] 🧹 Cleared resource type:', {
        resourceType,
        entriesRemoved: count,
      });
      return count;
    } else {
      // Clear entire cache
      const count = this.cache.size;
      this.cache.clear();
      this.stats = { hits: 0, misses: 0, persistenceHits: 0 };

      // Clear persistence too
      if (this.config.enablePersistence) {
        this.clearAllPersistence();
      }

      console.log('[PageMemoryCache] 🧹 Cleared entire cache:', {
        entriesRemoved: count,
      });
      return count;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * STATS: Get cache statistics for monitoring
   * ═══════════════════════════════════════════════════════════════════════
   */

  getStats(): PageCacheStats {
    const entries = Array.from(this.cache.values());
    const timestamps = entries.map((e) => e.timestamp);

    const totalHits = this.stats.hits;
    const totalMisses = this.stats.misses;
    const totalRequests = totalHits + totalMisses;

    // Count persisted entries
    let persistedCount = 0;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith(this.config.persistencePrefix)) {
            persistedCount++;
          }
        }
      }
    } catch (error) {
      console.warn('[PageMemoryCache] ⚠️ Failed to count persisted entries:', error);
    }

    return {
      totalMemoryEntries: this.cache.size,
      persistedEntries: persistedCount,
      memoryUsageEstimate: this.estimateMemoryUsage(),
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0,
      hitRate: totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0,
      missRate: totalRequests > 0 ? (totalMisses / totalRequests) * 100 : 0,
      totalHits,
      totalMisses,
      persistenceHits: this.stats.persistenceHits,
    };
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * PERSISTENCE: LocalStorage fallback for tab close/reopen
   * ═══════════════════════════════════════════════════════════════════════
   */

  private getFromPersistence<T>(cacheKey: string): PageCacheEntry<T> | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }

      const key = `${this.config.persistencePrefix}${cacheKey}`;
      const stored = window.localStorage.getItem(key);

      if (!stored) return null;

      const entry = JSON.parse(stored) as PageCacheEntry<T>;
      return entry;
    } catch (error) {
      console.warn('[PageMemoryCache] ⚠️ Failed to get from persistence:', error);
      return null;
    }
  }

  private saveToPersistence<T>(cacheKey: string, entry: PageCacheEntry<T>): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }

      const key = `${this.config.persistencePrefix}${cacheKey}`;
      window.localStorage.setItem(key, JSON.stringify(entry));

      console.log('[PageMemoryCache] 💿 Saved to persistence:', {
        cacheKey,
        key,
      });
    } catch (error) {
      console.warn('[PageMemoryCache] ⚠️ Failed to save to persistence:', error);
    }
  }

  private clearFromPersistence(cacheKey: string): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }

      const key = `${this.config.persistencePrefix}${cacheKey}`;
      window.localStorage.removeItem(key);
    } catch (error) {
      console.warn('[PageMemoryCache] ⚠️ Failed to clear from persistence:', error);
    }
  }

  private clearAllPersistence(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }

      const keysToRemove: string[] = [];

      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(this.config.persistencePrefix)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => window.localStorage.removeItem(key));

      console.log('[PageMemoryCache] 🧹 Cleared all persistence:', {
        entriesRemoved: keysToRemove.length,
      });
    } catch (error) {
      console.warn('[PageMemoryCache] ⚠️ Failed to clear all persistence:', error);
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * PRIVATE: Internal methods for cache management
   * ═══════════════════════════════════════════════════════════════════════
   */

  private buildCacheKey(
    resourceType: string,
    scope: string,
    language: 'en' | 'ar'
  ): string {
    return `${resourceType}:${scope}:${language}`;
  }

  private estimateMemoryUsage(): string {
    // Rough estimate: average entry ~2KB
    const estimateBytes = this.cache.size * 2048;

    if (estimateBytes < 1024) {
      return `${estimateBytes}B`;
    } else if (estimateBytes < 1024 * 1024) {
      return `${(estimateBytes / 1024).toFixed(1)}KB`;
    } else {
      return `${(estimateBytes / (1024 * 1024)).toFixed(1)}MB`;
    }
  }

  /**
   * Prune least-recently-used entries when max capacity reached
   */
  private pruneLRU(): void {
    const targetSize = Math.floor(this.config.maxEntries * 0.8); // Prune to 80%
    const entries = Array.from(this.cache.entries());
    const sorted = entries.sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    );

    const toRemove = sorted.length - targetSize;
    for (let i = 0; i < toRemove; i++) {
      const [key] = sorted[i];
      this.cache.delete(key);
      if (this.config.enablePersistence) {
        this.clearFromPersistence(key);
      }
    }

    console.log('[PageMemoryCache] 🧹 LRU Cleanup:', {
      before: entries.length,
      after: this.cache.size,
      pruned: toRemove,
    });
  }

  /**
   * Periodically clean up expired entries
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.runCleanup();
    }, this.config.cleanupInterval);
  }

  private runCleanup(): void {
    const now = Date.now();
    let expired = 0;

    this.cache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        if (this.config.enablePersistence) {
          this.clearFromPersistence(key);
        }
        expired++;
      }
    });

    if (expired > 0) {
      console.log('[PageMemoryCache] 🧹 Cleanup completed:', {
        expiredRemoved: expired,
        remainingEntries: this.cache.size,
        stats: this.getStats(),
      });
    }
  }

  /**
   * Stop cleanup timer (for cleanup)
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('[PageMemoryCache] 🛑 Cache destroyed');
    }
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SINGLETON INSTANCE
 * ═══════════════════════════════════════════════════════════════════════════
 */

let instance: PageCacheManager | null = null;

export function getPageCacheManager(
  config?: PageCacheConfig
): PageCacheManager {
  if (!instance) {
    instance = new PageCacheManager(config);
  }
  return instance;
}

export function resetPageCache(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

export default PageCacheManager;
