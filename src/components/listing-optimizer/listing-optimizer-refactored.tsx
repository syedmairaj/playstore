/**
 * AI Listing Optimizer (Refactored)
 *
 * Integrates Experiment History Panel as tabbed versioning layer
 * Maintains existing synthesis functionality
 * Fully bilingual with RTL support (EN/AR)
 *
 * Features:
 * - Edit listing with constraint awareness
 * - Integrated experiment/versioning panel
 * - Real-time suggestion
 * - Version history management
 */

'use client';

import { useState, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { Zap, ArrowRight, ChevronDown } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExperimentHistoryPanel } from './experiment-history-panel';

interface ListingOptimizerRefactoredProps {
  workspaceId: string;
  initialListing?: {
    title: string;
    description: string;
    appId: string;
  };
}

interface ListingDraft {
  title: string;
  description: string;
  keywords: string[];
  strategy: string;
}

export function ListingOptimizerRefactored({
  workspaceId,
  initialListing,
}: ListingOptimizerRefactoredProps) {
  const locale = useLocale();
  const isArabic = locale === 'ar';

  const [selectedAppId, setSelectedAppId] = useState(
    initialListing?.appId || ''
  );
  const [draft, setDraft] = useState<ListingDraft>({
    title: initialListing?.title || '',
    description: initialListing?.description || '',
    keywords: [],
    strategy: '',
  });
  const [activeTab, setActiveTab] = useState<'editor' | 'versioning'>(
    'editor'
  );
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Fetch apps
  const { data: apps = [] } = useQuery({
    queryKey: ['apps', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/apps`);
      if (!res.ok) throw new Error('Failed to fetch apps');
      return res.json();
    },
  });

  // Generate suggestions mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/listing-optimizer/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appId: selectedAppId,
            currentTitle: draft.title,
            currentDescription: draft.description,
          }),
        }
      );
      if (!res.ok) throw new Error('Generation failed');
      return res.json();
    },
    onSuccess: (data) => {
      setDraft((prev) => ({
        ...prev,
        title: data.title || prev.title,
        description: data.description || prev.description,
        strategy: data.strategy || '',
        keywords: data.keywords || [],
      }));
      setShowSuggestions(true);
      toast.success(
        isArabic ? 'تم إنشاء الاقتراحات' : 'Suggestions generated'
      );
    },
    onError: () => {
      toast.error(
        isArabic ? 'فشل الإنشاء' : 'Failed to generate suggestions'
      );
    },
  });

  const handleGenerate = useCallback(async () => {
    if (!selectedAppId) {
      toast.error(
        isArabic ? 'اختر تطبيقاً أولاً' : 'Please select an app first'
      );
      return;
    }
    await generateMutation.mutateAsync();
  }, [selectedAppId, generateMutation, isArabic]);

  const handlePublish = useCallback(async () => {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/listing-optimizer/publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: selectedAppId,
          title: draft.title,
          description: draft.description,
        }),
      }
    );

    if (res.ok) {
      toast.success(
        isArabic ? 'تم النشر بنجاح' : 'Listing published successfully'
      );
      setDraft({ title: '', description: '', keywords: [], strategy: '' });
      setShowSuggestions(false);
    } else {
      toast.error(isArabic ? 'فشل النشر' : 'Failed to publish');
    }
  }, [workspaceId, selectedAppId, draft, isArabic]);

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">
          {isArabic ? 'محسّن القائمة' : 'AI Listing Optimizer'}
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          {isArabic
            ? 'حسّن قائمتك مع الذكاء الاصطناعي'
            : 'Enhance your listing with AI'}
        </p>
      </div>

      {/* App Selector */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-300">
          {isArabic ? 'اختر التطبيق' : 'Select App'}
        </label>
        <select
          value={selectedAppId}
          onChange={(e) => setSelectedAppId(e.target.value)}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
        >
          <option value="">
            {isArabic ? '-- اختر تطبيقاً --' : '-- Select an app --'}
          </option>
          {apps.map((app: any) => (
            <option key={app.id} value={app.id}>
              {app.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-700">
        <div className="flex gap-8">
          <button
            onClick={() => setActiveTab('editor')}
            className={`px-1 py-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'editor'
                ? 'text-emerald-400 border-emerald-500'
                : 'text-zinc-400 border-transparent hover:text-zinc-300'
            }`}
          >
            {isArabic ? 'المحرر' : 'Editor'}
          </button>
          <button
            onClick={() => setActiveTab('versioning')}
            className={`px-1 py-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'versioning'
                ? 'text-emerald-400 border-emerald-500'
                : 'text-zinc-400 border-transparent hover:text-zinc-300'
            }`}
          >
            {isArabic ? 'التجارب والإصدارات' : 'Experiments & Versions'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="py-6">
        {activeTab === 'editor' ? (
          <EditorTab
            draft={draft}
            setDraft={setDraft}
            selectedAppId={selectedAppId}
            showSuggestions={showSuggestions}
            isGenerating={generateMutation.isPending}
            isArabic={isArabic}
            onGenerate={handleGenerate}
            onPublish={handlePublish}
          />
        ) : (
          <ExperimentHistoryPanel
            workspaceId={workspaceId}
            selectedAppId={selectedAppId}
          />
        )}
      </div>
    </div>
  );
}

// Editor Tab Component
function EditorTab({
  draft,
  setDraft,
  selectedAppId,
  showSuggestions,
  isGenerating,
  isArabic,
  onGenerate,
  onPublish,
}: {
  draft: ListingDraft;
  setDraft: (draft: ListingDraft) => void;
  selectedAppId: string;
  showSuggestions: boolean;
  isGenerating: boolean;
  isArabic: boolean;
  onGenerate: () => void;
  onPublish: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Title Input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-300">
          {isArabic ? 'العنوان' : 'Title'}
        </label>
        <input
          type="text"
          value={draft.title}
          onChange={(e) =>
            setDraft({ ...draft, title: e.target.value })
          }
          placeholder={
            isArabic
              ? 'مثال: محرر الصور المحترف'
              : 'e.g., Professional Photo Editor'
          }
          maxLength={80}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
        />
        <p className="text-xs text-zinc-500">
          {draft.title.length}/80
        </p>
      </div>

      {/* Description Input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-300">
          {isArabic ? 'الوصف' : 'Description'}
        </label>
        <textarea
          value={draft.description}
          onChange={(e) =>
            setDraft({ ...draft, description: e.target.value })
          }
          placeholder={
            isArabic
              ? 'أوصف تطبيقك هنا'
              : 'Describe your app here...'
          }
          rows={6}
          maxLength={4000}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 resize-none"
        />
        <p className="text-xs text-zinc-500">
          {draft.description.length}/4000
        </p>
      </div>

      {/* Generate Button */}
      <div className="flex gap-3">
        <button
          onClick={onGenerate}
          disabled={isGenerating || !selectedAppId || !draft.title}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg font-medium transition-colors"
        >
          {isGenerating ? (
            <>
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              {isArabic ? 'جاري الإنشاء...' : 'Generating...'}
            </>
          ) : (
            <>
              <Zap className="w-5 h-5" />
              {isArabic ? 'إنشاء الاقتراحات' : 'Generate Suggestions'}
            </>
          )}
        </button>
      </div>

      {/* Strategy & Keywords (if generated) */}
      {showSuggestions && draft.strategy && (
        <div className="space-y-4 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
          <div>
            <h4 className="text-sm font-semibold text-emerald-400 mb-2">
              {isArabic ? 'الإستراتيجية' : 'AI Strategy'}
            </h4>
            <p className="text-sm text-zinc-300 leading-relaxed">
              {draft.strategy}
            </p>
          </div>

          {draft.keywords.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-emerald-400 mb-2">
                {isArabic ? 'الكلمات الرئيسية المقترحة' : 'Suggested Keywords'}
              </h4>
              <div className="flex flex-wrap gap-2">
                {draft.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-medium border border-emerald-500/30"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Publish Button */}
          <button
            onClick={onPublish}
            className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            {isArabic ? 'انشر القائمة' : 'Publish Listing'}
          </button>
        </div>
      )}

      {/* Info */}
      <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg text-xs text-zinc-400">
        <p>
          {isArabic
            ? '💡 انقر على "التجارب والإصدارات" لمشاهدة خط الأساس ومقارنة المتغيرات'
            : '💡 Click "Experiments & Versions" to view baselines and compare variants'}
        </p>
      </div>
    </div>
  );
}
