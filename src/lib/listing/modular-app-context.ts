import type { ListingOptimizerInput, ToneStyle } from "@/lib/types/listing";
import { activeContextHasSignals } from "@/lib/optimization-queue/build-active-context-synthesis";
import { buildStrategyModePromptBlock } from "@/lib/prompts/aso-strategy-mode";
import { buildOrchestrationProtocolPromptBlock } from "@/lib/prompts/listing-orchestration-protocol";

const AUDIENCE_BY_TONE: Record<ToneStyle, { en: string; ar: string }> = {
  professional: {
    en: "Professionals and power users who need precision, reliability, and measurable outcomes.",
    ar: "المحترفون والمستخدمون المتقدمون الذين يحتاجون دقة وموثوقية ونتائج قابلة للقياس.",
  },
  friendly: {
    en: "Everyday users who want simple, encouraging progress without complexity or guilt.",
    ar: "المستخدمون اليوميون الذين يريدون تقدماً بسيطاً ومشجعاً دون تعقيد أو ضغط.",
  },
  bold: {
    en: "Ambitious users ready to take action and see fast, high-impact results.",
    ar: "المستخدمون الطموحون المستعدون للتحرك ورؤية نتائج سريعة وعالية التأثير.",
  },
  minimal: {
    en: "Users who value clarity, control, and distraction-free utility.",
    ar: "المستخدمون الذين يقدّرون الوضوح والتحكم والمنفعة دون إزعاج.",
  },
};

function audienceLine(input: ListingOptimizerInput): string {
  const locale = input.targetArabic ? "ar" : "en";
  return AUDIENCE_BY_TONE[input.toneStyle][locale];
}

/** Full app context injected into modular Phase 2 & Phase 3 prompts. */
export function buildModularAppContextBlock(
  input: ListingOptimizerInput,
  options?: { compact?: boolean },
): string {
  const targetArabic = input.targetArabic ?? false;
  const compact = options?.compact === true;
  const keywordCap = compact ? 12 : 25;
  const featureCap = compact ? 1200 : 4000;
  const signalCap = compact ? 2 : 3;
  const keywords = input.targetKeywords.slice(0, keywordCap);

  const lines = [
    "══════════════ APP CONTEXT (MANDATORY — ground every sentence in these facts) ══════════════",
    `App name: ${input.appName}`,
    `Category: ${input.category}`,
    `Target audience: ${audienceLine(input)}`,
    `Tone / voice: ${input.toneStyle}`,
    `Seed keywords: ${keywords.join(", ") || "(none — infer from category and features)"}`,
    "",
    "Core features & value proposition:",
    input.appFeatures.trim().slice(0, featureCap) || "(no features provided — infer carefully from category only)",
    "",
    targetArabic
      ? "Output language: Modern Standard Arabic suitable for Google Play MENA."
      : "Output language: English suitable for Google Play.",
    "",
    "RULES:",
    "- Reference the app by name where natural.",
    "- Tie benefits to the category and features above — never generic placeholder copy.",
    '- NEVER output filler such as "Discover more", "Learn more", or "Download now" without app-specific proof.',
    buildStrategyModePromptBlock({
      strategyMode: input.strategyMode ?? "defensive",
      topStagedIssues: input.topStagedIssues ?? [],
      trackedKeywordSignals: input.trackedKeywordSignals,
      targetArabic,
      selectedTone: input.toneStyle,
    }),
  ];

  if (input.topStagedIssues?.length) {
    const issues = compact
      ? input.topStagedIssues.slice(0, 1)
      : input.topStagedIssues;
    lines.push(`Top review insights: ${issues.map((i) => i.label).join("; ")}`);
  }

  if (input.activeContext && activeContextHasSignals(input.activeContext)) {
    const defensive = input.activeContext.defensive
      .slice(0, signalCap)
      .map((s) => s.label)
      .join("; ");
    const offensive = input.activeContext.offensive
      .slice(0, signalCap)
      .map((s) => s.label)
      .join("; ");
    const market = input.activeContext.market
      .slice(0, signalCap)
      .map((s) => s.label)
      .join("; ");
    if (defensive) lines.push(`Defensive signals: ${defensive}`);
    if (offensive) lines.push(`Offensive signals: ${offensive}`);
    if (market) lines.push(`Market signals: ${market}`);
  }

  if (input.synthesisQueueHash?.trim()) {
    lines.push(
      "",
      "══════════════ QUEUE HASH SYNTHESIS (MANDATORY) ══════════════",
      `Active Context queue hash: ${input.synthesisQueueHash.trim()}`,
      "You MUST ground title, short, and long copy in the Keyword Tracker + Active Context signals that produced this hash.",
      "Do NOT emit empty strings or generic placeholder copy when signals are present.",
      "If staged signals are insufficient for a section, still produce best-effort copy from tracked keywords and app context — never return blank fields.",
    );
  }

  const tracked = input.trackedKeywordSignals ?? [];
  if (tracked.length > 0) {
    lines.push(
      "",
      `Keyword Tracker signals (${tracked.length}): ${tracked
        .slice(0, signalCap)
        .map((s) => `${s.keyword} (${s.confidence}%)`)
        .join(", ")}`,
    );
  }

  // Brand Kit — injected by the executor from DB; optional enrichment.
  if (input.signalContext?.brandKit) {
    const bk = input.signalContext.brandKit;
    const bkParts: string[] = [];
    if (bk.style) bkParts.push(`style: ${bk.style}`);
    if (bk.toneGuidelines && bk.toneGuidelines !== bk.style) bkParts.push(`tone: ${bk.toneGuidelines}`);
    if (bk.primaryColor) bkParts.push(`primary color: ${bk.primaryColor}`);
    if (bkParts.length > 0) {
      lines.push("", `Brand Kit (apply to all copy): ${bkParts.join(" | ")}`);
    }
  }

  return lines.filter(Boolean).join("\n");
}

export function buildModularOrchestrationContextBlock(
  input: ListingOptimizerInput,
  lockedKeywords?: string[],
  options?: { compact?: boolean },
): string {
  const locked =
    lockedKeywords && lockedKeywords.length > 0
      ? lockedKeywords.slice(0, options?.compact ? 10 : 20)
      : input.targetKeywords.slice(0, options?.compact ? 10 : 20);
  const primaryPain =
    input.topStagedIssues?.[0]?.label ??
    (input.activeContext && activeContextHasSignals(input.activeContext)
      ? input.activeContext.defensive[0]?.label
      : undefined);

  return buildOrchestrationProtocolPromptBlock({
    targetArabic: input.targetArabic ?? false,
    lockedKeywords: locked,
    strategyMode: input.strategyMode ?? "defensive",
    topReviewInsights: (input.topStagedIssues ?? [])
      .slice(0, options?.compact ? 1 : undefined)
      .map((i) => i.label),
    primaryPainPoint: primaryPain,
  });
}

/** Reduce prompt context ~50% for long-description retry after truncation failure. */
export function summarizeListingInputForLongRetry(
  input: ListingOptimizerInput,
): ListingOptimizerInput {
  return {
    ...input,
    appFeatures: input.appFeatures.trim().slice(0, Math.max(400, Math.floor(input.appFeatures.length * 0.5))),
    targetKeywords: input.targetKeywords.slice(
      0,
      Math.max(3, Math.ceil(input.targetKeywords.length * 0.5)),
    ),
    topStagedIssues: input.topStagedIssues?.slice(
      0,
      Math.max(1, Math.ceil((input.topStagedIssues?.length ?? 0) * 0.5)),
    ),
    trackedKeywordSignals: input.trackedKeywordSignals?.slice(
      0,
      Math.max(2, Math.ceil((input.trackedKeywordSignals?.length ?? 0) * 0.5)),
    ),
    userInstruction: input.userInstruction
      ? input.userInstruction.trim().slice(0, Math.max(120, Math.floor(input.userInstruction.length * 0.5)))
      : undefined,
  };
}

/** @deprecated Use buildModularAppContextBlock — kept for title step compatibility. */
export function buildModularListingContextBlock(input: ListingOptimizerInput): string {
  return buildModularAppContextBlock(input);
}
