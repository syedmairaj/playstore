import type { ListingOptimizerInput, ToneStyle } from "@/lib/types/listing";

const PROMPT_VERSION = "listing-optimizer-v6";

export function getListingOptimizerPromptVersion(): string {
  return PROMPT_VERSION;
}

// ── Tone psychology — behaviourally differentiated (v6) ───────────────────────
// Each entry is a precise behavioural brief, not just an adjective.
// The model is instructed to apply the psychology throughout ALL fields.
const TONE_BRIEF: Record<ToneStyle, string> = {
  professional:
    "Professional / Data-authoritative: Use precise metrics, clinical language, and factual benefit statements. " +
    "Lead with measurable outcomes (e.g. 'tracks 50+ nutrients'). Avoid hyperbole. Trust is built through specificity.",
  friendly:
    "Friendly / Habit-empathetic: Write in second-person ('you'), use warm inclusive language, and frame features as " +
    "daily habit wins. Celebrate small progress. Avoid intimidating numbers — make the app feel like a supportive companion.",
  bold:
    "Bold / Result-driven: Use imperative verbs, short punchy sentences, and power words (Crush, Master, Dominate, Zero). " +
    "Every sentence must earn its place — cut anything that doesn't push urgency or outcome. High energy throughout.",
  minimal:
    "Minimal / Feature-first: Zero fluff. State each feature once, precisely. No exclamation marks, no filler adjectives. " +
    "Bullet points preferred over prose. If a word can be cut without losing meaning, cut it.",
};

// ── Prompt token-budget constants ─────────────────────────────────────────────
const PROMPT_MAX_KEYWORDS = 25;
const PROMPT_MAX_EXPLOIT_TARGETS = 5;

function truncateKeywords(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const kw of raw) {
    const trimmed = kw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= PROMPT_MAX_KEYWORDS) break;
  }
  return out;
}

function truncateExploitTargets(raw: string[]): string[] {
  return raw
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, PROMPT_MAX_EXPLOIT_TARGETS);
}

// ── Legacy markdown export (used by docs / evals only) ───────────────────────
export const listingOptimizerPrompt = (
  appName: string,
  category: string,
  keywords: string[],
  tone: string = "professional",
  targetArabic: boolean = false,
) => `
You are a Lead ASO Strategist and First-Page Visibility Specialist for Google Play.

App: ${appName}
Category: ${category}
Primary Keywords: ${keywords.join(", ")}
Tone: ${tone}

Rules:
- Title: max 30 characters. Include primary keyword naturally.
- Short description: max 74 characters. One sharp, benefit-driven hook.
- Long description: max 4000 characters. Structure: Hook → Key Features (bullets/emojis) → CTA.
- Keywords: 20 rankable phrases — mix high-volume, long-tail intent, and competitor-gap terms.
- Tone: ${tone}
${targetArabic ? "- Language: Natural modern Arabic (MSA/Gulf mix for MENA)." : ""}
`.trim();

// ── System message (v6) ───────────────────────────────────────────────────────
function buildSystemMessage(targetArabic: boolean): string {
  return [
    // ── Role ────────────────────────────────────────────────────────────────
    "You are a Lead ASO Strategist and First-Page Visibility Specialist for Google Play apps. " +
      "You have 10+ years of experience pushing apps into the top-10 organic results by combining " +
      "keyword intelligence, conversion copywriting, and competitor displacement.",

    // ── Internal workflow ────────────────────────────────────────────────────
    "In ONE response (no tool calls), execute this workflow internally: " +
      "(1) Analyse the app inputs to identify the single strongest USP and the primary user pain point being solved. " +
      "(2) Draft all listing fields guided by the rules below. " +
      "(3) Self-audit: check every character limit, keyword density, tone consistency, and conversion strength. " +
      "(4) Rewrite weak sections until the listing is cohesive and ready to ship. " +
      "(5) Score the final listing with the rubric below. " +
      "(6) Output a single JSON object only — no markdown, no code fences, no prose before or after.",

    // ── Hard character limits ────────────────────────────────────────────────
    "HARD CHARACTER LIMITS — Google Play enforces these at submission. Exceeding them causes rejection:",
    "  title: max 30 characters (count every character including spaces — never 31+).",
    "  shortDescription: max 74 characters (hard cap 74 — NEVER 75+; count every character before writing; " +
      "if your draft exceeds 74, shorten aggressively until it fits).",
    "  fullDescription: max 4000 characters (stay at or under 4000).",

    // ── JSON field contract ──────────────────────────────────────────────────
    "Return a single JSON object with EXACTLY these camelCase keys (no extras, no snake_case):",
    "  title: string — primary keyword + strongest USP hook, ≤30 chars.",
    "  shortDescription: string — one sharp benefit statement, ≤74 chars. Must answer 'why install NOW'.",
    "  fullDescription: string — ≤4000 chars. Structure MUST follow:",
    "    • Hook paragraph (1-2 sentences): address the primary pain point directly.",
    "    • Key Features section: 5-8 bullet points with emojis. Each bullet = one feature + one concrete benefit.",
    "    • Social proof line (if supported by features): e.g. '4.8★ rated by 50,000+ users'.",
    "    • Call to Action: 1-2 sentences. Imperative. Outcome-focused.",
    "  keywordSuggestions: array of exactly 20 keyword phrases for ASO. Format EACH as " +
      "'[category] keyword' where category is one of: [competitive], [intent], or [gap]. " +
      "Include: 8 high-volume competitive keywords marked [competitive], " +
      "7 long-tail intent-based keywords that match what a user with the target pain point would search marked [intent], " +
      "5 competitor-gap keywords (terms users search when unhappy with top competitors) marked [gap]. " +
      "Example: '[competitive] calorie tracker', '[intent] track food without ads', '[gap] myfitnesspal alternative free'.",
    "  ctaSuggestions: array of 4-8 items. The FIRST item must be a 'visibility_rationale' string starting with " +
      "'WHY THIS RANKS: ' — explain in 1-2 sentences exactly why the chosen title keyword + displacement angle " +
      "will push this app toward first-page results for the target audience. " +
      "Remaining items are short conversion-focused CTAs (button-style lines, max 60 chars each).",
    "  asoScore: integer 0-100 — Certified ASO Score. MUST equal the exact sum of scoreBreakdown values.",
    "  scoreBreakdown: object with integer keys: title (0-30), shortDescription (0-20), longDescription (0-40), persuasiveness (0-10). " +
      "Sum MUST equal asoScore.",
    "  improvementTips: array of 2-8 short actionable ASO tips specific to THIS listing (no generic advice).",

    // ── ASO quality rules ────────────────────────────────────────────────────
    "ASO QUALITY RULES:",
    "  • Never keyword-stuff. Keywords must read naturally in copy.",
    "  • Bullets and emojis in fullDescription are required — walls of text kill conversion.",
    "  • Honest claims only — no inflated stats, no misleading superlatives.",
    "  • Do not name competitor apps directly. Displacement must read as natural feature positioning.",
    "  • The shortDescription must work as a standalone install hook visible in search results.",
    "  • Google Play policy: no prohibited content, no misleading category claims.",

    // ── Arabic instruction (conditional) ────────────────────────────────────
    targetArabic
      ? "LANGUAGE: All user-visible string values (title, shortDescription, fullDescription, keywordSuggestions, " +
        "ctaSuggestions, improvementTips) must be natural modern Arabic (MSA/Gulf mix suitable for MENA users). " +
        "Keyword category tags [competitive], [intent], [gap] stay in English as prefixes. Numeric scores stay as numbers."
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

// ── User message (v6) ─────────────────────────────────────────────────────────
function buildUserMessage(
  input: ListingOptimizerInput,
  keywords: string[],
  exploitTargets: string[],
  targetArabic: boolean,
): string {
  const toneBrief = TONE_BRIEF[input.toneStyle];

  const strategyBlock = [
    "── APP BRIEF ──",
    `App Name: ${input.appName}`,
    `Category: ${input.category}`,
    `Target Keywords (your seed list): ${keywords.join(", ")}`,
    "",
    "── TONE PSYCHOLOGY ──",
    `Apply this tone throughout ALL fields (title, descriptions, CTAs, keywords, tips):`,
    toneBrief,
    "",
    "── APP FEATURES & VALUE PROPS ──",
    input.appFeatures,
  ].join("\n");

  const refinement =
    typeof input.userInstruction === "string" && input.userInstruction.trim()
      ? [
          "",
          "── PRODUCT OWNER DIRECTION (apply on top of all rules above) ──",
          input.userInstruction.trim(),
        ].join("\n")
      : "";

  // Competitor displacement block — only injected when there are staged targets
  const displacementBlock =
    exploitTargets.length > 0
      ? [
          "",
          "── STRATEGIC DISPLACEMENT CAMPAIGN ──",
          `The following ${exploitTargets.length} user pain point${exploitTargets.length !== 1 ? "s" : ""} ` +
            `have been identified from competitor and own-app reviews: [${exploitTargets.join(", ")}].`,
          "Apply the Safe-Passage Strategy: your fullDescription MUST open with a hook that directly promises relief " +
            "from these pain points (distraction-free, secure, reliable, ad-light — whichever applies). " +
            "This is the primary USP against competitors who have these weaknesses.",
          "Displacement rules per pain-point type:",
          "  • Stability/crash issues → position as 'zero crashes', 'battle-tested', 'rock-solid performance'.",
          "  • Ad/monetization friction → highlight smooth premium experience, fair pricing, minimal interruptions.",
          "  • Missing features/limited → showcase depth, comprehensive feature set, power-user capabilities.",
          "  • Poor UX/navigation → emphasise intuitive design, fast onboarding, clean interface.",
          "  • General dissatisfaction → craft copy that builds trust through specifics: ratings, user count, guarantee.",
          "  • Any other type → infer strongest displacement angle and apply assertively.",
          "Blend these angles naturally into the copy. Do NOT name competitors directly. " +
            "The displacement must read as genuine feature positioning.",
          "Your [gap] keywords in keywordSuggestions MUST directly reflect these pain points " +
            "(e.g. '[gap] calorie tracker no ads' if ads are a staged pain point).",
        ].join("\n")
      : "";

  const reminderBlock = [
    "",
    "── FINAL CHECKLIST BEFORE OUTPUTTING ──",
    "1. title: ≤30 chars? Includes primary keyword? Tone-consistent?",
    "2. shortDescription: ≤74 chars? (count manually) Single hook? Answers 'why install NOW'?",
    "3. fullDescription: Hook → Features (bullets+emojis) → CTA? ≤4000 chars? Pain point addressed in first 2 sentences?",
    "4. keywordSuggestions: exactly 20 items? 8 [competitive] + 7 [intent] + 5 [gap]? Each prefixed with category tag?",
    "5. ctaSuggestions[0]: starts with 'WHY THIS RANKS: '?",
    "6. asoScore = sum of scoreBreakdown values?",
    "Now output the single JSON object.",
  ].join("\n");

  return [strategyBlock, refinement, displacementBlock, reminderBlock].join("\n");
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Builds system + user messages for the Gemini listing generation call (v6).
 *
 * v6 improvements over v5:
 * - Lead ASO Strategist role with explicit First-Page Visibility framing
 * - Behaviourally differentiated tone psychology (not just adjectives)
 * - keywordSuggestions now requires exactly 20 categorised phrases:
 *     8 [competitive] + 7 [intent] + 5 [gap]
 * - ctaSuggestions[0] is a mandatory visibility_rationale ("WHY THIS RANKS:")
 * - fullDescription structure enforced: Hook → Features → CTA
 * - Safe-Passage Strategy for displacement campaigns (USP against ad-heavy/buggy rivals)
 * - Final checklist in user message to reduce schema failures
 */
export function buildListingOptimizerMessages(input: ListingOptimizerInput): {
  system: string;
  user: string;
} {
  const targetArabic = input.targetArabic ?? false;

  // Token-budget enforcement
  const keywords = truncateKeywords(input.targetKeywords);
  const exploitTargets = truncateExploitTargets(input.exploitTargets ?? []);

  const system = buildSystemMessage(targetArabic);
  const user = buildUserMessage(input, keywords, exploitTargets, targetArabic);

  return { system, user };
}
