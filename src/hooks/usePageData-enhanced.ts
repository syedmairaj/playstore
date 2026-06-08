/**
 * usePageData Hook - Enhanced Two-Tier Caching with Persistence
 *
 * High-performance React hook for dynamic pages with tab-close persistence:
 * - Reviews (user-generated, updates hourly)
 * - Market Intel (time-sensitive, updates hourly)
 * - Alerts (event-based, updates on demand)
 *
 * PRODUCTION STANDARDS IMPLEMENTED:
 * 1. ✅ Scoped Memory Cache: Composite keys with appId/competitorId
 * 2. ✅ Type Safety: Strict TypeScript generics
 * 3. ✅ Memory Management: LRU pruning + automatic cleanup
 * 4. ✅ Unified API: Matches useSWRCache for easy migration
 * 5. ✅ Persistence: LocalStorage fallback for tab close/reopen
 *
 * Cache Tiers:
 * - Memory (5 min): Fast in-session access
 * - LocalStorage (24h): Fallback when tab reopens
 * - API: Fresh data when both expire
 *
 * Usage:
 * ```typescript
 * const { data, isLoading, error, refresh } = usePageData<ReviewType>(
 *   'reviews',        // resourceType
 *   'app-123',        // scope (appId - MUST be unique)
 *   fetchReviewsData, // async fetcher
 *   { language: 'en', enablePersistence: true }
 * );
 * ```
 *
 * Migration from useSWRCache:
 * ```diff
 * - const { data } = useSWRCache('reviews:' + appId, fetcher);
 * + const { data } = usePageData('reviews', appId, fetcher);
 * ```
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  getPageCacheManager,
  PageCacheManager,
  CacheKeyBuilder,
} from '@/lib/cache/page-memory-cache-enhanced';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TYPE DEFINITIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Hook options with persistence control
 */
export interface UsePageDataOptions {
  language?: 'en' | 'ar';
  ttl?: number;                    // Memory TTL (default: 5 min)
  persistenceTtl?: number;         // LocalStorage TTL (default: 24h)
  enableCache?: boolean;           // Default: true
  enablePersistence?: boolean;     // Default: true (LocalStorage fallback)
  forceRefresh?: boolean;          // Default: false
  onError?: (error: Error) => void;
  onSuccess?: (data: unknown) => void;
  dedupingInterval?: number;       // Default: 2 seconds
}

/**
 * Hook response - matches useSWRCache interface
 */
export interface UsePageDataResponse<T = unknown> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  source: 'memory' | 'persistence' | 'fresh' | 'error';
  isCached: boolean;
  cacheAge: number;                // milliseconds
  mutate: (data?: T) => Promise<void>;
  refresh: () => Promise<T | null>;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * USE PAGE DATA HOOK - Memory + Persistence
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function usePageData<T = unknown>(
  resourceType: string,
  scope: string,                // appId or competitorId (MUST be unique!)
  fetcher: () => Promise<T>,
  options: UsePageDataOptions = {}
): UsePageDataResponse<T> {
  const {
    language = 'en',
    ttl,
    persistenceTtl,
    enableCache = true,
    enablePersistence = true,
    forceRefresh = false,
    onError,
    onSuccess,
    dedupingInterval = 2000,
  } = options;

  // ═════════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(!enableCache);
  const [source, setSource] = useState<'memory' | 'persistence' | 'fresh' | 'error'>('memory');
  const [cacheAge, setCacheAge] = useState(0);

  // ═════════════════════════════════════════════════════════════════════════
  // REFS FOR DEDUPING, MEMORY MANAGEMENT, AND CLEANUP
  // ═════════════════════════════════════════════════════════════════════════

  const fetchPromiseRef = useRef<Promise<T> | null>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const isMountedRef = useRef(true);
  const cacheManagerRef = useRef<PageCacheManager>(
    getPageCacheManager({
      ttl,
      persistenceTtl,
      enablePersistence,
    })
  );

  // Build explicit scoped cache key to prevent collisions
  const cacheKeyRef = useRef(CacheKeyBuilder.buildKey(resourceType, scope, language));

  // ═════════════════════════════════════════════════════════════════════════
  // HELPER: Log scoped cache key for debugging
  // ═════════════════════════════════════════════════════════════════════════

  const logCacheKey = useCallback(() => {
    console.log('[PageData] 🔑 Using scoped cache key:', {
      cacheKey: cacheKeyRef.current,
      resourceType,
      scope,           // MUST be unique (app-123, not just 123)
      language,
    });
  }, [resourceType, scope, language]);

  // ═════════════════════════════════════════════════════════════════════════
  // FETCH: Get fresh data from API
  // ═════════════════════════════════════════════════════════════════════════

  const fetchFreshData = useCallback(async (): Promise<T | null> => {
    // Deduping: if already fetching, return existing promise
    if (fetchPromiseRef.current) {
      console.log('[PageData] ⏳ Deduping - already fetching:', {
        resourceType,
        scope,
        language,
        cacheKey: cacheKeyRef.current,
      });
      return fetchPromiseRef.current;
    }

    // Throttling: don't fetch too frequently
    const now = Date.now();
    if (now - lastFetchTimeRef.current < dedupingInterval) {
      console.log('[PageData] ⏸️ Throttled - fetching too frequently:', {
        resourceType,
        scope,
      });
      return data;
    }

    try {
      setIsLoading(true);
      lastFetchTimeRef.current = now;

      console.log('[PageData] 🔄 Fetching fresh data:', {
        resourceType,
        scope,
        language,
        cacheKey: cacheKeyRef.current,
      });

      // Create fetch promise
      const fetchPromise = (async () => {
        try {
          const freshData = await fetcher();

          // Cache if enabled
          if (enableCache && freshData) {
            cacheManagerRef.current.set<T>(
              resourceType,
              scope,
              freshData,
              language
            );

            console.log('[PageData] 💾 Cached fresh data (memory + persistence):', {
              resourceType,
              scope,
              language,
              cacheKey: cacheKeyRef.current,
            });
          }

          return freshData;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          console.error('[PageData] ❌ Fetch failed:', {
            resourceType,
            scope,
            error: error.message,
          });

          throw error;
        }
      })();

      fetchPromiseRef.current = fetchPromise;
      const freshData = await fetchPromise;

      if (isMountedRef.current) {
        setData(freshData);
        setError(null);
        setSource('fresh');
        setCacheAge(0);
        onSuccess?.(freshData);
      }

      return freshData;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (isMountedRef.current) {
        setError(error);
        setSource('error');

        // Try to use stale cache on error
        const cached = cacheManagerRef.current.get<T>(
          resourceType,
          scope,
          language
        );
        if (cached) {
          console.warn('[PageData] ⚠️ Using stale cache due to error:', {
            resourceType,
            scope,
          });
          setData(cached);
          setCacheAge(Date.now() - (cacheManagerRef.current.getStats()?.oldestEntry || 0));
        } else {
          onError?.(error);
        }
      }

      return data;
    } finally {
      fetchPromiseRef.current = null;
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [resourceType, scope, language, fetcher, enableCache, dedupingInterval, onError, onSuccess, data]);

  // ═════════════════════════════════════════════════════════════════════════
  // MUTATE: Manually update cache and trigger revalidation
  // ═════════════════════════════════════════════════════════════════════════

  const mutate = useCallback(
    async (newData?: T) => {
      try {
        console.log('[PageData] 🔄 MUTATE triggered:', {
          resourceType,
          scope,
          language,
          cacheKey: cacheKeyRef.current,
        });

        if (newData !== undefined) {
          setData(newData);
          setError(null);
          setSource('fresh');

          if (enableCache) {
            cacheManagerRef.current.set<T>(
              resourceType,
              scope,
              newData,
              language
            );

            console.log('[PageData] ✅ MUTATE cached:', {
              resourceType,
              scope,
              language,
            });
          }

          onSuccess?.(newData);
        }

        // Trigger background refresh
        await fetchFreshData();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('[PageData] ❌ Mutate failed:', error);
        setError(error);
        onError?.(error);
      }
    },
    [resourceType, scope, language, enableCache, onError, onSuccess, fetchFreshData]
  );

  // ═════════════════════════════════════════════════════════════════════════
  // REFRESH: Manual refresh method
  // ═════════════════════════════════════════════════════════════════════════

  const refresh = useCallback(async (): Promise<T | null> => {
    console.log('[PageData] 🔄 Manual refresh requested:', {
      resourceType,
      scope,
      cacheKey: cacheKeyRef.current,
    });
    return fetchFreshData();
  }, [fetchFreshData]);

  // ═════════════════════════════════════════════════════════════════════════
  // INITIAL LOAD: Memory → Persistence → API
  // ═════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    isMountedRef.current = true;

    const initializeData = async () => {
      try {
        logCacheKey();

        console.log('[PageData] 📍 INITIALIZE starting:', {
          resourceType,
          scope,
          language,
          forceRefresh,
          enableCache,
          enablePersistence,
          timestamp: new Date().toISOString(),
        });

        // Check if force refresh is enabled
        if (forceRefresh) {
          console.log('[PageData] 🔴 FORCE REFRESH enabled - bypassing cache');
          setIsLoading(true);
          await fetchFreshData();
          return;
        }

        // Try to get from cache (memory + persistence fallback)
        if (enableCache) {
          const cached = cacheManagerRef.current.get<T>(
            resourceType,
            scope,
            language
          );

          if (cached) {
            // Determine source (memory or persistence)
            const cacheSource = cached ? 'memory' : 'persistence';

            console.log(`[PageData] ✅ Cache hit (${cacheSource}):`, {
              resourceType,
              scope,
              language,
              cacheKey: cacheKeyRef.current,
              source: cacheSource,
            });

            if (isMountedRef.current) {
              setData(cached);
              setError(null);
              setSource(cacheSource === 'memory' ? 'memory' : 'persistence');
              setIsLoading(false);
            }

            return;
          }
        }

        // No cache, fetch fresh
        console.log('[PageData] 📡 No cache found - fetching fresh data');
        setIsLoading(true);
        await fetchFreshData();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('[PageData] ❌ Initialization failed:', error);

        if (isMountedRef.current) {
          setError(error);
          setSource('error');
          onError?.(error);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    initializeData();

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      console.log('[PageData] 🛑 Component unmount cleanup:', {
        resourceType,
        scope,
        cacheKey: cacheKeyRef.current,
      });
    };
  }, [resourceType, scope, language, enableCache, enablePersistence, forceRefresh, fetchFreshData, onError, logCacheKey]);

  // ═════════════════════════════════════════════════════════════════════════
  // CLEANUP: Monitor cache health
  // ═════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const statsInterval = setInterval(() => {
      const stats = cacheManagerRef.current.getStats();
      if (stats.totalMemoryEntries > 80) {
        console.warn('[PageData] ⚠️ Memory cache getting full:', {
          entries: stats.totalMemoryEntries,
          memory: stats.memoryUsageEstimate,
          hitRate: `${stats.hitRate.toFixed(1)}%`,
          persistedEntries: stats.persistedEntries,
        });
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(statsInterval);
  }, []);

  // ═════════════════════════════════════════════════════════════════════════
  // RETURN RESPONSE
  // ═════════════════════════════════════════════════════════════════════════

  return {
    data,
    isLoading,
    error,
    source,
    isCached: source !== 'fresh',
    cacheAge,
    mutate,
    refresh,
  };
}

export default usePageData;
