import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import type { ActiveContextStrategyMode } from "@/lib/optimization-queue/resolve-strategy-mode";
import type { PrioritizedStagedIssue } from "@/lib/optimization-queue/resolve-strategy-mode";
import type { ClusterSynthesisPayload } from "@/lib/optimization-queue/build-active-context-synthesis";
import type { GenerationSignalContext } from "@/lib/listing/generation-signal-context.types";

export type ToneStyle = "professional" | "friendly" | "bold" | "minimal";

export type TrackedKeywordSignalInput = {
  keyword: string;
  confidence: number;
  difficulty?: number;
  searchVolume?: number;
  liveRankSummary?: string;
};

export type ListingOptimizerInput = {
  appName: string;
  category: string;
  targetKeywords: string[];
  appFeatures: string;
  toneStyle: ToneStyle;
  /** When true, model should return Arabic copy for all user-visible strings. */
  targetArabic?: boolean;
  /** Optional refinement appended to the user prompt (e.g. regenerate with a new angle). */
  userInstruction?: string;
  /**
   * Competitor pain-point targets staged from the Active Optimization Queue.
   * When present the prompt builder injects a strategic displacement campaign block
   * that positions the app against each identified competitor weakness.
   */
  exploitTargets?: string[];
  /**
   * Keyword Tracker signals from workspace_staging_vault (highest synthesis priority).
   */
  trackedKeywordSignals?: TrackedKeywordSignalInput[];
  /**
   * Dominant ASO Growth strategy mode from Active Context review signals.
   */
  strategyMode?: ActiveContextStrategyMode;
  /** Top staged issues by Impact % — drives Strategic Rationale in model output. */
  topStagedIssues?: PrioritizedStagedIssue[];
  /**
   * Unified Active Context — structured synthesis feedback loop for the LLM.
   * Replaces flat exploitTargets / prose userInstruction for queue signals.
   */
  activeContext?: ClusterSynthesisPayload;
  /** SHA-256 of the active optimization vault — binds synthesis to staged signals. */
  synthesisQueueHash?: string;
  /**
   * @server-only  Populated by `listing-generation-executor` before the Gemini call.
   * Aggregates all five workspace intelligence signals (brand kit, market intel,
   * reviews, keyword tracker, competitor signals) for prompt injection.
   * Never included in client-side API bodies.
   */
  signalContext?: GenerationSignalContext;
};

/** Gemini listing JSON shape (includes optional Certified ASO Score metadata). */
export type ListingOptimizerOutput = ListingGenerationOutput;
