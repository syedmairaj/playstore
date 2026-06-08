/**
 * Test imports file - Ensures all competitors page dependencies resolve correctly
 *
 * If you see errors below, it means a dependency is missing or has a circular import.
 * Run: npm run dev:clean && npm run dev
 *
 * This file is NOT included in production builds.
 */

// Test core competitors page imports
import { CompetitorSpyClient } from '@/components/competitor-spy/CompetitorSpyClient';
import { CompetitorSpyCountryTabs } from '@/components/competitor-spy/competitor-spy-country-tabs';
import { CompetitorSpyCreditsConfirmDialog } from '@/components/competitor-spy/competitor-spy-credits-confirm-dialog';
import { CompetitorSpyManageSheet } from '@/components/competitor-spy/competitor-spy-manage-sheet';
import { CompetitorSpySnapshotCard } from '@/components/competitor-spy/competitor-spy-snapshot-card';

// Test shared dependencies
import { OptimizerWorkspace } from '@/components/optimizer/OptimizerWorkspace';
import { ActiveOptimizationQueuePanel } from '@/components/optimizer/ActiveOptimizationQueuePanel';
import { fetchUnutilizedListingImprovements } from '@/components/reviews/review-improvements-queue';

// Test hooks and contexts
import { KeywordSelectionProvider } from '@/contexts/KeywordSelectionContext';
import { KeywordCurationModeProvider } from '@/contexts/KeywordCurationModeContext';

// Test library utilities
import { cn } from '@/lib/utils';
import { PageCacheManager } from '@/lib/cache/page-memory-cache';

console.log('[ImportTest] ✅ All competitors page dependencies resolved successfully');

// Verify types
type TestCompetitorSpyClientType = typeof CompetitorSpyClient;
type TestOptimizerWorkspaceType = typeof OptimizerWorkspace;
type TestCacheManagerType = typeof PageCacheManager;

export type {
  TestCompetitorSpyClientType,
  TestOptimizerWorkspaceType,
  TestCacheManagerType,
};

// Export a dummy function so this file is valid TypeScript
export function testImports(): void {
  // This function is never called, just ensures imports are valid
  void CompetitorSpyClient;
  void OptimizerWorkspace;
  void PageCacheManager;
  void fetchUnutilizedListingImprovements;
  void KeywordSelectionProvider;
  void KeywordCurationModeProvider;
  void cn;
}
