import type { ListingOptimizerInput } from "@/lib/types/listing";
import { activeContextHasSignals } from "@/lib/optimization-queue/build-active-context-synthesis";
import { buildStrategyModePromptBlock } from "@/lib/prompts/aso-strategy-mode";
import { buildModularListingContextBlock } from "@/lib/gemini/normalize-modular-parsed";

const MODULAR_PROMPT_VERSION = "listing-modular-v1.0";

export function getModularListingPromptVersion(): string {
  return MODULAR_PROMPT_VERSION;
}

function languageLine(targetArabic: boolean): string {
  return targetArabic
    ? "Output language: Modern Standard Arabic suitable for Google Play MENA."
    : "Output language: English suitable for Google Play.";
}

export { buildModularListingContextBlock };

export function buildModularTitleMessages(
  input: ListingOptimizerInput,
  lockedKeywords: string[],
): { system: string; user: string } {
  const targetArabic = input.targetArabic ?? false;
  const locked = lockedKeywords.length > 0 ? lockedKeywords : input.targetKeywords;
  const system = [
    "You are a Google Play ASO title specialist.",
    languageLine(targetArabic),
    "CRITICAL: Return ONLY this exact JSON shape — no orchestration wrapper, no modules key:",
    '{ "title": string, "lockedKeywords": string[] }',
    "title MUST be ≤30 characters, word-boundary safe, and MUST visibly include every locked keyword (woven naturally, not stuffed).",
    "lockedKeywords MUST echo the user-locked terms you honored.",
  ].join("\n");

  const user = [
    buildModularListingContextBlock(input),
    "",
    "PHASE 1 — TITLE (Hybrid Anchor)",
    `LOCKED KEYWORDS (mandatory in title): ${locked.join(", ")}`,
    buildStrategyModePromptBlock({
      strategyMode: input.strategyMode ?? "defensive",
      topStagedIssues: input.topStagedIssues ?? [],
      trackedKeywordSignals: input.trackedKeywordSignals,
      targetArabic,
    }),
    input.userInstruction?.trim()
      ? `Refinement: ${input.userInstruction.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

export function buildModularShortMessages(
  input: ListingOptimizerInput,
  contextTitle: string,
): { system: string; user: string } {
  const targetArabic = input.targetArabic ?? false;
  const system = [
    "You are a Google Play conversion copywriter.",
    languageLine(targetArabic),
    "Return JSON only: { \"variations\": [string, string, string] }.",
    "Each variation MUST be ≤80 chars, complete sentences only, distinct strategy angle.",
    "Variation 1: defensive — trust / pain resolution.",
    "Variation 2: offensive — market capture vs rivals.",
    "Variation 3: primary — matches active Strategy Profile.",
  ].join("\n");

  const user = [
    buildModularListingContextBlock(input),
    "",
    "PHASE 2 — SHORT DESCRIPTION",
    `ANCHOR TITLE (do not contradict): ${contextTitle}`,
    buildStrategyModePromptBlock({
      strategyMode: input.strategyMode ?? "defensive",
      topStagedIssues: input.topStagedIssues ?? [],
      trackedKeywordSignals: input.trackedKeywordSignals,
      targetArabic,
    }),
    input.topStagedIssues?.length
      ? `Top review insights: ${input.topStagedIssues.map((i) => i.label).join("; ")}`
      : "",
    input.userInstruction?.trim()
      ? `Refinement: ${input.userInstruction.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

export type LongBlockId = "hook" | "features" | "closing";

export function buildModularLongMessages(
  input: ListingOptimizerInput,
  context: { title: string; shortDescription: string },
  block?: LongBlockId,
): { system: string; user: string } {
  const targetArabic = input.targetArabic ?? false;
  const primaryPain =
    input.topStagedIssues?.[0]?.label ??
    (input.activeContext && activeContextHasSignals(input.activeContext)
      ? input.activeContext.defensive[0]?.label
      : undefined) ??
    "top user pain point";

  const blockInstruction = block
    ? `Regenerate ONLY the "${block}" block. Other blocks may be empty strings in JSON.`
    : "Return all three blocks.";

  const system = [
    "You are a Google Play long-description architect.",
    languageLine(targetArabic),
    "Return JSON only: { \"hook\": string, \"features\": string, \"closing\": string }.",
    blockInstruction,
    "hook (Block A): address the #1 pain point; ≤1200 chars.",
    "features (Block B): emoji-rich categorized bullets synthesized from staged signals; ≤2400 chars.",
    "closing (Block C): professional authoritative CTA; ≤800 chars.",
    "Stay semantically consistent with the anchor title and short description.",
  ].join("\n");

  const user = [
    buildModularListingContextBlock(input),
    "",
    "PHASE 3 — LONG DESCRIPTION",
    `ANCHOR TITLE: ${context.title}`,
    `ANCHOR SHORT: ${context.shortDescription}`,
    `#1 PAIN POINT: ${primaryPain}`,
    buildStrategyModePromptBlock({
      strategyMode: input.strategyMode ?? "defensive",
      topStagedIssues: input.topStagedIssues ?? [],
      trackedKeywordSignals: input.trackedKeywordSignals,
      targetArabic,
    }),
    input.userInstruction?.trim()
      ? `Refinement: ${input.userInstruction.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

export function buildModularFinalizeExtrasMessages(
  input: ListingOptimizerInput,
  copy: { title: string; shortDescription: string; fullDescription: string },
): { system: string; user: string } {
  const targetArabic = input.targetArabic ?? false;
  const system = [
    "You are a Google Play ASO auditor.",
    languageLine(targetArabic),
    "The listing copy is FINAL — do not rewrite title, shortDescription, or fullDescription.",
    "Return JSON: keywordSuggestions (string[]), ctaSuggestions (string[]), asoScore (0-100), scoreBreakdown { title, shortDescription, longDescription, persuasiveness }, improvementTips (string[]).",
  ].join("\n");

  const user = [
    `App: ${input.appName} / ${input.category}`,
    `Title: ${copy.title}`,
    `Short: ${copy.shortDescription}`,
    `Long:\n${copy.fullDescription.slice(0, 3500)}`,
    buildModularListingContextBlock(input),
  ].join("\n\n");

  return { system, user };
}
