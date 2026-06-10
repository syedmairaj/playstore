'use client';

import { useState, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { X, Loader2, TrendingUp, Shield, Zap } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface KeywordValidatorDrawerProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onAddKeyword?: (keyword: string, score: KeywordScore) => void;
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

export function KeywordValidatorDrawer({
  workspaceId,
  isOpen,
  onClose,
  onAddKeyword,
}: KeywordValidatorDrawerProps) {
  const locale = useLocale();
  const isArabic = locale === 'ar';

  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<KeywordScore[]>([]);
  const [stagingId, setStagingId] = useState<string | null>(null);

  const validateMutation = useMutation({
    mutationFn: async (searchKeyword: string) => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/validator/validate-keyword`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: searchKeyword }),
        }
      );
      if (!res.ok) throw new Error('Validation failed');
      return res.json();
    },
    onSuccess: (data) => {
      setResults((prev) => [data, ...prev]);
      setKeyword('');
      toast.success(isArabic ? 'تم التحقق من الكلمة الرئيسية' : 'Keyword validated');
    },
    onError: () => {
      toast.error(isArabic ? 'فشل التحقق' : 'Validation failed');
    },
  });

  const handleValidate = useCallback(async () => {
    if (!keyword.trim()) return;
    await validateMutation.mutateAsync(keyword);
  }, [keyword, validateMutation]);

  const handleStageKeyword = (score: KeywordScore) => {
    setStagingId(score.keyword);
    setTimeout(() => {
      onAddKeyword?.(score.keyword, score);
      setStagingId(null);
      toast.success(
        isArabic ? 'تمت إضافة الكلمة الرئيسية' : 'Keyword staged successfully'
      );
    }, 300);
  };

  const getViabilityColor = (difficulty: number, confidence: number) => {
    if (confidence < 50) return { bg: 'bg-red-500/20', text: 'text-red-400', bar: 'bg-red-500' };
    if (difficulty > 7) return { bg: 'bg-amber-500/20', text: 'text-amber-400', bar: 'bg-amber-500' };
    return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', bar: 'bg-emerald-500' };
  };

  const getTierBadge = (rec: string, isArabic: boolean) => {
    const badges = {
      en: {
        HIGH_CONFIDENCE: { label: 'High Opportunity', icon: Shield, color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30' },
        MEDIUM_OPPORTUNITY: { label: 'Medium Opportunity', icon: TrendingUp, color: 'text-amber-400 bg-amber-500/20 border-amber-500/30' },
        SKIP: { label: 'Low Priority', icon: Zap, color: 'text-zinc-400 bg-zinc-500/20 border-zinc-500/30' },
      },
      ar: {
        HIGH_CONFIDENCE: { label: 'فرصة عالية', icon: Shield, color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30' },
        MEDIUM_OPPORTUNITY: { label: 'فرصة متوسطة', icon: TrendingUp, color: 'text-amber-400 bg-amber-500/20 border-amber-500/30' },
        SKIP: { label: 'أولوية منخفضة', icon: Zap, color: 'text-zinc-400 bg-zinc-500/20 border-zinc-500/30' },
      },
    };
    return badges[isArabic ? 'ar' : 'en'][rec as keyof typeof badges['en']];
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
          aria-hidden
        />
      )}

      <div
        className={cn(
          'fixed top-0 h-full w-full sm:w-[500px] bg-[#0c1018] border-zinc-800 shadow-2xl z-50 transition-transform duration-300',
          isArabic ? 'border-l right-0' : 'border-r left-0',
          isOpen
            ? 'translate-x-0'
            : isArabic
              ? 'translate-x-full'
              : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="sticky top-0 border-b border-zinc-800 bg-[#0c1018]/95 backdrop-blur px-6 py-4">
          <div className={cn('flex items-center justify-between', isArabic && 'flex-row-reverse')}>
            <div className={isArabic ? 'text-right' : 'text-left'}>
              <h2 className="text-lg font-semibold text-white">
                {isArabic ? 'مدقق الكلمات الرئيسية' : 'Keyword Validator'}
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                {isArabic ? 'فحص درجات الفرص والجدوى' : 'Viability & opportunity analysis'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100vh-100px)] px-6 py-4 space-y-6">
          {/* Input Card */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-3">
            <label className="block text-sm font-medium text-zinc-200">
              {isArabic ? 'أدخل الكلمة الرئيسية' : 'Enter keyword to validate'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleValidate()}
                placeholder={isArabic ? 'مثل: محرر الصور' : 'e.g., photo editor'}
                className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 text-sm"
              />
              <button
                onClick={handleValidate}
                disabled={validateMutation.isPending || !keyword.trim()}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium whitespace-nowrap"
              >
                {validateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <TrendingUp className="w-4 h-4" />
                )}
                {isArabic ? 'فحص' : 'Check'}
              </button>
            </div>
          </div>

          {/* Results */}
          {results.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400">
                {isArabic ? 'لا توجد كلمات مفحوصة بعد' : 'No keywords validated yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {results.map((score) => {
                const viability = getViabilityColor(score.difficulty, score.confidence);
                const tier = getTierBadge(score.recommendation, isArabic);
                const TierIcon = tier.icon;

                return (
                  <div
                    key={score.keyword}
                    className="bg-gradient-to-br from-zinc-900 to-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-4 hover:border-zinc-700 transition-colors"
                  >
                    {/* Keyword Header */}
                    <div className={cn('flex items-start justify-between gap-3', isArabic && 'flex-row-reverse')}>
                      <div className={isArabic ? 'text-right' : 'text-left'}>
                        <p className="font-semibold text-white text-base">
                          {score.keyword}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {isArabic
                            ? `${score.searchVolume.toLocaleString('ar')} عملية بحث شهريًا`
                            : `${score.searchVolume.toLocaleString()} monthly searches`}
                        </p>
                      </div>
                      <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full border', tier.color)}>
                        <TierIcon className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">{tier.label}</span>
                      </div>
                    </div>

                    {/* Viability Score */}
                    <div className="space-y-2">
                      <div className={cn('flex items-center justify-between text-xs', isArabic && 'flex-row-reverse')}>
                        <span className="text-zinc-400">
                          {isArabic ? 'درجة الجدوى' : 'Viability Score'}
                        </span>
                        <span className={cn('font-semibold', viability.text)}>
                          {score.difficulty.toFixed(1)}/10 {isArabic ? 'صعوبة' : 'difficulty'}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', viability.bar)}
                          style={{ width: `${Math.min((score.difficulty / 10) * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-zinc-800/50 rounded-lg p-3">
                        <p className="text-xs text-zinc-400 mb-1">
                          {isArabic ? 'ثقة' : 'Confidence'}
                        </p>
                        <p className="text-base font-semibold text-emerald-400">
                          {score.confidence}%
                        </p>
                      </div>
                      <div className="bg-zinc-800/50 rounded-lg p-3">
                        <p className="text-xs text-zinc-400 mb-1">
                          {isArabic ? 'المنافسة' : 'Competition'}
                        </p>
                        <p className="text-base font-semibold text-blue-400">
                          {score.competition}%
                        </p>
                      </div>
                      <div className="bg-zinc-800/50 rounded-lg p-3">
                        <p className="text-xs text-zinc-400 mb-1">
                          {isArabic ? 'إمكانية الواقع' : 'Realistic'}
                        </p>
                        <p className="text-base font-semibold text-white">
                          {score.monthlyInstalls.realistic.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-zinc-800/50 rounded-lg p-3">
                        <p className="text-xs text-zinc-400 mb-1">
                          {isArabic ? 'محتمل' : 'Potential'}
                        </p>
                        <p className="text-base font-semibold text-amber-400">
                          {score.monthlyInstalls.high.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Stage Button */}
                    <button
                      onClick={() => handleStageKeyword(score)}
                      disabled={stagingId === score.keyword}
                      className={cn(
                        'w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-300',
                        stagingId === score.keyword
                          ? 'bg-emerald-600 text-white'
                          : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 hover:text-emerald-300 border border-emerald-600/30'
                      )}
                    >
                      {stagingId === score.keyword ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                          {isArabic ? 'جاري الإضافة...' : 'Staging...'}
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 inline mr-2" />
                          {isArabic ? 'إضافة إلى المتتبع' : 'Stage Keyword'}
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
