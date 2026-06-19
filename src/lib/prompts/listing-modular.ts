import type { ListingOptimizerInput } from "@/lib/types/listing";
import {
  buildModularAppContextBlock,
  buildModularOrchestrationContextBlock,
} from "@/lib/listing/modular-app-context";

const MODULAR_PROMPT_VERSION = "listing-modular-v1.2";

export function getModularListingPromptVersion(): string {
  return MODULAR_PROMPT_VERSION;
}

function languageLine(targetArabic: boolean): string {
  return targetArabic
    ? "Output language: Modern Standard Arabic suitable for Google Play MENA."
    : "Output language: English suitable for Google Play.";
}

export { buildModularAppContextBlock as buildModularListingContextBlock } from "@/lib/listing/modular-app-context";

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
    "Ground the title in the APP CONTEXT — never generic placeholder copy.",
  ].join("\n");

  const user = [
    buildModularAppContextBlock(input),
    "",
    "PHASE 1 — TITLE (Hybrid Anchor)",
    `LOCKED KEYWORDS (mandatory in title): ${locked.join(", ")}`,
    buildModularOrchestrationContextBlock(input, locked),
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
  lockedKeywords?: string[],
): { system: string; user: string } {
  const targetArabic = input.targetArabic ?? false;
  const locked =
    lockedKeywords && lockedKeywords.length > 0
      ? lockedKeywords
      : input.targetKeywords.slice(0, 20);
  const system = [
    "You are a Google Play conversion copywriter.",
    languageLine(targetArabic),
    'Return ONLY a JSON object. Do not wrap in markdown blocks.',
    'Structure: { "variations": [ {"type": "growth", "text": "..."}, {"type": "conversion", "text": "..."}, {"type": "utility", "text": "..."} ] }.',
    "Ensure exactly 3 items — one per type: growth, conversion, utility.",
    "Each text MUST be ≤80 chars, complete sentences only, distinct strategy angle.",
    "growth: acquisition keywords and category expansion tied to APP CONTEXT.",
    "conversion: trust, social proof, and install intent tied to APP CONTEXT.",
    "utility: core features and day-one value tied to APP CONTEXT.",
    "Every text MUST mention a concrete benefit from the app features — never generic filler.",
    'FORBIDDEN: "Discover more", "Learn more", or any placeholder not grounded in the app.',
  ].join("\n");

  const user = [
    buildModularAppContextBlock(input),
    "",
    buildModularOrchestrationContextBlock(input, locked),
    "",
    "PHASE 2 — SHORT DESCRIPTION",
    `ANCHOR TITLE (do not contradict): ${contextTitle}`,
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
  lockedKeywords?: string[],
): { system: string; user: string } {
  const targetArabic = input.targetArabic ?? false;
  const locked =
    lockedKeywords && lockedKeywords.length > 0
      ? lockedKeywords
      : input.targetKeywords.slice(0, 20);
  const primaryPain =
    input.topStagedIssues?.[0]?.label ??
    input.activeContext?.defensive?.[0]?.label ??
    "top user pain point from APP CONTEXT";

  const blockInstruction = block
    ? `Regenerate ONLY the "${block}" block. Other blocks may be empty strings in JSON.`
    : "Return all three blocks — hook, features, and closing MUST each be non-empty.";

  const system = [
    "You are a Google Play long-description architect.",
    languageLine(targetArabic),
    "Return JSON only: { \"hook\": string, \"features\": string, \"closing\": string }.",
    blockInstruction,
    "hook (Block A): opening promise addressing the #1 pain point using app name + category + features.",
    "features (Block B): emoji-rich categorized bullets synthesized from APP CONTEXT features and staged signals.",
    "closing (Block C): professional authoritative CTA referencing a concrete app benefit.",
    "Stay semantically consistent with the anchor title and short description.",
    'FORBIDDEN: generic placeholders ("Discover more", "Download now") without app-specific proof.',
    "When generating all blocks, each of hook/features/closing MUST contain substantive copy.",
  ].join("\n");

  const user = [
    buildModularAppContextBlock(input),
    "",
    buildModularOrchestrationContextBlock(input, locked),
    "",
    "PHASE 3 — LONG DESCRIPTION",
    `ANCHOR TITLE: ${context.title}`,
    `ANCHOR SHORT: ${context.shortDescription}`,
    `#1 PAIN POINT: ${primaryPain}`,
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
    buildModularAppContextBlock(input),
  ].join("\n\n");

  return { system, user };
}
