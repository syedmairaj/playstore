/**
 * useSWRCache Hook - Stale-While-Revalidate Pattern
 *
 * Implements the SWR pattern with IndexedDB for keyword data:
 * 1. Render cached data immediately (instant UI)
 * 2. Fetch fresh data in background (if cache is older than 24h)
 * 3. Keep stale data if fetch fails (graceful degradation)
 * 4. Minimize API calls by checking cache timestamp first
 *
 * Bilingual support: EN/AR with automatic direction detection
 *
 * Usage:
 * ```typescript
 * const { data, isLoading, isValidating, error, mutate } = useSWRCache(
 *   'competitor-keywords',
 *   async () => fetchKeywordsFromAPI(),
 *   { language: 'en' }
 * );
 *
 * if (data) {
 *   return <KeywordList keywords={data} />;
 * }
 *
 * if (isLoading) {
 *   return <LoadingSpinner />;
 * }
 *
 * if (error) {
 *   return <ErrorMessage error={error} />;
 * }
 * ```
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getIndexedDBManager, SWRResponse } from '@/lib/cache/indexed-db-manager';

export interface UseSWRCacheOptions {
  language?: 'en' | 'ar';
  workspaceId?: string;
  userId?: string;
  revalidateOnFocus?: boolean;
  dedupingInterval?: number;
  focusThrottleInterval?: number;
  onError?: (error: Error) => void;
  onSuccess?: (data: unknown) => void;
  forceRefresh?: boolean; // ✅ Force immediate refresh bypassing cache
}

export interface UseSWRCacheResponse<T = unknown> {
  data: T | null;
  isLoading: boolean;
  isValidating: boolean;
  error: Error | null;
  source: 'cache' | 'fresh' | 'stale' | 'error';
  isFresh: boolean;
  isStale: boolean;
  lastUpdated: string;
  age: number;
  mutate: (data?: T) => Promise<void>;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * USE SWR CACHE HOOK
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function useSWRCache<T = unknown>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseSWRCacheOptions = {}
): UseSWRCacheResponse<T> {
  const {
    language = 'en',
    workspaceId = '',
    userId = '',
    revalidateOnFocus = true,
    dedupingInterval = 2000,
    focusThrottleInterval = 5 * 60 * 1000, // 5 minutes
    onError,
    onSuccess,
    forceRefresh = false, // ✅ Default: use cache, false = allow cache
  } = options;

  // State management
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [cacheResponse, setCacheResponse] = useState<SWRResponse<T> | null>(null);

  // Refs for deduping and throttling
  const fetchPromiseRef = useRef<Promise<T> | null>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const lastRevalidateTimeRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  const dbManager = getIndexedDBManager();

  // ═══════════════════════════════════════════════════════════════════════
  // MUTATE: Manually update cache and trigger revalidation
  // ═══════════════════════════════════════════════════════════════════════

  const mutate = useCallback(
    async (newData?: T) => {
      try {
        console.log('[SWRCache] 🔄 MUTATE triggered:', { key, language });

        if (newData !== undefined) {
          // Update local state
          setData(newData);
          setError(null);

          // Update IndexedDB cache
          await dbManager.set(key, newData, language, workspaceId, userId);
          console.log('[SWRCache] ✅ Data mutated and cached:', { key });

          onSuccess?.(newData);
        }

        // Trigger revalidation
        await revalidate();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('[SWRCache] ❌ Mutate failed:', error);
        setError(error);
        onError?.(error);
      }
    },
    [key, language, workspaceId, userId, dbManager]
  );

  // ═══════════════════════════════════════════════════════════════════════
  // REVALIDATE: Fetch fresh data in background
  // ═══════════════════════════════════════════════════════════════════════

  const revalidate = useCallback(async (): Promise<T | null> => {
    // Deduping: if already fetching, return existing promise
    if (fetchPromiseRef.current) {
      console.log('[SmartCache] ⏳ Deduping - already fetching:', { key });
      return fetchPromiseRef.current;
    }

    // Throttling: don't revalidate too frequently
    const now = Date.now();
    if (now - lastFetchTimeRef.current < dedupingInterval) {
      console.log('[SmartCache] ⏸️ Throttled - fetching too frequently:', { key });
      return data;
    }

    try {
      setIsValidating(true);
      lastFetchTimeRef.current = now;

      console.log('[SmartCache] 🔄 REVALIDATE starting (updating lastFetched):', {
        key,
        language,
        timestamp: new Date().toISOString(),
      });

      // Create fetch promise
      const fetchPromise = (async () => {
        try {
          // ═══════════════════════════════════════════════════════════
          // STEP 1: Fetch fresh data from source
          // ═══════════════════════════════════════════════════════════
          const freshData = await fetcher();

          // ═══════════════════════════════════════════════════════════
          // STEP 2: Store in cache (already sets lastFetched + timestamps)
          // ═══════════════════════════════════════════════════════════
          // ✅ OPTIMIZED: dbManager.set() already handles all timestamps:
          //    - Sets lastFetched = now
          //    - Sets revalidateAt = now + 24h
          //    - Sets expiresAt = now + 7d
          //    - Increments refreshCount
          // ✅ No need for separate updateLastFetched call (saves 1-2 seconds!)
          await dbManager.set<T>(key, freshData, language, workspaceId, userId);

          console.log('[SmartCache] ✅ REVALIDATE + REFRESH success:', {
            key,
            language,
            dataSize: JSON.stringify(freshData).length,
            message: 'Data fetched and cached with fresh timestamps',
          });

          return freshData;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          console.error('[SmartCache] ❌ REVALIDATE failed:', {
            key,
            language,
            error: error.message,
          });

          // Keep stale cache on failure (graceful degradation)
          console.warn('[SmartCache] ⚠️ Using stale cache due to fetch failure');
          throw error;
        }
      })();

      fetchPromiseRef.current = fetchPromise;
      const freshData = await fetchPromise;

      if (isMountedRef.current) {
        setData(freshData);
        setError(null);
        onSuccess?.(freshData);
      }

      return freshData;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (isMountedRef.current) {
        // Only set error if we don't have any data (don't block UI with error)
        if (!data) {
          setError(error);
          onError?.(error);
        } else {
          // We have stale data, just log the warning
          console.warn('[SmartCache] ⚠️ Using stale data:', { key, error: error.message });
        }
      }

      return data;
    } finally {
      fetchPromiseRef.current = null;
      if (isMountedRef.current) {
        setIsValidating(false);
      }
    }
  }, [key, language, workspaceId, userId, fetcher, dedupingInterval, dbManager, data]);

  // ═══════════════════════════════════════════════════════════════════════
  // INITIAL LOAD: Get from cache first, then revalidate if stale
  // ═══════════════════════════════════════════════════════════════════════

  useEffect(() => {
    isMountedRef.current = true;

    const initializeData = async () => {
      try {
        console.log('[SmartCache] 📍 INITIALIZE starting:', {
          key,
          language,
          forceRefresh,
          timestamp: new Date().toISOString(),
        });

        // ═══════════════════════════════════════════════════════════════
        // STEP 1: Check if force refresh is enabled
        // ═══════════════════════════════════════════════════════════════
        if (forceRefresh) {
          console.log('[SmartCache] 🔴 FORCE REFRESH enabled - bypassing cache');
          setIsLoading(true);
          await revalidate();
          return;
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: Get from IndexedDB (instant render)
        // ═══════════════════════════════════════════════════════════════
        const cachedResponse = await dbManager.get<T>(key, language, workspaceId, userId);

        if (!isMountedRef.current) return;

        console.log('[SmartCache] 📦 Cache response (7-day smart cache):', {
          key,
          source: cachedResponse.source,
          isFresh: cachedResponse.isFresh,
          isStale: cachedResponse.isStale,
          age: `${(cachedResponse.age / 1000 / 60 / 60).toFixed(1)}h`,
          ageInDays: `${(cachedResponse.age / 1000 / 60 / 60 / 24).toFixed(2)}d`,
          message: cachedResponse.message,
        });

        setCacheResponse(cachedResponse);

        if (cachedResponse.data) {
          // Instant render from cache
          setData(cachedResponse.data);
          setIsLoading(false);

          // ═══════════════════════════════════════════════════════════
          // STEP 3: 7-Day Smart Cache Logic
          // ═══════════════════════════════════════════════════════════
          // Fresh (< 24h):     Don't revalidate
          // Stale (24h-7d):    Background sync (don't block UI)
          // Expired (> 7d):    Force refresh (block until fresh)
          // ═══════════════════════════════════════════════════════════

          if (cachedResponse.shouldRevalidate) {
            console.log('[SmartCache] 🔄 Background sync triggered (24h-7d)');
            // Trigger revalidation in background (don't await)
            revalidate().catch((err) => {
              console.warn('[SmartCache] Background revalidation failed:', err);
            });
          } else {
            console.log('[SmartCache] ✅ Cache is fresh (< 24h) - no sync needed');
          }
        } else {
          // No cache - fetch fresh data
          console.log('[SmartCache] 📡 No cache found - fetching fresh data');
          setIsLoading(true);
          await revalidate();
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('[SmartCache] ❌ Initialization failed:', error);
        setError(error);
        onError?.(error);
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
  }, [key, language, workspaceId, userId, dbManager, revalidate, forceRefresh]);

  // ═══════════════════════════════════════════════════════════════════════
  // REVALIDATE ON FOCUS
  // ═══════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!revalidateOnFocus) return;

    const handleFocus = () => {
      const now = Date.now();
      // Throttle revalidation on focus to avoid too many requests
      if (now - lastRevalidateTimeRef.current > focusThrottleInterval) {
        console.log('[SWRCache] 👀 Window focused - revalidating:', { key });
        lastRevalidateTimeRef.current = now;
        revalidate().catch((err) => {
          console.warn('[SWRCache] Revalidate on focus failed:', err);
        });
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [key, revalidateOnFocus, focusThrottleInterval, revalidate]);

  // ═══════════════════════════════════════════════════════════════════════
  // RETURN RESPONSE
  // ═══════════════════════════════════════════════════════════════════════

  return {
    data,
    isLoading,
    isValidating,
    error,
    source: cacheResponse?.source || 'cache',
    isFresh: cacheResponse?.isFresh || false,
    isStale: cacheResponse?.isStale || false,
    lastUpdated: cacheResponse?.lastUpdated || 'Never',
    age: cacheResponse?.age || 0,
    mutate,
  };
}

export default useSWRCache;
