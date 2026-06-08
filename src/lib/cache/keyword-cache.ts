/**
 * Keyword Cache Manager - Professional Caching Strategy
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CACHING ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Problem: 5-10 second fetch latency on every expand, even if user opened
 * same competitor 40 minutes ago. Data hasn't changed, but we re-fetch anyway.
 *
 * Solution: Three-tier caching strategy
 * ┌──────────────────────────────────────────────────────────┐
 * │ Tier 1: In-Memory Cache (During Session)                │
 * │ - Fastest: 0ms lookup                                    │
 * │ - Key: `${workspaceId}:${competitorId}:${language}`     │
 * │ - TTL: Session duration (cleared on unmount)             │
 * │ - Use: Hot data, frequently accessed                     │
 * └──────────────────────────────────────────────────────────┘
 *                          ↓
 * ┌──────────────────────────────────────────────────────────┐
 * │ Tier 2: Browser LocalStorage Cache                      │
 * │ - Fast: ~1-5ms lookup (no network)                      │
 * │ - Key: `playstore:keywords:${hash}`                     │
 * │ - TTL: 24 hours (configurable)                          │
 * │ - Use: Data persists across sessions                    │
 * │ - Fallback: When in-memory miss                         │
 * └──────────────────────────────────────────────────────────┘
 *                          ↓
 * ┌──────────────────────────────────────────────────────────┐
 * │ Tier 3: API Fetch (Network Request)                     │
 * │ - Slow: 5-10 seconds (network latency)                  │
 * │ - Fresh data from server                                │
 * │ - Use: When cache miss and must have latest             │
 * └──────────────────────────────────────────────────────────┘
 *
 * Flow:
 * User clicks expand
 *   ↓
 * Check in-memory cache?
 *   ├─ HIT → Return instantly (0ms)
 *   └─ MISS ↓
 * Check localStorage?
 *   ├─ HIT → Return instantly (1-5ms)
 *   └─ MISS ↓
 * Fetch from API (show loading)
 *   ├─ SUCCESS → Cache in-memory + localStorage
 *   └─ ERROR → Use initialKeywords
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Cache entry structure
 */
export interface KeywordCacheEntry {
  keywords: string[];
  timestamp: number;
  expiresAt: number;
  language: string;
  competitorId: string;
  workspaceId: string;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** In-memory cache TTL in milliseconds (default: 1 hour) */
  memoryTTL?: number;
  /** LocalStorage cache TTL in milliseconds (default: 24 hours) */
  storageTTL?: number;
  /** Enable localStorage caching (default: true) */
  enableStorage?: boolean;
  /** Storage key prefix (default: 'playstore:keywords') */
  storageKeyPrefix?: string;
}

/**
 * In-memory cache store (cleared on page reload or unmount)
 */
const memoryCache = new Map<string, KeywordCacheEntry>();

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<CacheConfig> = {
  memoryTTL: 60 * 60 * 1000, // 1 hour
  storageTTL: 24 * 60 * 60 * 1000, // 24 hours
  enableStorage: true,
  storageKeyPrefix: 'playstore:keywords',
};

/**
 * Generate cache key from parameters
 * Format: `workspaceId:competitorId:language`
 */
function generateCacheKey(
  workspaceId: string,
  competitorId: string,
  language: string
): string {
  return `${workspaceId}:${competitorId}:${language}`;
}

/**
 * Generate storage key (for localStorage)
 * Format: `prefix:hash` (hash to keep keys readable)
 */
function generateStorageKey(cacheKey: string, prefix: string): string {
  // Simple hash for readability (not cryptographic)
  const hash = Buffer.from(cacheKey).toString('base64').slice(0, 16);
  return `${prefix}:${hash}`;
}

/**
 * Check if cache entry is expired
 */
function isExpired(entry: KeywordCacheEntry): boolean {
  return Date.now() > entry.expiresAt;
}

/**
 * Get keywords from cache (Tier 1: In-Memory or Tier 2: LocalStorage)
 *
 * Returns cached keywords if available and not expired, null otherwise.
 * Attempts in-memory first, then localStorage.
 *
 * @returns Keywords array or null if not cached/expired
 */
export function getCachedKeywords(
  workspaceId: string,
  competitorId: string,
  language: string,
  config: CacheConfig = {}
): string[] | null {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const cacheKey = generateCacheKey(workspaceId, competitorId, language);

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 1: In-Memory Cache (Fastest)
  // ═══════════════════════════════════════════════════════════════════════
  const memoryEntry = memoryCache.get(cacheKey);
  if (memoryEntry && !isExpired(memoryEntry)) {
    console.log('[KeywordCache] ⚡ HIT: In-Memory cache', {
      competitorId,
      keywords: memoryEntry.keywords.length,
      cacheAge: Date.now() - memoryEntry.timestamp,
    });
    return memoryEntry.keywords;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 2: LocalStorage Cache (Fast, Persistent)
  // ═══════════════════════════════════════════════════════════════════════
  if (finalConfig.enableStorage && typeof window !== 'undefined') {
    try {
      const storageKey = generateStorageKey(cacheKey, finalConfig.storageKeyPrefix);
      const stored = localStorage.getItem(storageKey);

      if (stored) {
        const entry = JSON.parse(stored) as KeywordCacheEntry;

        if (!isExpired(entry)) {
          console.log('[KeywordCache] 💾 HIT: LocalStorage cache', {
            competitorId,
            keywords: entry.keywords.length,
            cacheAge: Date.now() - entry.timestamp,
          });

          // Restore to in-memory cache for next access
          memoryCache.set(cacheKey, entry);
          return entry.keywords;
        } else {
          // Expired: delete from storage
          console.log('[KeywordCache] ⏰ EXPIRED: LocalStorage entry too old', {
            competitorId,
            age: Date.now() - entry.timestamp,
            ttl: finalConfig.storageTTL,
          });
          localStorage.removeItem(storageKey);
        }
      }
    } catch (error) {
      console.error('[KeywordCache] ⚠️ LocalStorage error:', error);
      // Continue with API fetch
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CACHE MISS: Must fetch from API
  // ═══════════════════════════════════════════════════════════════════════
  console.log('[KeywordCache] 🔴 MISS: No cache, will fetch from API', {
    competitorId,
    language,
  });
  return null;
}

/**
 * Set keywords in cache (Both Tier 1 and Tier 2)
 *
 * Stores keywords in:
 * 1. In-memory cache (session duration)
 * 2. LocalStorage (24 hours, configurable)
 *
 * @param keywords Array of keyword strings
 */
export function setCachedKeywords(
  workspaceId: string,
  competitorId: string,
  language: string,
  keywords: string[],
  config: CacheConfig = {}
): void {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const cacheKey = generateCacheKey(workspaceId, competitorId, language);
  const now = Date.now();

  const entry: KeywordCacheEntry = {
    keywords,
    timestamp: now,
    expiresAt: now + finalConfig.memoryTTL,
    language,
    competitorId,
    workspaceId,
  };

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 1: Set In-Memory Cache
  // ═══════════════════════════════════════════════════════════════════════
  memoryCache.set(cacheKey, entry);
  console.log('[KeywordCache] ⚡ CACHE SET: In-Memory', {
    competitorId,
    keywords: keywords.length,
    ttl: finalConfig.memoryTTL,
  });

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 2: Set LocalStorage Cache
  // ═══════════════════════════════════════════════════════════════════════
  if (finalConfig.enableStorage && typeof window !== 'undefined') {
    try {
      const storageEntry: KeywordCacheEntry = {
        ...entry,
        expiresAt: now + finalConfig.storageTTL, // Longer TTL for storage
      };

      const storageKey = generateStorageKey(cacheKey, finalConfig.storageKeyPrefix);
      localStorage.setItem(storageKey, JSON.stringify(storageEntry));

      console.log('[KeywordCache] 💾 CACHE SET: LocalStorage', {
        competitorId,
        keywords: keywords.length,
        ttl: finalConfig.storageTTL,
      });
    } catch (error) {
      console.error('[KeywordCache] ⚠️ LocalStorage error:', error);
      // In-memory cache still works
    }
  }
}

/**
 * Clear specific cache entry
 */
export function clearKeywordCache(
  workspaceId: string,
  competitorId: string,
  language: string,
  config: CacheConfig = {}
): void {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const cacheKey = generateCacheKey(workspaceId, competitorId, language);

  // Clear in-memory
  memoryCache.delete(cacheKey);

  // Clear from storage
  if (finalConfig.enableStorage && typeof window !== 'undefined') {
    try {
      const storageKey = generateStorageKey(cacheKey, finalConfig.storageKeyPrefix);
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('[KeywordCache] ⚠️ LocalStorage error:', error);
    }
  }

  console.log('[KeywordCache] 🗑️ CLEARED:', { competitorId });
}

/**
 * Clear all keyword caches
 */
export function clearAllKeywordCaches(config: CacheConfig = {}): void {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Clear in-memory
  memoryCache.clear();

  // Clear all from storage
  if (finalConfig.enableStorage && typeof window !== 'undefined') {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith(finalConfig.storageKeyPrefix)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('[KeywordCache] ⚠️ LocalStorage error:', error);
    }
  }

  console.log('[KeywordCache] 🗑️ ALL CACHES CLEARED');
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats() {
  const storageKeys =
    typeof window !== 'undefined'
      ? Object.keys(localStorage).filter((k) => k.startsWith('playstore:keywords')).length
      : 0;

  return {
    inMemory: memoryCache.size,
    inStorage: storageKeys,
    total: memoryCache.size + storageKeys,
  };
}
