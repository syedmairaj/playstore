/**
 * Canonical JSONB metadata contract for workspace_staging_vault signals.
 * Every producer MUST enrich payloads through enrichStagingVaultMetadata().
 */

import type { OptimizationQueueCategory } from "@/lib/optimization-queue/optimization-queue.types";

export type StagingVaultOriginModule =
  | "market_intel"
  | "review_analysis"
  | "competitor_spy"
  | "keyword_tracker"
  | "manual"
  | "api";

/** Immutable Active Context section — prevents cross-pillar merge. */
export type ActiveContextSection = OptimizationQueueCategory;

export type StagingVaultMetadataInput = {
  source?: string;
  signalType?: string;
  sourceContext?: string;
  category?: string;
  metadata?: Record<string, unknown>;
  /** Explicit override when producer knows the module. */
  originModule?: StagingVaultOriginModule;
  confidenceScore?: number | null;
  userSelected?: boolean;
  activeContextSection?: ActiveContextSection;
};

export type EnrichedStagingVaultMetadata = Record<string, unknown> & {
  origin_module: StagingVaultOriginModule;
  confidence_score: number | null;
  user_selected_boolean: boolean;
  active_context_section: ActiveContextSection;
};

const REVIEW_SIGNAL_TYPES = new Set([
  "review_issue",
  "review_pain_point",
  "feature_request",
]);

const MARKET_SIGNAL_SOURCES = new Set([
  "market_intel",
  "market_intelligence",
  "keyword_spotlight",
]);

function clampConfidence(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.min(1, Math.max(0, value));
}

/** Infer origin_module from legacy source / signal_type fields. */
export function resolveOriginModule(input: StagingVaultMetadataInput): StagingVaultOriginModule {
  if (input.originModule) return input.originModule;

  const meta = input.metadata ?? {};
  const fromMeta = meta.origin_module ?? meta.source_origin;
  if (typeof fromMeta === "string") {
    const normalized = fromMeta.trim().toLowerCase();
    if (normalized === "market_intel" || normalized === "market_intelligence") {
      return "market_intel";
    }
    if (normalized === "review_analysis") return "review_analysis";
    if (normalized === "competitor_spy") return "competitor_spy";
    if (normalized === "keyword_tracker") return "keyword_tracker";
    if (normalized === "manual") return "manual";
    if (normalized === "api") return "api";
  }

  const source = String(input.source ?? "").toLowerCase();
  const signalType = String(input.signalType ?? "").toLowerCase();
  const ctx = String(input.sourceContext ?? "").toLowerCase();

  if (REVIEW_SIGNAL_TYPES.has(signalType) || source === "review_analysis" || ctx.includes("review")) {
    return "review_analysis";
  }
  if (
    MARKET_SIGNAL_SOURCES.has(source) ||
    ctx.includes("keyword_spotlight") ||
    ctx.includes("market_opportunity") ||
    meta.from_keyword_spotlight === true
  ) {
    return "market_intel";
  }
  if (source === "competitor_spy" || ctx.includes("competitor")) {
    return "competitor_spy";
  }
  if (source === "keyword_tracker" || ctx.includes("keyword_tracker")) {
    return "keyword_tracker";
  }
  if (source === "api") return "api";
  return "manual";
}

/** Resolve the single Active Context widget section for a signal. */
export function resolveActiveContextSection(
  input: StagingVaultMetadataInput,
): ActiveContextSection {
  if (input.activeContextSection) return input.activeContextSection;

  const meta = input.metadata ?? {};
  const fromMeta = meta.active_context_section ?? meta.category;
  if (
    fromMeta === "tracker" ||
    fromMeta === "review" ||
    fromMeta === "opportunity" ||
    fromMeta === "strength"
  ) {
    return fromMeta;
  }

  const origin = resolveOriginModule(input);
  const signalType = String(input.signalType ?? "").toLowerCase();

  if (REVIEW_SIGNAL_TYPES.has(signalType) || origin === "review_analysis") {
    return "review";
  }
  if (origin === "keyword_tracker") return "tracker";
  if (origin === "competitor_spy") {
    if (signalType === "competitor_weakness" || signalType === "competitor_strength") {
      return "strength";
    }
    return "opportunity";
  }
  if (origin === "market_intel") return "opportunity";
  return "opportunity";
}

/**
 * Strict boundary check — review signals MUST NOT route to market opportunities.
 * Returns the corrected section when a producer payload violates schema boundaries.
 */
export function enforceActiveContextSectionBoundary(args: {
  signalType?: string;
  source?: string;
  proposedSection: ActiveContextSection;
  metadata?: Record<string, unknown>;
}): ActiveContextSection {
  const signalType = String(args.signalType ?? "").toLowerCase();
  const source = String(args.source ?? "").toLowerCase();
  const origin = resolveOriginModule({
    source: args.source,
    signalType: args.signalType,
    metadata: args.metadata,
  });

  if (
    REVIEW_SIGNAL_TYPES.has(signalType) ||
    origin === "review_analysis" ||
    source === "review_analysis"
  ) {
    return "review";
  }

  if (origin === "market_intel" && args.proposedSection === "review") {
    return "opportunity";
  }

  if (origin === "review_analysis" && args.proposedSection === "opportunity") {
    return "review";
  }

  return args.proposedSection;
}

/** Merge canonical metadata fields into a JSONB payload (non-destructive). */
export function enrichStagingVaultMetadata(
  input: StagingVaultMetadataInput,
): EnrichedStagingVaultMetadata {
  const base = { ...(input.metadata ?? {}) };
  const origin_module = resolveOriginModule(input);
  let active_context_section = enforceActiveContextSectionBoundary({
    signalType: input.signalType,
    source: input.source,
    proposedSection: resolveActiveContextSection(input),
    metadata: base,
  });

  const user_selected_boolean =
    input.userSelected ??
    (typeof base.user_selected_boolean === "boolean"
      ? base.user_selected_boolean
      : typeof base.userSelected === "boolean"
        ? base.userSelected
        : base.from_keyword_spotlight === true ||
          base.from_keyword_curation === true ||
          base.from_gap_analysis === true);

  const confidence_score =
    input.confidenceScore !== undefined
      ? clampConfidence(input.confidenceScore)
      : clampConfidence(base.confidence_score ?? base.confidenceScore) ??
        (user_selected_boolean ? 1 : origin_module === "market_intel" ? 0.82 : null);

  return {
    ...base,
    origin_module,
    confidence_score,
    user_selected_boolean,
    active_context_section,
    category: active_context_section,
    source_origin: base.source_origin ?? origin_module,
  };
}

/** Returns true when item belongs in Market Opportunities (not Review Insights). */
export function isMarketOpportunityMetadata(metadata?: Record<string, unknown>): boolean {
  const section = metadata?.active_context_section ?? metadata?.category;
  if (section === "opportunity") return true;
  if (section === "review") return false;
  const origin = metadata?.origin_module ?? metadata?.source_origin;
  return origin === "market_intel" || origin === "market_intelligence";
}

/** Returns true when item belongs in Review Insights only. */
export function isReviewInsightMetadata(metadata?: Record<string, unknown>): boolean {
  const section = metadata?.active_context_section ?? metadata?.category;
  if (section === "review") return true;
  if (section === "opportunity") return false;
  return metadata?.origin_module === "review_analysis" || metadata?.source_origin === "review_analysis";
}
