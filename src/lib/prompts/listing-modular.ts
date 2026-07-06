import type { ListingOptimizerInput } from "@/lib/types/listing";
import {
  MODULAR_JSON_API_CRITICAL_RULES,
  MODULAR_LONG_FEATURES_ONLY_INTERFACE,
  MODULAR_LONG_HOOK_CLOSING_INTERFACE,
  MODULAR_LONG_JSON_INTERFACE,
  MODULAR_LONG_REDUCED_COMPLEXITY_RULES,
  MODULAR_LONG_STYLISTIC_RULES,
  MODULAR_SHORT_JSON_CRITICAL,
  MODULAR_SHORT_JSON_INTERFACE,
  MODULAR_TITLE_JSON_INTERFACE,
} from "@/lib/prompts/listing-modular-json";
import {
  buildModularAppContextBlock,
  buildModularOrchestrationContextBlock,
} from "@/lib/listing/modular-app-context";
import {
  buildPainPointSolutionUserBlock,
  MODULAR_PAIN_POINT_SOLUTION_TEMPLATE,
} from "@/lib/prompts/listing-pain-point-template";

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
    MODULAR_JSON_API_CRITICAL_RULES,
    "JSON schema (TypeScript interface):",
    MODULAR_TITLE_JSON_INTERFACE,
    "CRITICAL: Return ONLY this exact JSON shape — no orchestration wrapper, no modules key.",
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
    MODULAR_SHORT_JSON_CRITICAL,
    MODULAR_PAIN_POINT_SOLUTION_TEMPLATE,
    "JSON schema (TypeScript interface):",
    MODULAR_SHORT_JSON_INTERFACE,
    "STRATEGY PRIORITY: utility variation is the primary install hook — lead with Pain-Point → Solution framing.",
    "GRAMMATICAL COMPLETION (mandatory): each text MUST be a complete sentence ending with . ! or ? (or ؟ for Arabic).",
    "Each text MUST be ≤80 characters. If a strategy angle would exceed 80 chars, REWRITE for brevity — never truncate mid-word or mid-sentence.",
    "REJECT patterns: trailing hyphens, comma/colon endings, ellipsis cuts, or partial final words.",
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
    buildPainPointSolutionUserBlock({
      primaryPain:
        input.topStagedIssues?.[0]?.label ??
        input.activeContext?.defensive?.[0]?.label ??
        "top user pain from APP CONTEXT",
      appName: input.appName,
    }),
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
  options?: { compactContext?: boolean },
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
    ? `Regenerate ONLY the "${block}" block. Other blocks may be empty (features: [], hook: "", closing: "").`
    : [
        "Return all three blocks — features array, hook, and closing MUST each be non-empty.",
        "SCHEMA-FIRST ORDER (mandatory): emit `features` array completely, then `hook`, then `closing`.",
      ].join(" ");
  const lengthRule = block
    ? ""
    : "STYLE: Write a punchy, 2-sentence hook. Provide a detailed features list. End with a high-conversion closing — the system assembles the final Play listing.";

  const signalDirectives = buildSignalDrivenLongBlock(input);

  const system = [
    "You are a Google Play long-description architect.",
    languageLine(targetArabic),
    MODULAR_JSON_API_CRITICAL_RULES,
    MODULAR_LONG_STYLISTIC_RULES,
    MODULAR_PAIN_POINT_SOLUTION_TEMPLATE,
    signalDirectives,
    "JSON schema (TypeScript interface) — property order is mandatory:",
    MODULAR_LONG_JSON_INTERFACE,
    "Return JSON only. Property order: features (array) → hook (string) → closing (string).",
    blockInstruction,
    lengthRule,
    "features (WRITE FIRST): detailed emoji-labelled sections with bullet arrays from APP CONTEXT.",
    "hook (WRITE SECOND): punchy 2-sentence opening addressing #1 pain point.",
    "closing (WRITE LAST): high-conversion CTA with a concrete app benefit.",
    "Stay semantically consistent with the anchor title and short description.",
    'FORBIDDEN: generic placeholders ("Discover more", "Download now") without app-specific proof.',
    "When generating all blocks, each of hook/features/closing MUST contain substantive copy.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    buildModularAppContextBlock(input, { compact: options?.compactContext }),
    "",
    buildModularOrchestrationContextBlock(input, locked, {
      compact: options?.compactContext,
    }),
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

export type ModularLongPromptOptions = {
  compactContext?: boolean;
  reducedComplexity?: boolean;
};

/**
 * Builds a signal-driven directive block for the long description system prompt.
 * Only emitted when `input.signalContext` carries non-empty signals.
 *
 * EN/AR: labels are in English — the model handles locale via `languageLine`.
 */
function buildSignalDrivenLongBlock(input: ListingOptimizerInput): string {
  const sc = input.signalContext;
  if (!sc) return "";

  const lines: string[] = [];

  const marketGaps = sc.marketIntel.gaps.filter(Boolean);
  const reviewPains = sc.reviews.topPainPoints.filter(Boolean);
  const competitorWeaknesses = sc.competitorSignals.weaknesses.filter(Boolean);
  const opportunityKws = sc.keywordTracker.opportunityKeywords.filter(Boolean);
  const brandStyle = sc.brandKit.style;
  const brandTone = sc.brandKit.toneGuidelines;
  const brandColor = sc.brandKit.primaryColor;

  const hasAnySignal =
    marketGaps.length > 0 ||
    reviewPains.length > 0 ||
    competitorWeaknesses.length > 0 ||
    opportunityKws.length > 0 ||
    brandStyle ||
    brandTone;

  if (!hasAnySignal) return "";

  lines.push("══════════════ SIGNAL-DRIVEN DIRECTIVES (MANDATORY) ══════════════");

  if (marketGaps.length > 0) {
    lines.push(
      `[MARKET GAPS] Identify and address these gaps in the features block: ${marketGaps.join("; ")}`,
    );
  }

  if (brandStyle || brandTone) {
    const brandParts = [brandStyle && `style: ${brandStyle}`, brandTone && `tone: ${brandTone}`]
      .filter(Boolean)
      .join(", ");
    lines.push(
      `[BRAND KIT] Apply these brand guidelines throughout — rewrite using the defined voice: ${brandParts}`,
    );
    if (brandColor) {
      lines.push(`[BRAND COLOR] Reference "${brandColor}" as the brand accent in uiFocus descriptions.`);
    }
  }

  if (reviewPains.length > 0) {
    lines.push(
      `[REVIEW PAIN POINTS] Resolve these user complaints in the hook block: ${reviewPains.join("; ")}`,
    );
  }

  if (competitorWeaknesses.length > 0) {
    lines.push(
      `[COMPETITOR DIFFERENTIATION] Position against these weaknesses in the closing block: ${competitorWeaknesses.join("; ")}`,
    );
  }

  if (opportunityKws.length > 0) {
    lines.push(
      `[KEYWORD OPPORTUNITIES] Surface these naturally across all blocks: ${opportunityKws.join(", ")}`,
    );
  }

  lines.push("══════════════════════════════════════════════════════════════════");

  return lines.join("\n");
}

function longSharedUserBlock(
  input: ListingOptimizerInput,
  context: { title: string; shortDescription: string },
  locked: string[],
  options?: ModularLongPromptOptions,
): string {
  const primaryPain =
    input.topStagedIssues?.[0]?.label ??
    input.activeContext?.defensive?.[0]?.label ??
    "top user pain point from APP CONTEXT";

  return [
    buildModularAppContextBlock(input, { compact: options?.compactContext }),
    "",
    buildModularOrchestrationContextBlock(input, locked, {
      compact: options?.compactContext,
    }),
    "",
    buildPainPointSolutionUserBlock({
      primaryPain,
      appName: input.appName,
      anchorShort: context.shortDescription,
    }),
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
}

/** Call 1 — features array only (granular long generation). */
export function buildModularLongFeaturesOnlyMessages(
  input: ListingOptimizerInput,
  context: { title: string; shortDescription: string },
  lockedKeywords?: string[],
  options?: ModularLongPromptOptions,
): { system: string; user: string } {
  const targetArabic = input.targetArabic ?? false;
  const locked =
    lockedKeywords && lockedKeywords.length > 0
      ? lockedKeywords
      : input.targetKeywords.slice(0, 20);
  const reduced = options?.reducedComplexity === true;
  const sectionRule = reduced
    ? "Provide a shorter detailed features list — fewer sections, crisp bullets."
    : "Provide a detailed features list with emoji section labels and substantive bullets.";

  const signalDirectivesFeatures = buildSignalDrivenLongBlock(input);

  const system = [
    "You are a Google Play long-description features architect.",
    languageLine(targetArabic),
    MODULAR_JSON_API_CRITICAL_RULES,
    MODULAR_LONG_STYLISTIC_RULES,
    ...(reduced ? [MODULAR_LONG_REDUCED_COMPLEXITY_RULES] : []),
    signalDirectivesFeatures,
    "JSON schema (TypeScript interface):",
    MODULAR_LONG_FEATURES_ONLY_INTERFACE,
    "Return JSON only with a single `features` array key.",
    sectionRule,
    "Prioritize complete JSON structure over verbose prose — never truncate mid-array.",
    "Synthesize every section from APP CONTEXT — no generic filler.",
    "Stay semantically consistent with the anchor title and short description.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = longSharedUserBlock(input, context, locked, options);
  return { system, user };
}

/** Call 2 — hook + closing only, with cached features body as anchor. */
export function buildModularLongHookClosingMessages(
  input: ListingOptimizerInput,
  context: { title: string; shortDescription: string },
  featuresBody: string,
  lockedKeywords?: string[],
  options?: ModularLongPromptOptions,
): { system: string; user: string } {
  const targetArabic = input.targetArabic ?? false;
  const locked =
    lockedKeywords && lockedKeywords.length > 0
      ? lockedKeywords
      : input.targetKeywords.slice(0, 20);
  const reduced = options?.reducedComplexity === true;

  const signalDirectivesHookClosing = buildSignalDrivenLongBlock(input);

  const system = [
    "You are a Google Play long-description opener/closer architect.",
    languageLine(targetArabic),
    MODULAR_JSON_API_CRITICAL_RULES,
    MODULAR_LONG_STYLISTIC_RULES,
    signalDirectivesHookClosing,
    "JSON schema (TypeScript interface):",
    MODULAR_LONG_HOOK_CLOSING_INTERFACE,
    "Return JSON only with `hook` and `closing` string keys.",
    reduced
      ? "Write a punchy, 2-sentence hook and a single-sentence closing CTA."
      : "hook: punchy 2-sentence opening addressing #1 pain point. closing: high-conversion CTA with a concrete benefit.",
    "Do NOT rewrite the features body — only write hook and closing that frame it.",
    'FORBIDDEN: generic placeholders ("Discover more", "Download now") without app-specific proof.',
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    longSharedUserBlock(input, context, locked, options),
    "",
    "CACHED FEATURES BODY (do not repeat — write hook/closing that complement this):",
    featuresBody.slice(0, 2800),
  ].join("\n");

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
