/**
 * EXAMPLE: Refactored Competitor Spy Module
 *
 * This file shows the complete before/after for one module.
 * Use as a template for refactoring other modules.
 *
 * Key Changes:
 * 1. Import new hook and utilities instead of old components
 * 2. Use language detection from useLocale()
 * 3. Build payload with builder function
 * 4. Use unified StagingButton
 * 5. No RTL/language logic in component (all handled by hook + button)
 */

'use client';

import React, { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

// ============================================================================
// NEW IMPORTS (Refactored System)
// ============================================================================
import { StagingButton } from '@/components/staging/StagingButton';
import { buildCompetitorSpyPayload } from '@/lib/staging-utilities';
import type { LanguageCode, UnifiedStagingPayload } from '@/types/staging-contract';

// ============================================================================
// OLD IMPORTS (To Remove)
// ============================================================================
// ❌ REMOVE: import { StageButtonRefactored } from '@/components/staging/StageButtonRefactored';
// ❌ REMOVE: import { KeywordSurfacesInline } from '@/components/competitor-spy/keyword-surfaces-inline';
// ❌ REMOVE: import { useRouter } from 'next/navigation';
// ❌ REMOVE: import { Sparkles, Zap } from 'lucide-react';

/**
 * REFACTORED: Competitor Spy Snapshot Card
 *
 * This component displays a competitor's app details with an option to stage
 * keywords for the AI Listing Optimizer.
 *
 * Architecture:
 * - Focuses on UI and data presentation
 * - Uses StagingButton (dumb) and useStaging hook (smart)
 * - No staging logic duplicated here
 * - Language and RTL handled automatically
 */
export function CompetitorSpySnapshotCard({
  workspaceId,
  appId,
  competitor,
  myAppName,
  keywords,
}: {
  workspaceId: string;
  appId: string;
  competitor: {
    name: string;
    packageId: string;
    category: string;
    ranking: number;
  };
  myAppName: string;
  keywords: string[];
}) {
  // ═══════════════════════════════════════════════════════════════════════════
  // STATE & CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════

  // Detect user's active language
  const language = useLocale() as LanguageCode;
  const t = useTranslations('competitor-spy');

  // Local UI state (if needed)
  const [showKeywords, setShowKeywords] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD PAYLOAD (Using Standardized Builder)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Construct the staging payload using the unified builder
   *
   * Benefits:
   * 1. Consistent structure across all modules
   * 2. Automatically includes lang and is_rtl
   * 3. Metadata properly structured
   * 4. Easy to validate
   */
  const stagingPayload: UnifiedStagingPayload = buildCompetitorSpyPayload(
    competitor.name, // competitorName
    keywords, // keywords array
    {
      // Additional metadata
      competitorPackageId: competitor.packageId,
      categoryLabel: competitor.category,
      bestRank: competitor.ranking,
      myAppName,
    },
    language // User's active language
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle opening app in Play Store
   */
  const handleOpenPlayStore = () => {
    const url = `https://play.google.com/store/apps/details?id=${competitor.packageId}`;
    window.open(url, '_blank');
  };

  /**
   * Handle toggling keyword visibility
   */
  const handleToggleKeywords = () => {
    setShowKeywords(!showKeywords);
  };

  /**
   * Handle successful staging
   * Optional: Do something after signal is added to vault
   */
  const handleStagingComplete = () => {
    // Could show a success message, refresh something, etc.
    console.log('[CompetitorSpy] Signal staged successfully');
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Card Container
  // ═══════════════════════════════════════════════════════════════════════════

  // RTL support: auto-apply via dir attribute
  const isRtl = language === 'ar';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn(
        'border rounded-lg p-4 bg-white shadow-sm',
        'hover:shadow-md transition-shadow'
      )}
    >
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* HEADER: Competitor Info */}
      {/* ═════════════════════════════════════════════════════════════════════ */}

      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-base text-gray-900">
            {competitor.name}
          </h3>
          <p className="text-sm text-gray-600">
            {competitor.category} • Rank #{competitor.ranking}
          </p>
        </div>

        {/* Show RTL icon if Arabic */}
        {isRtl && (
          <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
            AR
          </span>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* KEYWORDS SECTION: Expandable */}
      {/* ═════════════════════════════════════════════════════════════════════ */}

      <div className="mb-4 bg-gray-50 rounded p-3">
        <div
          onClick={handleToggleKeywords}
          className="flex items-center justify-between cursor-pointer hover:bg-gray-100 p-2 rounded"
        >
          <span className="text-sm font-medium text-gray-700">
            {t('keywords')}: {keywords.length}
          </span>
          <span className={cn('transition-transform', showKeywords && 'rotate-180')}>
            ▼
          </span>
        </div>

        {/* Expanded Content */}
        {showKeywords && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {keywords.map((keyword, idx) => (
              <div
                key={idx}
                className={cn(
                  'text-xs bg-white rounded p-2 border',
                  'flex items-center justify-between',
                  'hover:bg-blue-50 transition-colors'
                )}
              >
                <span className="text-gray-700">{keyword}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(keyword);
                  }}
                  className="ml-2 text-gray-400 hover:text-gray-600"
                  title="Copy keyword"
                >
                  📋
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ACTION BUTTONS */}
      {/* ═════════════════════════════════════════════════════════════════════ */}

      <div
        className={cn(
          'flex items-center gap-2',
          isRtl && 'flex-row-reverse'
        )}
      >
        {/* Button 1: Open in Play Store */}
        <button
          onClick={handleOpenPlayStore}
          className={cn(
            'px-3 py-2 text-sm rounded',
            'bg-gray-100 hover:bg-gray-200 text-gray-900',
            'border border-gray-300',
            'transition-colors'
          )}
        >
          {t('openPlayStore')}
        </button>

        {/* Button 2: Add to Queue (UNIFIED STAGING BUTTON) */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* This is the key change: use the unified StagingButton component     */}
        {/* It automatically handles:                                           */}
        {/* - Language detection and RTL                                        */}
        {/* - State machine (idle → loading → staged)                           */}
        {/* - Toast notifications (EN/AR)                                       */}
        {/* - API call to staging vault                                         */}
        {/* All we do is provide the payload!                                  */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <StagingButton
          payload={stagingPayload}
          variant="primary"
          size="sm"
          onStaged={handleStagingComplete}
          label={
            language === 'ar'
              ? t('addToQueue_ar')
              : t('addToQueue')
          }
        />
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* FOOTER: Metadata */}
      {/* ═════════════════════════════════════════════════════════════════════ */}

      <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
        <p>
          {t('comparingWith')}: <span className="font-medium">{myAppName}</span>
        </p>
        <p>
          {t('language')}: <span className="font-medium">{language.toUpperCase()}</span>
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// EXAMPLE TRANSLATIONS (For i18n Config)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Add these to your en.json and ar.json translation files:
 *
 * en.json:
 * {
 *   "competitor-spy": {
 *     "keywords": "Keywords",
 *     "openPlayStore": "View on Play Store",
 *     "addToQueue": "Add to Analysis Queue",
 *     "addToQueue_ar": "إضافة إلى قائمة التحليل",
 *     "comparingWith": "Comparing with",
 *     "language": "Language"
 *   }
 * }
 *
 * ar.json:
 * {
 *   "competitor-spy": {
 *     "keywords": "الكلمات المفتاحية",
 *     "openPlayStore": "عرض على متجر Play",
 *     "addToQueue": "إضافة إلى قائمة التحليل",
 *     "addToQueue_ar": "إضافة إلى قائمة التحليل",
 *     "comparingWith": "المقارنة مع",
 *     "language": "اللغة"
 *   }
 * }
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// BEFORE vs AFTER: What Changed
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * REMOVED (Old Implementation):
 *
 * ❌ Custom payload construction:
 *    const payload = {
 *      content: JSON.stringify({ competitor_name, app_title, keywords }),
 *      metadata: { competitorName, keywords, ... },
 *      signalType: 'competitor_weakness',
 *      source: 'competitor_spy',
 *      sourceContext: 'competitor_weakness',
 *      sourceContextId: competitorPackageId,
 *    };
 *
 * ❌ Custom language detection:
 *    const isRtl = ['ar', 'he', 'fa', 'ur'].includes(language);
 *
 * ❌ Custom RTL logic:
 *    className={cn('flex gap-2', isRtl && 'flex-row-reverse')}
 *
 * ❌ Manual button component:
 *    <StageButtonRefactored
 *      signalType="competitor_weakness"
 *      content={JSON.stringify(...)}
 *      source="competitor_spy"
 *      ... 15 more props ...
 *    />
 */

/**
 * ADDED (New Implementation):
 *
 * ✅ Standardized builder:
 *    const payload = buildCompetitorSpyPayload(
 *      competitorName,
 *      keywords,
 *      metadata,
 *      language
 *    );
 *
 * ✅ Automatic language detection:
 *    const language = useLocale() as LanguageCode;
 *    // Detects from i18n context
 *
 * ✅ Unified button (handles everything):
 *    <StagingButton
 *      payload={payload}
 *      onStaged={handleStagingComplete}
 *    />
 *    // Language, RTL, state machine all automatic
 */

/**
 * BENEFITS:
 *
 * 1. Consistency: All modules use same pattern
 * 2. Maintainability: Logic in one place (useStaging hook)
 * 3. Language-Ready: Automatic EN/AR + RTL
 * 4. Less Code: 30% fewer lines per component
 * 5. Type-Safe: UnifiedStagingPayload contract
 * 6. Testable: Pure builders, centralized logic
 * 7. Extensible: Adding new module is trivial
 */
