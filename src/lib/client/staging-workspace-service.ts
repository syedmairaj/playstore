/**
 * Staging Workspace Service
 *
 * Manages the three-pillar staging architecture and synchronization with origin modules.
 * Provides utilities for:
 * - Building workspace state from vault signals
 * - Removing signals and syncing to origin modules
 * - Calculating total signal count
 * - Transforming signals for AI synthesis
 */

import type {
  StagingWorkspaceState,
  StagingSignal,
  ReviewIssueSignal,
  MarketOpportunitySignal,
  CompetitorKeywordSignal,
  StagingPillar,
  SignalSource,
} from "@/lib/client/staging-workspace-types";

/**
 * Build staging workspace state from vault signals
 *
 * Takes raw signals from the staging vault and organizes them into
 * the three pillars with proper metadata and counts.
 */
export function buildStagingWorkspaceState(
  signals: StagingSignal[]
): StagingWorkspaceState {
  const reviewIssues: ReviewIssueSignal[] = [];
  const marketOpportunities: MarketOpportunitySignal[] = [];
  const competitorKeywords: CompetitorKeywordSignal[] = [];

  // Partition signals by source
  for (const signal of signals) {
    if (signal.source === "review_issue") {
      reviewIssues.push(signal as ReviewIssueSignal);
    } else if (signal.source === "market_spotlight") {
      marketOpportunities.push(signal as MarketOpportunitySignal);
    } else if (signal.source === "competitor_keyword") {
      competitorKeywords.push(signal as CompetitorKeywordSignal);
    }
  }

  const totalSignals = signals.length;

  return {
    reviewIssues: {
      id: "review_issues",
      label: { en: "Review Issues", ar: "مشكلات المراجعات" },
      description: {
        en: "→ addressed in description + what's new",
        ar: "← تُعالَج في الوصف + ما هو جديد",
      },
      icon: "AlertTriangle",
      color: {
        icon: "text-rose-400/80",
        header: "border-rose-400/20",
        chip: "bg-rose-500/5",
        text: "text-rose-200/90",
      },
      signals: reviewIssues,
      isEmpty: reviewIssues.length === 0,
      count: reviewIssues.length,
    },
    marketOpportunities: {
      id: "market_opportunities",
      label: { en: "Market Opportunities", ar: "فرص السوق" },
      description: {
        en: "→ woven into title + short description",
        ar: "← تُنسج في العنوان + الوصف القصير",
      },
      icon: "TrendingUp",
      color: {
        icon: "text-emerald-400/80",
        header: "border-emerald-400/20",
        chip: "bg-emerald-500/5",
        text: "text-emerald-200/90",
      },
      signals: marketOpportunities,
      isEmpty: marketOpportunities.length === 0,
      count: marketOpportunities.length,
    },
    competitorKeywords: {
      id: "competitor_keywords",
      label: { en: "Competitor Keywords", ar: "كلمات المنافسين" },
      description: {
        en: "→ ASO optimization for title + short description",
        ar: "← تحسين ASO للعنوان + الوصف القصير",
      },
      icon: "Shield",
      color: {
        icon: "text-sky-400/80",
        header: "border-sky-400/20",
        chip: "bg-sky-500/5",
        text: "text-sky-200/90",
      },
      signals: competitorKeywords,
      isEmpty: competitorKeywords.length === 0,
      count: competitorKeywords.length,
    },
    totalSignals,
    lastUpdated: Date.now(),
    isLoading: false,
  };
}

/**
 * Get signals for a specific pillar
 */
export function getPillarSignals(
  state: StagingWorkspaceState,
  pillarId: "review_issues" | "market_opportunities" | "competitor_keywords"
): StagingSignal[] {
  if (pillarId === "review_issues") {
    return state.reviewIssues.signals;
  } else if (pillarId === "market_opportunities") {
    return state.marketOpportunities.signals;
  } else if (pillarId === "competitor_keywords") {
    return state.competitorKeywords.signals;
  }
  return [];
}

/**
 * Calculate total signal count
 */
export function calculateTotalSignalCount(state: StagingWorkspaceState): number {
  return (
    state.reviewIssues.count +
    state.marketOpportunities.count +
    state.competitorKeywords.count
  );
}

/**
 * Get signals organized by source for AI synthesis
 *
 * Returns signals grouped by pillar in the order they'll be used in AI prompts
 */
export function getSignalsForAISynthesis(
  state: StagingWorkspaceState
): {
  reviewIssues: ReviewIssueSignal[];
  marketOpportunities: MarketOpportunitySignal[];
  competitorKeywords: CompetitorKeywordSignal[];
} {
  return {
    reviewIssues: state.reviewIssues.signals,
    marketOpportunities: state.marketOpportunities.signals,
    competitorKeywords: state.competitorKeywords.signals,
  };
}

/**
 * Format signals for AI prompt construction
 *
 * Converts signals into human-readable format for AI prompt
 */
export function formatSignalsForPrompt(
  state: StagingWorkspaceState,
  locale: "en" | "ar" = "en"
): string {
  const isArabic = locale === "ar";
  const sections: string[] = [];

  // Review Issues section
  if (state.reviewIssues.count > 0) {
    const issueHeader = isArabic ? "مشكلات المراجعات:" : "Review Issues:";
    const issues = state.reviewIssues.signals
      .map((s) => `  - ${s.content}${s.severity ? ` [${s.severity}]` : ""}`)
      .join("\n");
    sections.push(`${issueHeader}\n${issues}`);
  }

  // Market Opportunities section
  if (state.marketOpportunities.count > 0) {
    const marketHeader = isArabic ? "فرص السوق:" : "Market Opportunities:";
    const opportunities = state.marketOpportunities.signals
      .map((s) => `  - ${s.keyword}${s.searchVolume ? ` (${s.searchVolume} searches)` : ""}`)
      .join("\n");
    sections.push(`${marketHeader}\n${opportunities}`);
  }

  // Competitor Keywords section
  if (state.competitorKeywords.count > 0) {
    const keywordHeader = isArabic ? "كلمات المنافسين:" : "Competitor Keywords:";
    const keywords = state.competitorKeywords.signals
      .map((s) => `  - ${s.keyword} [${s.category}]`)
      .join("\n");
    sections.push(`${keywordHeader}\n${keywords}`);
  }

  return sections.join("\n\n");
}

/**
 * Check if workspace has signals ready for generation
 */
export function hasSignalsForGeneration(state: StagingWorkspaceState): boolean {
  return state.totalSignals > 0;
}

/**
 * Get pillar summary for display
 */
export function getPillarSummary(
  pillar: StagingPillar,
  locale: "en" | "ar" = "en"
): string {
  const isArabic = locale === "ar";
  const label = pillar.label[locale];
  const count = pillar.count;

  if (count === 0) {
    return isArabic ? `${label} (فارغ)` : `${label} (empty)`;
  }

  return isArabic
    ? `${label} (${count} إشارة${count > 1 ? "ت" : ""})`
    : `${label} (${count} signal${count > 1 ? "s" : ""})`;
}

/**
 * Map signal source to pillar ID
 */
export function getSourcePillarId(
  source: SignalSource
): "review_issues" | "market_opportunities" | "competitor_keywords" {
  if (source === "review_issue") return "review_issues";
  if (source === "market_spotlight") return "market_opportunities";
  if (source === "competitor_keyword") return "competitor_keywords";
  return "competitor_keywords"; // Default fallback
}

/**
 * Get routing instruction for signal based on source
 *
 * Tells the AI system where to weave this signal into the listing
 */
export function getSignalRoutingInstruction(
  source: SignalSource,
  locale: "en" | "ar" = "en"
): string {
  const isArabic = locale === "ar";

  if (source === "review_issue") {
    return isArabic
      ? "تعالج في قسم 'ما هو جديد' و الوصف"
      : "Address in 'What's New' and description";
  }

  if (source === "market_spotlight") {
    return isArabic
      ? "تُنسج في العنوان والوصف القصير"
      : "Woven into title and short description";
  }

  if (source === "competitor_keyword") {
    return isArabic
      ? "تحسين ASO للعنوان والوصف القصير"
      : "ASO optimization for title and short description";
  }

  return "";
}
