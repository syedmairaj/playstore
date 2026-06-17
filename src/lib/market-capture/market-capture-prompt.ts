import type { MarketCaptureContext } from "@/lib/market-capture/market-capture.types";

const PROMPT_VERSION = "market-capture-v1";

export function getMarketCapturePromptVersion(): string {
  return PROMPT_VERSION;
}

function strategyLabels(locale: MarketCaptureContext["locale"]) {
  return locale === "ar"
    ? {
        a: "الإصدار أ — عدواني / معارض",
        b: "الإصدار ب — نمو / كلمات مفتاحية",
      }
    : {
        a: "Version A — Aggressive / Oppositional",
        b: "Version B — Growth / Keyword-Focused",
      };
}

export function buildMarketCaptureMessages(ctx: MarketCaptureContext): {
  system: string;
  user: string;
} {
  const labels = strategyLabels(ctx.locale);
  const lang = ctx.locale === "ar" ? "Arabic" : "English";

  const system = [
    "You are a Lead ASO Growth Strategist executing a high-stakes Market Capture campaign.",
    "Return ONLY valid JSON — no markdown, no prose outside JSON.",
    `All listing copy and rationales must be in ${lang}.`,
    "",
    "HARD CONSTRAINTS:",
    "- title: max 30 characters. Primary keyword + high-intent hook. Count before writing.",
    "- shortDescription: max 80 characters. Conversion-triggering, complete sentences only.",
    "- fullDescription: bullet points for features (use • or -). Natural keyword density 2–3%.",
    "- Tone: professional, authoritative, data-driven. Zero marketing fluff.",
    "- NEVER name the competitor in store copy.",
    "",
    "VERSION A (oppositional): Exploit competitor bugs/pain points. Position our app as transparent, user-first.",
    "VERSION B (growth): Maximize visibility via high-volume, high-intent Keyword Tracker terms.",
    "",
    "Every field MUST include a concise strategicRationale explaining WHY (data-driven, one sentence).",
    "Do NOT auto-apply — these are staged proposals for human review.",
  ].join("\n");

  const user = [
    "═══════════════════════════════════════════",
    "MARKET CAPTURE BRIEF",
    "═══════════════════════════════════════════",
    `Competitor target: ${ctx.competitorName}`,
    `Our app: ${ctx.appName}`,
    `Category: ${ctx.category}`,
    "",
    "CURRENT LISTING (baseline — propose changes against this):",
    `Title: ${ctx.currentListing?.title ?? "(none)"}`,
    `Short: ${ctx.currentListing?.shortDescription ?? "(none)"}`,
    `Long excerpt: ${(ctx.currentListing?.fullDescription ?? "(none)").slice(0, 400)}`,
    "",
    "GROWTH KEYWORDS (Version B — prioritize in title/short):",
    ctx.growthKeywords.length ? ctx.growthKeywords.join(", ") : "(none staged)",
    "",
    "OPPOSITIONAL PAIN POINTS (Version A — invert into counter-features):",
    ctx.oppositionalPainPoints.length
      ? ctx.oppositionalPainPoints.join("; ")
      : "(none staged — still differentiate on trust/clarity)",
    "",
    "Review praise to mirror:",
    ctx.reviewPraise.join(", ") || "(none)",
    "",
    "Feature requests to preempt:",
    ctx.featureRequests.join(", ") || "(none)",
    "",
    "APP FEATURES (honest bounds — do not invent):",
    ctx.appFeatures,
    "",
    "Return JSON:",
    `{`,
    `  "versionA": { "strategy": "oppositional", "label": "${labels.a}",`,
    `    "title": { "value": "", "rationale": "", "charCount": 0 },`,
    `    "shortDescription": { "value": "", "rationale": "", "charCount": 0 },`,
    `    "fullDescription": { "value": "", "rationale": "", "keywordDensityPercent": 2.5 },`,
    `    "whatsNew": { "value": "", "rationale": "", "charCount": 0 }`,
    `  },`,
    `  "versionB": { "strategy": "growth", "label": "${labels.b}", ...same shape... }`,
    `}`,
  ].join("\n");

  return { system, user };
}
