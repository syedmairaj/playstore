/**
 * Staging Workspace Type Definitions
 *
 * Defines the three-pillar staging architecture for transparent signal management.
 * Each pillar (Review Issues, Market Opportunities, Competitor Keywords) operates
 * as an independent data stream with unified removal and state synchronization.
 */

/**
 * Unique identifier for staging signal sources
 */
export type SignalSource = "review_issue" | "market_spotlight" | "competitor_keyword";

/**
 * Keyword category for competitor keywords
 */
export type KeywordCategory = "high_volume" | "intent_based" | "competitor_gap";

/**
 * Base signal structure - common to all three pillars
 */
export interface BaseSignal {
  id: string; // Unique signal ID in staging vault
  source: SignalSource; // Which pillar/module this came from
  timestamp: number; // When signal was added
  metadata?: Record<string, unknown>; // Source-specific metadata
}

/**
 * ──────────────────────────────────────────────────────
 * PILLAR 1: REVIEW ISSUES
 * ──────────────────────────────────────────────────────
 * Source: Reviews module
 * Routed to AI: "What's New" / Pain-point resolution
 */

export interface ReviewIssueSignal extends BaseSignal {
  source: "review_issue";
  content: string; // The issue text
  severity?: "low" | "medium" | "high"; // How critical
  category?: string; // Type of issue (bug, feature request, etc.)
  userCount?: number; // How many users reported
}

/**
 * ──────────────────────────────────────────────────────
 * PILLAR 2: MARKET OPPORTUNITIES
 * ──────────────────────────────────────────────────────
 * Source: AI Keyword Spotlight (Market Intel)
 * Routed to AI: Title / Short Description (feature focus)
 */

export interface MarketOpportunitySignal extends BaseSignal {
  source: "market_spotlight";
  keyword: string; // The trending keyword/opportunity
  searchVolume?: number; // Monthly search volume
  trend?: "rising" | "stable" | "declining"; // Trend direction
  competitorMention?: number; // How many competitors use it
  aiGenerated?: boolean; // Was this AI-identified?
}

/**
 * ──────────────────────────────────────────────────────
 * PILLAR 3: COMPETITOR KEYWORDS
 * ──────────────────────────────────────────────────────
 * Source: Competitor Spy module
 * Routed to AI: Title / Short Description (ASO optimization)
 */

export interface CompetitorKeywordSignal extends BaseSignal {
  source: "competitor_keyword";
  keyword: string; // The keyword term
  category: KeywordCategory; // high_volume | intent_based | competitor_gap
  userSelected: boolean; // Was this manually selected by user?
  sourceCompetitor?: string; // Which competitor uses this
  competitorPosition?: number; // Their ranking with this keyword
}

/**
 * Union type for all signal types
 */
export type StagingSignal =
  | ReviewIssueSignal
  | MarketOpportunitySignal
  | CompetitorKeywordSignal;

/**
 * ──────────────────────────────────────────────────────
 * PILLAR CONTAINERS
 * ──────────────────────────────────────────────────────
 * Each pillar maintains its own array of signals
 */

export interface StagingPillar<T extends StagingSignal = StagingSignal> {
  id: "review_issues" | "market_opportunities" | "competitor_keywords";
  label: {
    en: string;
    ar: string;
  };
  description: {
    en: string;
    ar: string;
  };
  icon: string; // React icon component name
  color: {
    icon: string; // Icon color class
    header: string; // Header background
    chip: string; // Chip background
    text: string; // Text color
  };
  signals: T[];
  isEmpty: boolean;
  count: number;
}

/**
 * Staging Workspace State
 */
export interface StagingWorkspaceState {
  reviewIssues: StagingPillar<ReviewIssueSignal>;
  marketOpportunities: StagingPillar<MarketOpportunitySignal>;
  competitorKeywords: StagingPillar<CompetitorKeywordSignal>;
  totalSignals: number;
  lastUpdated: number;
  isLoading: boolean;
  error?: string;
}

/**
 * Signal removal event
 */
export interface SignalRemovalEvent {
  signalId: string;
  source: SignalSource;
  timestamp: number;
}

/**
 * Signal addition event
 */
export interface SignalAdditionEvent {
  signal: StagingSignal;
  pillarId: string;
  timestamp: number;
}

/**
 * Staging workspace configuration
 */
export interface StagingWorkspaceConfig {
  showEmptyPillars: boolean; // Always show pillars even if 0 signals
  enableInlineRemoval: boolean; // Allow clicking × to remove
  syncToOriginModules: boolean; // Update source modules on removal
  showSignalCounter: boolean; // Display total signal count
  animateTransitions: boolean; // Animate chip entrance/exit
  locale: "en" | "ar";
  isRtl: boolean;
}

/**
 * Display options for a signal chip
 */
export interface ChipDisplayOptions {
  showRemoveButton: boolean;
  showCategory?: boolean; // For keywords, show category tag
  showMetadata?: boolean; // Show additional metadata
  animateOnRemove?: boolean;
}

/**
 * Removal handler callback
 */
export type RemovalHandler = (
  signalId: string,
  source: SignalSource
) => Promise<void>;

/**
 * State sync callback
 */
export type StateSyncHandler = (
  event: SignalRemovalEvent | SignalAdditionEvent
) => Promise<void>;
