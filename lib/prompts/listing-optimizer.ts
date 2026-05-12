import type { ListingOptimizerInput, ToneStyle } from "@/lib/types/listing";

const PROMPT_VERSION = "listing-optimizer-v2";

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
- Title: Max 30 characters, include primary keyword naturally.
- Short Description: Max 80 characters — powerful hook.
- Long Description: Max 4000 characters. Use clear Feature → Benefit structure with bullet points and sections.
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
    "Rules:",
    "- Title: Max 30 characters, include primary keyword naturally.",
    "- Short Description: Max 80 characters — powerful hook.",
    "- Long Description: Max 4000 characters. Use clear Feature → Benefit structure with bullet points and sections.",
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
    "Return a single JSON object only (no markdown, no code fences, no prose before or after) with exactly these keys:",
    "title: string — optimized Google Play title (max 30 characters; include primary keyword naturally).",
    "shortDescription: string — max 80 characters (Google Play hard limit); powerful hook.",
    "fullDescription: string — max 4000 characters; Feature → Benefit structure, sections, bullets where helpful; weave keywords naturally, no stuffing.",
    "keywordSuggestions: array of 8-20 concise keyword phrases for ASO.",
    "ctaSuggestions: array of 3-8 short conversion-focused CTAs or button-style lines.",
    "Align with Google Play policies: honest claims, no misleading text.",
    targetArabic
      ? "All string values in the JSON must be natural modern Arabic (MSA/Gulf mix for MENA), except proper nouns where appropriate."
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

  const user = [
    strategy,
    "",
    "Using the rules above, produce the JSON object described in the system message.",
    "",
    "App features / value props:",
    input.appFeatures,
  ].join("\n");

  return { system, user };
}
