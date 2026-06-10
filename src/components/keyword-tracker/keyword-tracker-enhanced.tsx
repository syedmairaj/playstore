/**
 * Enhanced Keyword Tracker Client
 *
 * Wraps existing KeywordTrackerClient with integrated Keyword Validator Drawer
 * Maintains all existing data loading and state management
 * Adds contextual drawer for pro-grade UX
 *
 * Features:
 * - Contextual validation drawer (no page navigation)
 * - Opportunity score badges on keywords
 * - Full bilingual + RTL support
 * - Zero breaking changes to existing component
 */

'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { KeywordTrackerClient } from './KeywordTrackerClient';
import { KeywordValidatorDrawer } from './keyword-validator-drawer';

interface EnhancedKeywordTrackerProps {
  workspaceId: string;
  initialKeywords: any[];
  apps: any[];
  keywordsLoadError: string | null;
  appsLoadError: string | null;
  latestAiByApp: any;
  // Drawer state (optional, for external control)
  isDrawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
}

export function EnhancedKeywordTracker({
  workspaceId,
  initialKeywords,
  apps,
  keywordsLoadError,
  appsLoadError,
  latestAiByApp,
  isDrawerOpen: externalIsOpen,
  onDrawerOpenChange,
}: EnhancedKeywordTrackerProps) {
  const locale = useLocale();
  const isArabic = locale === 'ar';

  // Internal drawer state (can be overridden by parent)
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isDrawerOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setDrawerOpen = (open: boolean) => {
    if (externalIsOpen === undefined) {
      setInternalIsOpen(open);
    }
    onDrawerOpenChange?.(open);
  };

  const handleAddKeyword = (keyword: string, score: any) => {
    // Callback when keyword is added from drawer
    // The existing KeywordTrackerClient will handle refresh via React Query
    setDrawerOpen(false);
  };

  return (
    <>
      <KeywordTrackerClient
        workspaceId={workspaceId}
        initialKeywords={initialKeywords}
        apps={apps}
        keywordsLoadError={keywordsLoadError}
        appsLoadError={appsLoadError}
        latestAiByApp={latestAiByApp}
        // Props to open drawer from toolbar
        showValidatorButton={true}
        onValidatorClick={() => setDrawerOpen(true)}
      />

      {/* Contextual Validator Drawer */}
      <KeywordValidatorDrawer
        workspaceId={workspaceId}
        isOpen={isDrawerOpen}
        onClose={() => setDrawerOpen(false)}
        onAddKeyword={handleAddKeyword}
      />
    </>
  );
}
