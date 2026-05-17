import type { ListingOptimizerInput, ToneStyle } from "@/lib/types/listing";

const PROMPT_VERSION = "listing-optimizer-v4";

export function getListingOptimizerPromptVersion(): string {
  return PROMPT_VERSION;
}

const TONE_FOR_PROMPT: Record<ToneStyle, string> = {
  professional: "Clear & Benefit-focused, professional",
  friendly: "Clear & Benefit-focused, friendly",
  bold: "Clear & Benefit-focused, bold",
  minimal: "Clear & Benefit-focused, minimal",
};

/**
 * Full ASO strategist brief + markdown output spec (e.g. for docs, evals, or non-JSON tools).
 * For the live API, {@link buildListingOptimizerMessages} reuses the same rules but requires JSON.
 */
export const listingOptimizerPrompt = (
  appName: string,
  category: string,
  keywords: string[],
  tone: string = "Clear & Benefit-focused",
  targetArabic: boolean = false,
) => `
You are an expert Google Play ASO Strategist for indie Android developers.

App: ${appName}
Category: ${category}
Primary Keywords: ${keywords.join(", ")}

Rules:
- Title: at most 30 characters (hard limit; never exceed).
- Short description: at most 80 characters (hard limit; never exceed) — one sharp conversion hook; prioritize conversion; shorten aggressively if needed.
- Long description: at most 4000 characters — Feature → Benefit structure with bullet points and sections.
- Naturally integrate keywords without stuffing.
- Tone: ${tone}. Professional but approachable. No generic marketing fluff.
${
  targetArabic
    ? "- Language: Provide natural, modern Arabic (MSA/Gulf mix suitable for MENA) for all sections below."
    : "- Language: Write in clear English unless the app or audience clearly requires another language."
}

Output in this exact format:

**Optimized Title**
[Title]

**Short Description**
[Short desc]

**Long Description**
[Full description with proper formatting]

**Keyword Strategy**
• Primary keywords used
• Secondary opportunities

**Expected Impact**
Short explanation of ranking & conversion potential.
`.trim();

function listingOptimizerStrategyBlock(
  appName: string,
  category: string,
  keywords: string[],
  tone: string,
  targetArabic: boolean,
): string {
  return [
    "You are an expert Google Play ASO Strategist for indie Android developers.",
    "",
    `App: ${appName}`,
    `Category: ${category}`,
    `Primary Keywords: ${keywords.join(", ")}`,
    "",
    "Rules (Google Play HARD limits — counts every character including spaces and punctuation):",
    "- Title: at most 30 characters (never 31+). Include primary keyword naturally.",
    "- Short description: at most 80 characters (never 81+). One powerful conversion hook; shorten wording if needed to stay ≤80.",
    "- Long description: fewer than 4000 characters in practice — stay at or under 4000. Feature → Benefit structure, bullets/sections where helpful.",
    "- Naturally integrate keywords without stuffing.",
    `- Tone: ${tone}. Professional but approachable. No generic marketing fluff.`,
    targetArabic
      ? "- Arabic: All user-visible strings in your JSON output must be natural, modern Arabic (MSA/Gulf mix suitable for MENA), except proper nouns where appropriate."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * System + user messages for Gemini. Output must be JSON per schema in system.
 */
export function buildListingOptimizerMessages(input: ListingOptimizerInput): {
  system: string;
  user: string;
} {
  const tone = TONE_FOR_PROMPT[input.toneStyle];
  const targetArabic = input.targetArabic ?? false;

  const system = [
    "You are an expert Google Play ASO copywriter and strategist for Android apps on Google Play.",
    "Prioritize install conversion: clear benefits, honest claims, scannable copy — while strictly obeying character limits below (counts every character).",
    "In ONE response (no tool calls), execute this workflow internally: (1) Draft listing copy from the inputs. (2) Self-audit against the primary keywords and Google Play ASO best practices (honest claims, no keyword stuffing, strong hooks, scannable structure). (3) Rewrite weaker sections until the listing is cohesive. (4) Score the final listing with the rubric below and output a single JSON object only.",
    "Return a single JSON object only (no markdown, no code fences, no prose before or after) with exactly these keys:",
    "title: string — Google Play title, at most 30 characters (hard cap 30, never 31+); include primary keyword naturally.",
    "shortDescription: string — at most 80 characters (hard cap 80, never 81+). One sharp hook; shorten aggressively if needed.",
    "longDescription: string — at most 4000 characters (stay ≤4000). Feature → Benefit structure, sections, bullets where helpful; weave keywords naturally, no stuffing. (Synonym: you may instead send fullDescription with the same content; prefer longDescription.)",
    "keywordSuggestions: array of 8-20 concise keyword phrases for ASO.",
    "ctaSuggestions: array of 3-8 short conversion-focused CTAs or button-style lines.",
    "aso_score: integer from 0 to 100 — Certified ASO Score; MUST equal the sum of the four values in score_breakdown (within 1 if rounding).",
    "score_breakdown: object with exactly these numeric keys (each an integer; use these exact spellings): title (0–30 max), shortDescription (0–20 max), longDescription (0–40 max), persuasiveness (0–10 max). The four values MUST sum to aso_score.",
    "improvement_tips: array of 2–8 short, actionable ASO tips specific to this listing (not generic platitudes).",
    "Align with Google Play policies: honest claims, no misleading text.",
    targetArabic
      ? "All user-visible string values in the JSON (title, descriptions, tips, keywordSuggestions, ctaSuggestions) must be natural modern Arabic (MSA/Gulf mix for MENA), except proper nouns where appropriate. Numeric scores stay as numbers."
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const strategy = listingOptimizerStrategyBlock(
    input.appName,
    input.category,
    input.targetKeywords,
    tone,
    targetArabic,
  );

  const refinement =
    typeof input.userInstruction === "string" && input.userInstruction.trim()
      ? [
          "",
          "Additional direction from the product owner (apply on top of the rules above):",
          input.userInstruction.trim(),
        ].join("\n")
      : "";

  const user = [
    strategy,
    "",
    "Using the rules above, produce the JSON object described in the system message (including aso_score, score_breakdown, and improvement_tips).",
    "",
    "REMINDER — hard limits on your JSON strings (count every character): title ≤30, shortDescription ≤80, longDescription ≤4000. Prioritize conversion; shorten shortDescription if needed so it never exceeds 80.",
    "",
    "App features / value props:",
    input.appFeatures,
    refinement,
  ].join("\n");

  return { system, user };
}
