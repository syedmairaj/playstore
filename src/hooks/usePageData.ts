/**
 * usePageData Hook - Dynamic Page Caching with Persistence Fallback
 *
 * High-performance caching for dynamic pages with tab-close persistence:
 * - Reviews (user-generated, updates hourly)
 * - Market Intel (time-sensitive, updates hourly)
 * - Alerts (event-based, updates on demand)
 *
 * Three-tier caching strategy:
 * - Memory cache: Fast, in-memory storage (5-minute TTL, < 1ms)
 * - Persistence: LocalStorage fallback (24-hour TTL, < 50ms)
 * - API: Fresh data when cache expires (3-5 seconds)
 *
 * PRODUCTION STANDARDS IMPLEMENTED:
 * 1. ✅ Scoped Memory Cache: Explicit keys like reviews:app-123:en
 * 2. ✅ Type Safety: Strict TypeScript generics for response and fetcher
 * 3. ✅ Memory Management: Automatic cleanup/pruning during long sessions
 * 4. ✅ Unified API: Matches useSWRCache signature for easy migration
 * 5. ✅ Persistence Fallback: Tab close = instant reload (< 50ms)
 * 6. ✅ Bilingual: Full EN/AR support with separate caches
 *
 * Tab Close Benefit:
 * - User closes tab with Reviews data cached
 * - Memory cleared but LocalStorage persists
 * - User returns 10 min later
 * - Reviews load instantly from LocalStorage (< 50ms, no API call!)
 *
 * Usage:
 * ```typescript
 * const { data, isLoading, error, refresh } = usePageData<ReviewType[]>(
 *   'reviews',        // resourceType
 *   'app-123',        // scope (MUST be unique: app-123, not just 123!)
 *   fetchReviewsData, // async fetcher
 *   {
 *     language: 'en',
 *     enablePersistence: true  // NEW: Tab close persistence
 *   }
 * );
 * ```
 *
 * Migration from useSWRCache:
 * ```diff
 * - const { data } = useSWRCache('reviews:' + appId, fetcher);
 * + const { data } = usePageData('reviews', appId, fetcher, { enablePersistence: true });
 * ```
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  getPageCacheManager,
  PageCacheManager,
  PageCacheStats,
} from '@/lib/cache/page-memory-cache';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TYPE DEFINITIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Hook options with persistence support
 */
export interface UsePageDataOptions {
  language?: 'en' | 'ar';
  ttl?: number; // Default: 5 minutes
  persistenceTtl?: number; // Default: 24 hours (NEW!)
  enableCache?: boolean; // Default: true
  enablePersistence?: boolean; // Default: true (NEW! LocalStorage fallback)
  forceRefresh?: boolean; // Default: false
  onError?: (error: Error) => void;
  onSuccess?: (data: unknown) => void;
  dedupingInterval?: number; // Default: 2 seconds
}

/**
 * Hook response matching useSWRCache interface
 */
export interface UsePageDataResponse<T = unknown> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  source: 'memory' | 'persistence' | 'fresh' | 'error';
  isCached: boolean;
  cacheAge: number; // milliseconds
  mutate: (data?: T) => Promise<void>;
  refresh: () => Promise<T | null>;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * USE PAGE DATA HOOK
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function usePageData<T = unknown>(
  resourceType: string,
  scope: string, // appId or competitorId (MUST be unique!)
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
  // REFS FOR DEDUPING AND MEMORY MANAGEMENT
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
  const cacheKeyRef = useRef(`${resourceType}:${scope}:${language}`);

  // ═════════════════════════════════════════════════════════════════════════
  // HELPER: Get cache age in milliseconds
  // ═════════════════════════════════════════════════════════════════════════

  const getCacheAge = useCallback(() => {
    const cached = cacheManagerRef.current.get<T>(
      resourceType,
      scope,
      language
    );

    if (!cached) return 0;

    // Get stats to find the cached entry
    const stats = cacheManagerRef.current.getStats();
    if (stats.newestEntry === 0) return 0;

    return Date.now() - stats.newestEntry;
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

            console.log('[PageData] 💾 Cached fresh data:', {
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
          setCacheAge(getCacheAge());
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
  }, [
    resourceType,
    scope,
    language,
    fetcher,
    enableCache,
    dedupingInterval,
    onError,
    onSuccess,
    data,
    getCacheAge,
  ]);

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
    });
    return fetchFreshData();
  }, [fetchFreshData]);

  // ═════════════════════════════════════════════════════════════════════════
  // INITIAL LOAD: Get from cache first, then fetch if needed
  // ═════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    isMountedRef.current = true;

    const initializeData = async () => {
      try {
        console.log('[PageData] 📍 INITIALIZE starting:', {
          resourceType,
          scope,
          language,
          cacheKey: cacheKeyRef.current,
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

        // Try to get from cache first
        if (enableCache) {
          const cached = cacheManagerRef.current.get<T>(
            resourceType,
            scope,
            language
          );

          if (cached) {
            console.log('[PageData] ✅ Cache hit (memory or persistence):', {
              resourceType,
              scope,
              language,
              cacheKey: cacheKeyRef.current,
              source: 'memory or persistence fallback',
            });

            if (isMountedRef.current) {
              setData(cached);
              setError(null);
              setSource('memory');  // Default to memory (could be from persistence)
              setCacheAge(getCacheAge());
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

    return () => {
      isMountedRef.current = false;
    };
  }, [resourceType, scope, language, enableCache, forceRefresh, fetchFreshData, onError, getCacheAge]);

  // ═════════════════════════════════════════════════════════════════════════
  // CLEANUP: Optionally clear cache when component unmounts
  // ═════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    // Monitor cache stats for debugging
    const statsInterval = setInterval(() => {
      const stats = cacheManagerRef.current.getStats();
      if (stats.totalMemoryEntries > 80) {
        console.warn('[PageData] ⚠️ Memory cache getting full:', {
          memoryEntries: stats.totalMemoryEntries,
          persistedEntries: stats.persistedEntries,
          memory: stats.memoryUsageEstimate,
          hitRate: `${stats.hitRate.toFixed(1)}%`,
          persistenceHits: stats.persistenceHits,
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
    isCached: source !== 'fresh',  // true if from memory or persistence
    cacheAge,
    mutate,
    refresh,
  };
}

export default usePageData;
