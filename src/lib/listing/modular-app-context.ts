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
export function buildModularAppContextBlock(input: ListingOptimizerInput): string {
  const targetArabic = input.targetArabic ?? false;
  const keywords = input.targetKeywords.slice(0, 25);

  const lines = [
    "══════════════ APP CONTEXT (MANDATORY — ground every sentence in these facts) ══════════════",
    `App name: ${input.appName}`,
    `Category: ${input.category}`,
    `Target audience: ${audienceLine(input)}`,
    `Tone / voice: ${input.toneStyle}`,
    `Seed keywords: ${keywords.join(", ") || "(none — infer from category and features)"}`,
    "",
    "Core features & value proposition:",
    input.appFeatures.trim().slice(0, 4000) || "(no features provided — infer carefully from category only)",
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
    }),
  ];

  if (input.topStagedIssues?.length) {
    lines.push(
      `Top review insights: ${input.topStagedIssues.map((i) => i.label).join("; ")}`,
    );
  }

  if (input.activeContext && activeContextHasSignals(input.activeContext)) {
    const defensive = input.activeContext.defensive
      .slice(0, 5)
      .map((s) => s.label)
      .join("; ");
    const offensive = input.activeContext.offensive
      .slice(0, 5)
      .map((s) => s.label)
      .join("; ");
    const market = input.activeContext.market
      .slice(0, 5)
      .map((s) => s.label)
      .join("; ");
    if (defensive) lines.push(`Defensive signals: ${defensive}`);
    if (offensive) lines.push(`Offensive signals: ${offensive}`);
    if (market) lines.push(`Market signals: ${market}`);
  }

  return lines.filter(Boolean).join("\n");
}

export function buildModularOrchestrationContextBlock(
  input: ListingOptimizerInput,
  lockedKeywords?: string[],
): string {
  const locked =
    lockedKeywords && lockedKeywords.length > 0
      ? lockedKeywords
      : input.targetKeywords.slice(0, 20);
  const primaryPain =
    input.topStagedIssues?.[0]?.label ??
    (input.activeContext && activeContextHasSignals(input.activeContext)
      ? input.activeContext.defensive[0]?.label
      : undefined);

  return buildOrchestrationProtocolPromptBlock({
    targetArabic: input.targetArabic ?? false,
    lockedKeywords: locked,
    strategyMode: input.strategyMode ?? "defensive",
    topReviewInsights: input.topStagedIssues?.map((i) => i.label) ?? [],
    primaryPainPoint: primaryPain,
  });
}

/** @deprecated Use buildModularAppContextBlock — kept for title step compatibility. */
export function buildModularListingContextBlock(input: ListingOptimizerInput): string {
  return buildModularAppContextBlock(input);
}
