/**
 * Experiment History Panel
 *
 * Tabbed panel integrated into AI Listing Optimizer
 * Acts as a versioning layer for listing snapshots
 * Fully bilingual with RTL support (EN/AR)
 *
 * Features:
 * - Two tabs: Current Baseline | Experiment History
 * - Create/manage baseline snapshots
 * - Create/publish variants
 * - Track metrics and performance
 * - Version control for listings
 */

'use client';

import { useState, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { Calendar, TrendingUp, Plus, Copy, Eye, Zap } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ExperimentHistoryPanelProps {
  workspaceId: string;
  selectedAppId?: string;
}

interface Baseline {
  id: string;
  appId: string;
  title: string;
  description: string;
  createdAt: string;
  metrics: {
    installs: number;
    rating: number;
    reviews: number;
  };
  weeksTracked: number;
}

interface Variant {
  id: string;
  baselineId: string;
  name: string;
  title: string;
  description: string;
  hypothesis: string;
  status: 'DRAFT' | 'ACTIVE' | 'PUBLISHED';
  performanceVsBaseline: number; // percentage
  createdAt: string;
  publishedAt?: string;
}

export function ExperimentHistoryPanel({
  workspaceId,
  selectedAppId,
}: ExperimentHistoryPanelProps) {
  const locale = useLocale();
  const isArabic = locale === 'ar';

  const [activeTab, setActiveTab] = useState<'baseline' | 'history'>('baseline');
  const [expandedBaseline, setExpandedBaseline] = useState<string | null>(null);

  // Fetch baselines — locale is part of the query key so EN and AR users
  // never share a cached result, and the API filters to the correct branch.
  const {
    data: baselines = [],
    isLoading: baselinesLoading,
    refetch: refetchBaselines,
  } = useQuery({
    queryKey: ['baselines', workspaceId, selectedAppId, locale],
    queryFn: async () => {
      if (!selectedAppId) return [];
      const res = await fetch(
        `/api/workspaces/${workspaceId}/experiments/snapshots?appId=${selectedAppId}&language=${locale}`
      );
      if (!res.ok) throw new Error('Failed to fetch baselines');
      return res.json();
    },
    enabled: !!selectedAppId,
  });

  // Create baseline mutation — language must be explicit so the snapshot is
  // written to the correct locale branch in workspace_staging_vault.
  const createBaselineMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/experiments/snapshots`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appId: selectedAppId,
            action: 'create_baseline',
            language: locale,
          }),
        }
      );
      if (!res.ok) throw new Error('Failed to create baseline');
      return res.json();
    },
    onSuccess: () => {
      toast.success(
        isArabic ? 'تم إنشاء خط الأساس' : 'Baseline created successfully'
      );
      refetchBaselines();
    },
    onError: () => {
      toast.error(isArabic ? 'فشل الإنشاء' : 'Failed to create baseline');
    },
  });

  const handleCreateBaseline = useCallback(async () => {
    if (!selectedAppId) {
      toast.error(
        isArabic ? 'اختر تطبيقاً أولاً' : 'Please select an app first'
      );
      return;
    }
    await createBaselineMutation.mutateAsync();
  }, [selectedAppId, createBaselineMutation, isArabic]);

  const handleDuplicate = async (baseline: Baseline) => {
    const name = prompt(
      isArabic ? 'أدخل اسم المتغير' : 'Enter variant name (e.g., "Emojis"):'
    );
    if (!name) return;

    const res = await fetch(
      `/api/workspaces/${workspaceId}/experiments/snapshots`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baselineId: baseline.id,
          action: 'create_variant',
          variantName: name,
          // language must propagate so the variant is written to the same
          // locale branch as its parent baseline.
          language: locale,
        }),
      }
    );

    if (res.ok) {
      toast.success(
        isArabic ? 'تم إنشاء المتغير' : 'Variant created successfully'
      );
      refetchBaselines();
    }
  };

  return (
    <div className="w-full">
      {/* Tabs */}
      <div className="border-b border-zinc-700">
        <div className="flex gap-8">
          <button
            onClick={() => setActiveTab('baseline')}
            className={`px-1 py-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'baseline'
                ? 'text-emerald-400 border-emerald-500'
                : 'text-zinc-400 border-transparent hover:text-zinc-300'
            }`}
          >
            {isArabic ? 'خط الأساس الحالي' : 'Current Baseline'}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-1 py-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'text-emerald-400 border-emerald-500'
                : 'text-zinc-400 border-transparent hover:text-zinc-300'
            }`}
          >
            {isArabic ? 'سجل التجارب' : 'Experiment History'}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="py-6">
        {activeTab === 'baseline' && (
          <BaselineTab
            baselines={baselines}
            isLoading={baselinesLoading}
            isArabic={isArabic}
            expandedBaseline={expandedBaseline}
            setExpandedBaseline={setExpandedBaseline}
            onCreateBaseline={handleCreateBaseline}
            onDuplicate={handleDuplicate}
            isCreating={createBaselineMutation.isPending}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab baselines={baselines} isArabic={isArabic} />
        )}
      </div>
    </div>
  );
}

// Baseline Tab Component
function BaselineTab({
  baselines,
  isLoading,
  isArabic,
  expandedBaseline,
  setExpandedBaseline,
  onCreateBaseline,
  onDuplicate,
  isCreating,
}: {
  baselines: Baseline[];
  isLoading: boolean;
  isArabic: boolean;
  expandedBaseline: string | null;
  setExpandedBaseline: (id: string | null) => void;
  onCreateBaseline: () => void;
  onDuplicate: (baseline: Baseline) => void;
  isCreating: boolean;
}) {
  const currentBaseline = baselines[0];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500" />
      </div>
    );
  }

  if (!currentBaseline) {
    return (
      <div className="text-center py-12 border border-dashed border-zinc-700 rounded-lg">
        <div className="text-zinc-400 space-y-4">
          <p className="text-sm">
            {isArabic
              ? 'لم يتم إنشاء خط أساس حتى الآن'
              : 'No baseline created yet'}
          </p>
          <button
            onClick={onCreateBaseline}
            disabled={isCreating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isCreating ? (
              <>
                <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                {isArabic ? 'جاري الإنشاء...' : 'Creating...'}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                {isArabic ? 'إنشاء خط أساس' : 'Create Baseline'}
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  const isExpanded = expandedBaseline === currentBaseline.id;

  return (
    <div className="space-y-4">
      {/* Baseline Card */}
      <div className="bg-gradient-to-br from-emerald-500/10 via-zinc-900 to-zinc-900 border border-emerald-500/30 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="p-4 cursor-pointer" onClick={() =>
          setExpandedBaseline(isExpanded ? null : currentBaseline.id)
        }>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                <h3 className="text-base font-semibold text-white">
                  {currentBaseline.title}
                </h3>
              </div>
              <p className="text-sm text-zinc-400 line-clamp-2">
                {currentBaseline.description}
              </p>
            </div>
            <Eye className="w-5 h-5 text-zinc-400 flex-shrink-0" />
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3 px-4 py-3 border-t border-zinc-800 bg-zinc-900/50">
          <div>
            <p className="text-xs text-zinc-500">
              {isArabic ? 'التثبيتات' : 'Installs'}
            </p>
            <p className="text-sm font-semibold text-white mt-1">
              {currentBaseline.metrics.installs.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">
              {isArabic ? 'التقييم' : 'Rating'}
            </p>
            <p className="text-sm font-semibold text-white mt-1">
              {currentBaseline.metrics.rating.toFixed(1)} ⭐
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">
              {isArabic ? 'التقييمات' : 'Reviews'}
            </p>
            <p className="text-sm font-semibold text-white mt-1">
              {currentBaseline.metrics.reviews.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Details (Expandable) */}
        {isExpanded && (
          <div className="border-t border-zinc-800 px-4 py-4 space-y-4 bg-black/30">
            <div>
              <p className="text-xs text-zinc-500 mb-2">
                {isArabic ? 'أسابيع الفترة' : 'Tracking Period'}
              </p>
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Calendar className="w-4 h-4" />
                {isArabic
                  ? `${currentBaseline.weeksTracked} أسابيع`
                  : `${currentBaseline.weeksTracked} weeks`}
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-2">
                {isArabic ? 'تاريخ الإنشاء' : 'Created'}
              </p>
              <p className="text-sm text-zinc-300">
                {new Date(currentBaseline.createdAt).toLocaleDateString(
                  isArabic ? 'ar-EG' : 'en-US'
                )}
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-zinc-800 px-4 py-3 flex gap-2 bg-black/20">
          <button
            onClick={() => onDuplicate(currentBaseline)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-sm font-medium transition-colors"
          >
            <Zap className="w-4 h-4" />
            {isArabic ? 'متغير جديد' : 'New Variant'}
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg text-xs text-zinc-400">
        {isArabic
          ? '💡 انقر على متغير جديد لبدء تجربة A/B'
          : '💡 Click "New Variant" to start an A/B test'}
      </div>
    </div>
  );
}

// History Tab Component
function HistoryTab({
  baselines,
  isArabic,
}: {
  baselines: Baseline[];
  isArabic: boolean;
}) {
  if (baselines.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p className="text-sm">
          {isArabic ? 'لا توجد سجلات تجارب' : 'No experiment history yet'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {baselines.map((baseline) => (
        <div
          key={baseline.id}
          className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-start justify-between"
        >
          <div className="flex-1">
            <h4 className="text-sm font-medium text-white">
              {baseline.title}
            </h4>
            <p className="text-xs text-zinc-500 mt-1">
              {new Date(baseline.createdAt).toLocaleDateString(
                isArabic ? 'ar-EG' : 'en-US'
              )}
            </p>
          </div>
          <div className="text-end flex-shrink-0">
            <p className="text-xs text-zinc-400">
              {isArabic ? 'التثبيتات' : 'Installs'}
            </p>
            <p className="text-sm font-semibold text-white">
              {baseline.metrics.installs.toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
