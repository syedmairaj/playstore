/**
 * CompetitorSpyClient with SWR Caching
 *
 * Enhanced version with Stale-While-Revalidate pattern:
 * - Instant UI from IndexedDB cache
 * - Background revalidation for fresh data
 * - Graceful degradation on API failures
 * - Bilingual support (EN/AR)
 * - 24-hour cache TTL
 *
 * Integration:
 * 1. Replace old CompetitorSpyClient with this version
 * 2. All keyword data pulls from IndexedDB first
 * 3. Background sync fetches fresh data if cache is stale
 * 4. Falls back to stale cache if network fails
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useI18n } from '@/i18n/client';
import useSWRCache from '@/hooks/useSWRCache';
import { getCachedStagingService } from '@/lib/cache/cached-staging-service';
import { createBrowserClient } from '@/lib/supabase/client';
import { CompetitorKeywordSurfacesReadonly } from "@/components/competitor-spy/competitor-keyword-surfaces-readonly";
import CompetitorSpyHeader from './competitor-spy-header';
import KeywordCurationModeProvider from '@/contexts/KeywordCurationModeContext';
import KeywordSelectionProvider from '@/contexts/KeywordSelectionContext';

interface CompetitorSpyClientProps {
  workspaceId: string;
  appId: string;
  className?: string;
}

interface CompetitorData {
  id: string;
  name: string;
  packageId: string;
  keywords: {
    high_volume: string[];
    intent_based: string[];
    competitor_gap: string[];
  };
  metadata?: Record<string, unknown>;
  lastUpdated: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMPETITOR SPY CLIENT - MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════
 */

export default function CompetitorSpyClient({
  workspaceId,
  appId,
  className = '',
}: CompetitorSpyClientProps) {
  const { locale, t } = useI18n();
  const language = locale === 'ar' ? 'ar' : 'en';
  const [userId, setUserId] = useState<string>('');

  // Initialize Supabase
  const supabase = useMemo(() => createBrowserClient(), []);

  // Get user ID on mount
  React.useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user?.id) {
        setUserId(data.user.id);
      }
    };
    getUser();
  }, [supabase]);

  // ═══════════════════════════════════════════════════════════════════════
  // FETCH COMPETITORS - API CALL FUNCTION
  // ═══════════════════════════════════════════════════════════════════════

  const fetchCompetitors = useCallback(async (): Promise<CompetitorData[]> => {
    console.log('[CompetitorSpyClient] 📡 Fetching competitors from API:', {
      workspaceId,
      appId,
      language,
    });

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/competitors?appId=${appId}&language=${language}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch competitors: ${response.status}`);
      }

      const data = await response.json();

      console.log('[CompetitorSpyClient] ✅ Competitors fetched successfully:', {
        count: data.length,
        timestamp: new Date().toISOString(),
      });

      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error('[CompetitorSpyClient] ❌ Failed to fetch competitors:', error);
      throw error;
    }
  }, [workspaceId, appId, language]);

  // ═══════════════════════════════════════════════════════════════════════
  // USESWR CACHE HOOK
  // Implements SWR pattern:
  // 1. Pulls from IndexedDB immediately (instant render)
  // 2. Triggers background fetch if stale (24h+)
  // 3. Falls back to stale cache if fetch fails
  // ═══════════════════════════════════════════════════════════════════════

  const {
    data: competitors,
    isLoading,
    isValidating,
    error,
    source,
    isFresh,
    isStale,
    lastUpdated,
    age,
    mutate,
  } = useSWRCache<CompetitorData[]>(
    `competitors:${appId}`, // Cache key unique per app
    fetchCompetitors,
    {
      language,
      workspaceId,
      userId,
      revalidateOnFocus: true,
      onError: (error) => {
        console.error('[CompetitorSpyClient] SWR Error:', error);
        // Errors are handled gracefully - stale cache is used if available
      },
      onSuccess: (data) => {
        console.log('[CompetitorSpyClient] SWR Success:', {
          count: (data as CompetitorData[]).length,
          timestamp: new Date().toISOString(),
        });
      },
    }
  );

  // ═══════════════════════════════════════════════════════════════════════
  // HANDLE KEYWORD SELECTION
  // ═══════════════════════════════════════════════════════════════════════

  const handleKeywordSelect = useCallback(
    async (keyword: string, category: string, competitorId: string) => {
      console.log('[CompetitorSpyClient] 📌 Keyword selected:', {
        keyword,
        category,
        competitorId,
        language,
      });

      try {
        // Add to staging vault via cached service
        const cachedService = getCachedStagingService(supabase);

        await cachedService.addSignalWithCache(workspaceId, userId, {
          signalType: 'optimizer_selection',
          content: `Keyword: ${keyword}`,
          language,
          metadata: {
            keyword,
            category,
            competitorId,
          },
          sourceContextId: competitorId,
        });

        console.log('[CompetitorSpyClient] ✅ Keyword selection cached:', {
          keyword,
          competitorId,
        });
      } catch (err) {
        console.error('[CompetitorSpyClient] ❌ Failed to cache keyword selection:', err);
      }
    },
    [supabase, workspaceId, userId, language]
  );

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER STATE
  // ═══════════════════════════════════════════════════════════════════════

  const renderState = () => {
    // Loading state (only if no cached data)
    if (isLoading && !competitors) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-sm text-gray-600">
              {language === 'ar' ? 'جاري التحميل...' : 'Loading competitors...'}
            </p>
          </div>
        </div>
      );
    }

    // Error state (only if no cached data and fetch failed)
    if (error && !competitors) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center text-red-600">
            <p className="font-semibold mb-2">
              {language === 'ar' ? 'حدث خطأ في التحميل' : 'Failed to load competitors'}
            </p>
            <p className="text-sm">{error.message}</p>
            <button
              onClick={() => mutate()}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              {language === 'ar' ? 'إعادة محاولة' : 'Retry'}
            </button>
          </div>
        </div>
      );
    }

    // Success state with data
    return (
      <div className="space-y-6">
        {/* Cache Status Banner */}
        <div
          className={`p-3 rounded-lg text-sm ${
            isFresh ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <div dir={language === 'ar' ? 'rtl' : 'ltr'}>
              <p className="font-semibold">
                {isFresh ? '✅' : isStale ? '⚠️' : '📦'}{' '}
                {isFresh
                  ? language === 'ar'
                    ? 'بيانات طازة'
                    : 'Fresh data'
                  : language === 'ar'
                    ? 'بيانات قديمة - جاري التحديث'
                    : 'Stale data - syncing'}
              </p>
              <p className="text-xs opacity-75 mt-1">
                {language === 'ar' ? 'آخر تحديث: ' : 'Last updated: '}
                {new Date(lastUpdated).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}
              </p>
              {isValidating && (
                <p className="text-xs opacity-75">
                  {language === 'ar' ? '🔄 جاري التحديث في الخلفية...' : '🔄 Syncing in background...'}
                </p>
              )}
            </div>
            <span className="text-xs font-mono bg-white/50 px-2 py-1 rounded">
              {source}
            </span>
          </div>
        </div>

        {/* Competitors List */}
        {competitors && competitors.length > 0 ? (
          <div className="space-y-4">
            {competitors.map((competitor) => (
              <div key={competitor.id} className="border rounded-lg p-4">
                <h3 className="font-semibold mb-3" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                  {competitor.name}
                </h3>

                {/* Keyword Surfaces — read-only; strengths staged via Audit Queue */}
                <CompetitorKeywordSurfacesReadonly
                  keywords={competitor.keywords ?? []}
                  isRtl={language === "ar"}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>{language === 'ar' ? 'لا توجد بيانات المنافسين' : 'No competitor data'}</p>
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════

  if (!userId) {
    return <div>{language === 'ar' ? 'جاري تحميل...' : 'Loading...'}</div>;
  }

  return (
    <KeywordSelectionProvider>
      <KeywordCurationModeProvider>
        <div
          className={`competitor-spy-client ${className}`}
          dir={language === 'ar' ? 'rtl' : 'ltr'}
        >
          <CompetitorSpyHeader
            appId={appId}
            language={language}
            cacheSource={source}
            isCacheFresh={isFresh}
            isValidating={isValidating}
          />

          <div className="mt-6">{renderState()}</div>
        </div>
      </KeywordCurationModeProvider>
    </KeywordSelectionProvider>
  );
}
