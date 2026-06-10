/**
 * Enhanced Listing Optimizer
 *
 * Wraps existing ListingOptimizer with integrated Experiment History Panel
 * Maintains all existing data loading and state management
 * Adds tabbed versioning layer for pro-grade UX
 *
 * Features:
 * - Integrated experiment/versioning panel (no page navigation)
 * - Current baseline management
 * - Variant tracking and comparison
 * - Full bilingual + RTL support
 * - Zero breaking changes to existing component
 */

'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { ListingOptimizer } from './ListingOptimizer';
import { ExperimentHistoryPanel } from './listing-optimizer/experiment-history-panel';

interface EnhancedListingOptimizerProps {
  workspaceId: string;
  embedded?: boolean;
  locale: string;
  initialAppLimits: any;
  initialApps?: any[];
  initialHydrationByApp?: any;
  initialHydrationNoApp?: any;
  initialAiCreditsRemaining?: number;
}

export function EnhancedListingOptimizer({
  workspaceId,
  embedded = true,
  locale: uiLocale,
  initialAppLimits,
  initialApps,
  initialHydrationByApp,
  initialHydrationNoApp,
  initialAiCreditsRemaining,
}: EnhancedListingOptimizerProps) {
  const locale = useLocale();
  const isArabic = locale === 'ar';

  // Track whether to show experiments panel in a separate tab
  const [showExperimentsTab, setShowExperimentsTab] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string | undefined>();

  return (
    <div className="w-full space-y-6">
      {/* Show tab control if multiple tabs */}
      {showExperimentsTab && (
        <div className="border-b border-zinc-700">
          <div className="flex gap-8">
            <button
              onClick={() => setShowExperimentsTab(false)}
              className="px-1 py-4 text-sm font-medium border-b-2 text-emerald-400 border-emerald-500"
            >
              {isArabic ? 'المحرر' : 'Editor'}
            </button>
            <button
              onClick={() => setShowExperimentsTab(true)}
              className="px-1 py-4 text-sm font-medium border-b-2 text-zinc-400 border-transparent hover:text-zinc-300"
            >
              {isArabic ? 'التجارب والإصدارات' : 'Experiments & Versions'}
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      {!showExperimentsTab ? (
        <ListingOptimizer
          workspaceId={workspaceId}
          embedded={embedded}
          locale={uiLocale}
          initialAppLimits={initialAppLimits}
          initialApps={initialApps}
          initialHydrationByApp={initialHydrationByApp}
          initialHydrationNoApp={initialHydrationNoApp}
          initialAiCreditsRemaining={initialAiCreditsRemaining}
          // Props to trigger experiments panel
          onShowExperiments={(appId: string) => {
            setSelectedAppId(appId);
            setShowExperimentsTab(true);
          }}
        />
      ) : (
        <ExperimentHistoryPanel
          workspaceId={workspaceId}
          selectedAppId={selectedAppId}
        />
      )}
    </div>
  );
}
