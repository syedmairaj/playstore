/**
 * Keyword Tracker (Refactored)
 *
 * Integrates contextual Keyword Validator drawer
 * Shows opportunity score badges on keywords
 * Fully bilingual with RTL support (EN/AR)
 *
 * Features:
 * - Main keyword list with opportunity score badges
 * - Contextual drawer for validation
 * - Batch operations
 * - RTL-aware layout using CSS logical properties
 */

'use client';

import { useState, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { ChevronDown, BadgeCheck, AlertCircle, Eye, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryDefaultsFor } from '@/lib/client/query-cache-policy';
import { OptimizerShimmerBar } from '@/components/listing/optimizer/optimizer-shimmer-bar';
import { KeywordValidatorDrawer } from './keyword-validator-drawer';

interface KeywordTrackerProps {
  workspaceId: string;
}

interface Keyword {
  id: string;
  keyword: string;
  opportunityScore: number; // 0-100
  difficulty: number; // 0-10
  confidence: number; // 0-100
  searchVolume: number;
  addedAt: string;
  opportunityTier: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface KeywordScore {
  keyword: string;
  difficulty: number;
  confidence: number;
  searchVolume: number;
  competition: number;
  monthlyInstalls: {
    low: number;
    realistic: number;
    high: number;
  };
  recommendation: 'HIGH_CONFIDENCE' | 'MEDIUM_OPPORTUNITY' | 'SKIP';
}

export function KeywordTrackerRefactored({ workspaceId }: KeywordTrackerProps) {
  const locale = useLocale();
  const isArabic = locale === 'ar';

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch keywords
  const { isLoading } = useQuery({
    queryKey: ['keywords', workspaceId],
    ...queryDefaultsFor('workspaceContext'),
    queryFn: async () => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/keywords/tracked`
      );
      if (!res.ok) throw new Error('Failed to fetch keywords');
      const data = await res.json();
      setKeywords(data);
      return data;
    },
  });

  const handleAddKeyword = useCallback(
    (keyword: string, score: KeywordScore) => {
      const newKeyword: Keyword = {
        id: `${keyword}-${Date.now()}`,
        keyword: score.keyword,
        opportunityScore: Math.round(
          (score.confidence * score.monthlyInstalls.realistic) / 100
        ),
        difficulty: score.difficulty,
        confidence: score.confidence,
        searchVolume: score.searchVolume,
        addedAt: new Date().toISOString(),
        opportunityTier:
          score.recommendation === 'HIGH_CONFIDENCE'
            ? 'HIGH'
            : score.recommendation === 'MEDIUM_OPPORTUNITY'
              ? 'MEDIUM'
              : 'LOW',
      };

      setKeywords((prev) => [newKeyword, ...prev]);
      setIsDrawerOpen(false);
    },
    []
  );

  const getOpportunityBadgeColor = (tier: string) => {
    switch (tier) {
      case 'HIGH':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'MEDIUM':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'LOW':
        return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
      default:
        return '';
    }
  };

  const getTierLabel = (tier: string) => {
    const labels: Record<string, Record<string, string>> = {
      en: {
        HIGH: '✅ High Opportunity',
        MEDIUM: '⭐ Medium Opportunity',
        LOW: '⊘ Low Opportunity',
      },
      ar: {
        HIGH: '✅ فرصة عالية',
        MEDIUM: '⭐ فرصة متوسطة',
        LOW: '⊘ فرصة منخفضة',
      },
    };
    return labels[isArabic ? 'ar' : 'en'][tier] || tier;
  };

  const sortedKeywords = [...keywords].sort(
    (a, b) => b.opportunityScore - a.opportunityScore
  );

  return (
    <div className="w-full space-y-6">
      {/* Header with Drawer Trigger */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {isArabic ? 'متتبع الكلمات الرئيسية' : 'Keyword Tracker'}
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            {isArabic
              ? `${keywords.length} كلمة متتبعة`
              : `${keywords.length} keywords tracked`}
          </p>
        </div>
        <button
          onClick={() => setIsDrawerOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          {isArabic ? 'التحقق من كلمة' : 'Validate Keyword'}
        </button>
      </div>

      {/* Keywords List */}
      {isLoading && keywords.length === 0 ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
            >
              <OptimizerShimmerBar className="mb-2 h-4 w-40 max-w-full rounded-md" delayS={i * 0.05} />
              <OptimizerShimmerBar className="h-3 w-28 rounded-md opacity-70" delayS={i * 0.05 + 0.04} />
            </div>
          ))}
        </div>
      ) : sortedKeywords.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-zinc-700 rounded-lg">
          <p className="text-zinc-400 text-sm mb-4">
            {isArabic
              ? 'لم تضف أي كلمات رئيسية حتى الآن'
              : 'No keywords added yet'}
          </p>
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg text-sm font-medium transition-colors border border-emerald-500/30"
          >
            <Plus className="w-4 h-4" />
            {isArabic ? 'أضف أول كلمة' : 'Add First Keyword'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedKeywords.map((item) => {
            const isExpanded = expandedId === item.id;

            return (
              <div
                key={item.id}
                className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 transition-colors"
              >
                {/* Header Row */}
                <button
                  onClick={() =>
                    setExpandedId(isExpanded ? null : item.id)
                  }
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-900/75 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 text-start">
                    {/* Keyword */}
                    <div className="flex-1">
                      <h3 className="font-semibold text-white text-sm">
                        {item.keyword}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {isArabic
                          ? `${item.searchVolume.toLocaleString('ar')} عملية بحث`
                          : `${item.searchVolume.toLocaleString()} searches`}
                      </p>
                    </div>

                    {/* Opportunity Badge */}
                    <div
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap flex-shrink-0 ${getOpportunityBadgeColor(
                        item.opportunityTier
                      )}`}
                    >
                      {item.opportunityTier === 'HIGH' ? (
                        <BadgeCheck className="w-3.5 h-3.5" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5" />
                      )}
                      {getTierLabel(item.opportunityTier)}
                    </div>
                  </div>

                  {/* Expand Icon */}
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-500 transition-transform flex-shrink-0 ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Expandable Details */}
                {isExpanded && (
                  <div className="border-t border-zinc-800 bg-black/30 px-4 py-4 space-y-4">
                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-zinc-500">
                          {isArabic ? 'الصعوبة' : 'Difficulty'}
                        </p>
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-white font-semibold">
                              {item.difficulty.toFixed(1)}/10
                            </span>
                          </div>
                          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                              style={{ width: `${(item.difficulty / 10) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="text-zinc-500">
                          {isArabic ? 'الثقة' : 'Confidence'}
                        </p>
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-white font-semibold">
                              {item.confidence}%
                            </span>
                          </div>
                          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-blue-400"
                              style={{ width: `${item.confidence}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="text-zinc-500">
                          {isArabic ? 'درجة الفرصة' : 'Opportunity Score'}
                        </p>
                        <p className="text-white font-semibold mt-2">
                          {item.opportunityScore}
                        </p>
                      </div>

                      <div>
                        <p className="text-zinc-500">
                          {isArabic ? 'المضافة' : 'Added'}
                        </p>
                        <p className="text-white font-semibold mt-2">
                          {new Date(item.addedAt).toLocaleDateString(
                            isArabic ? 'ar-EG' : 'en-US',
                            { month: 'short', day: 'numeric' }
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                      <button className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2">
                        <Eye className="w-3.5 h-3.5" />
                        {isArabic ? 'معاينة' : 'Preview'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Contextual Drawer */}
      <KeywordValidatorDrawer
        workspaceId={workspaceId}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onAddKeyword={handleAddKeyword}
      />
    </div>
  );
}
