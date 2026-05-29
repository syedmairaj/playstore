import type { ListingOptimizerInput, ToneStyle } from "@/lib/types/listing";

const PROMPT_VERSION = "listing-optimizer-v7.1";

export function getListingOptimizerPromptVersion(): string {
  return PROMPT_VERSION;
}

// ── Tone psychology — behaviourally differentiated (v7.1) ────────────────────
// Each entry has THREE parts:
//   COPY: how to write the title, descriptions, CTAs, and improvement tips.
//   BULLETS: how each feature bullet in fullDescription must be structured per tone.
//   KEYWORDS: the vocabulary register for all three keyword categories.
//
// v7.1 additions over v7:
//   - BULLET instruction added per tone — forces rewrite of feature bullets,
//     not just hook/CTA (fixes near-identical bullets across tones).
//   - [gap] keyword framing now tone-specific:
//       professional = clinical/data reliability complaint
//       friendly     = frustrated everyday user's venting search
//       bold         = lost-results / wasted-momentum anger
//       minimal      = specific functional failure description
//   - Arabic instruction now carries full tone + vocabulary differentiation.
const TONE_BRIEF: Record<ToneStyle, string> = {
  professional:
    "Professional / Data-authoritative — " +
    "COPY: Use precise metrics, clinical language, and factual benefit statements. " +
    "Lead with measurable outcomes (e.g. 'tracks 50+ nutrients'). Avoid hyperbole. Trust is built through specificity. " +
    "Every feature bullet MUST lead with the measurable outcome or clinical benefit first, then the feature. " +
    "Example bullet: '📊 Validated nutrient data: 1M+ verified entries ensure clinical-grade accuracy for every meal logged.' " +
    "KEYWORDS: Choose high-authority, data-specific vocabulary. Favour clinical and technical search terms. " +
    "Your [competitive] keywords reflect what a health professional or data-driven user types " +
    "(e.g. 'sodium intake monitor', 'dietary compliance tool', 'clinical nutrition tracker'). " +
    "Your [intent] keywords reflect goal-oriented, outcome-specific queries " +
    "(e.g. 'track daily sodium for blood pressure', 'accurate macro logging app'). " +
    "Your [gap] keywords frame the competitor shortcoming as a clinical or data reliability failure — " +
    "write them as a frustrated professional would search: what does an unreliable app fail to provide? " +
    "(e.g. 'unreliable nutrition data app', 'inaccurate calorie tracker alternative', 'food tracker with verified data'). " +
    "Gap keywords must sound like a clinician or data-driven user's complaint, NOT a generic frustrated user.",

  friendly:
    "Friendly / Habit-empathetic — " +
    "COPY: Write in second-person ('you'), use warm inclusive language, and frame features as daily habit wins. " +
    "Celebrate small progress. Avoid intimidating numbers — make the app feel like a supportive companion. " +
    "Every feature bullet MUST start with 'you' or frame the feature as a personal daily win the user will feel. " +
    "Example bullet: '📅 Your daily log, made easy: just tap what you ate and let Salt Sugar do the rest — no stress, just progress.' " +
    "KEYWORDS: Choose lifestyle, habit-building, and supportive-intent vocabulary. Favour conversational search terms. " +
    "Your [competitive] keywords reflect what a motivation-seeking everyday user types " +
    "(e.g. 'easy salt tracker', 'healthy eating habits app', 'daily wellness tracker'). " +
    "Your [intent] keywords reflect journey-based, emotional, or habit-forming queries " +
    "(e.g. 'how to start eating healthier every day', 'simple app to build better habits'). " +
    "Your [gap] keywords frame the competitor shortcoming as a frustrating everyday experience — " +
    "write them as a discouraged everyday user would vent or search after giving up on a rival app: " +
    "(e.g. 'app keeps crashing fix', 'health app too complicated', 'simple food tracker that actually works'). " +
    "Gap keywords must sound like a real person's frustrated search, NOT a clinical or technical complaint.",

  bold:
    "Bold / Result-driven — " +
    "COPY: Use imperative verbs, short punchy sentences, and power words (Crush, Master, Dominate, Zero). " +
    "Every sentence must earn its place — cut anything that doesn't push urgency or outcome. High energy throughout. " +
    "Every feature bullet MUST open with an action verb and a power word, then the payoff. " +
    "Example bullet: '🎯 Crush your goals: set aggressive sodium and sugar targets and watch your numbers drop — fast.' " +
    "KEYWORDS: Choose action-oriented, outcome-specific vocabulary. Favour transformation and achievement terms. " +
    "Your [competitive] keywords reflect ambitious, result-focused search queries " +
    "(e.g. 'crush your diet goals app', 'master calorie tracking', 'dominate your nutrition'). " +
    "Your [intent] keywords reflect urgency and performance " +
    "(e.g. 'lose weight fast tracking app', 'stop sugar spikes now'). " +
    "Your [gap] keywords name the failure state and lost results competitors leave users in — " +
    "write them as someone who got burned and is now searching for an alternative: " +
    "(e.g. 'food tracker that doesnt crash results', 'stop wasting progress unreliable app', 'nutrition app that actually delivers'). " +
    "Gap keywords must convey lost momentum and a demand for a better outcome.",

  minimal:
    "Minimal / Feature-first — " +
    "COPY: Zero fluff. State each feature once, precisely. No exclamation marks, no filler adjectives. " +
    "If a word can be cut without losing meaning, cut it. " +
    "Every feature bullet MUST be one feature + one stated benefit, nothing more. No enthusiasm, no padding. " +
    "Example bullet: '📊 Intake dashboard: sodium and glucose at a glance, updated on every log.' " +
    "KEYWORDS: Choose precise, function-specific vocabulary with no marketing language. Favour direct feature terms. " +
    "Your [competitive] keywords are exact-match functional queries " +
    "(e.g. 'food log app', 'macro tracker', 'barcode nutrition scanner'). " +
    "Your [intent] keywords describe a specific task a user wants to complete " +
    "(e.g. 'log sodium intake daily', 'scan barcode food nutrition'). " +
    "Your [gap] keywords name a specific functional failure users report in rival apps — " +
    "write them as a task-oriented user describing what broke: " +
    "(e.g. 'food tracker crash fix', 'nutrition app sync error', 'barcode scanner not working app'). " +
    "Gap keywords must be specific and functional, not emotional or vague.",
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
    "    • Hook paragraph (1-2 sentences): address the primary pain point directly. Tone-consistent.",
    "    • Key Features section: 5-8 bullet points with emojis. Each bullet = one feature + one concrete benefit. " +
      "CRITICAL: Every single bullet MUST be written in the active tone register defined in TONE PSYCHOLOGY. " +
      "Do NOT write generic bullets and reuse them across tones. " +
      "Professional bullets lead with the metric or clinical outcome. " +
      "Friendly bullets lead with 'you' and the personal habit win. " +
      "Bold bullets lead with an action verb and a power outcome. " +
      "Minimal bullets state the feature then the benefit, nothing else. " +
      "If all your bullets read the same regardless of tone, you have failed this rule — rewrite them.",
    "    • Social proof line (if supported by features): e.g. '4.8★ rated by 50,000+ users'.",
    "    • Call to Action: 1-2 sentences. Imperative. Outcome-focused. Tone-consistent.",
    "  keywordSuggestions: array of exactly 20 keyword phrases for ASO. Format EACH as " +
      "'[category] keyword' where category is one of: [competitive], [intent], or [gap]. " +
      "Include: 8 high-volume competitive keywords marked [competitive], " +
      "7 long-tail intent-based keywords that match what a user with the target pain point would search marked [intent], " +
      "5 competitor-gap keywords (terms users search when unhappy with top competitors) marked [gap]. " +
      "CRITICAL — Tone-differentiated vocabulary: the TONE PSYCHOLOGY block in the user message defines the exact " +
      "vocabulary register you must use for keywords. Professional tone = clinical/data vocabulary. " +
      "Friendly tone = lifestyle/habit vocabulary. Bold tone = action/outcome vocabulary. Minimal tone = feature-precise vocabulary. " +
      "The keyword list must read as if written by the same person who wrote the copy — never mix registers. " +
      "Example professional: '[competitive] sodium intake monitor', '[intent] clinical nutrition tracker app'. " +
      "Example friendly: '[competitive] easy salt tracker', '[intent] daily healthy habit app'.",
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
        "Keyword category tags [competitive], [intent], [gap] stay in English as prefixes. Numeric scores stay as numbers. " +
        "CRITICAL — tone and vocabulary differentiation applies equally in Arabic: " +
        "Professional Arabic uses formal clinical register (e.g. 'مراقب استهلاك الصوديوم', 'أداة الامتثال الغذائي'). " +
        "Friendly Arabic uses warm conversational register (e.g. 'تتبع الملح بسهولة', 'تطبيق صديق لعاداتك اليومية'). " +
        "Bold Arabic uses imperative action verbs and power words. " +
        "Minimal Arabic is precise and stripped — no filler. " +
        "The same tone differentiation rules for copy, bullets, keywords, and gap framing ALL apply in Arabic exactly as in English. " +
        "Do not produce generic Arabic copy that ignores tone — rewrite every field in the correct Arabic register."
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
    "3. fullDescription: Hook → Features (bullets+emojis) → CTA? ≤4000 chars? Pain point addressed in first 2 sentences? " +
      "Are ALL bullets written in the correct tone register — not generic copy reused from another tone?",
    "4. keywordSuggestions: exactly 20 items? 8 [competitive] + 7 [intent] + 5 [gap]? Each prefixed with category tag? " +
      "Vocabulary matches tone register? [gap] keywords framed correctly for this tone — " +
      "professional=clinical complaint, friendly=frustrated user, bold=lost-results anger, minimal=functional failure?",
    "5. ctaSuggestions[0]: starts with 'WHY THIS RANKS: '?",
    "6. asoScore = sum of scoreBreakdown values?",
    "Now output the single JSON object.",
  ].join("\n");

  return [strategyBlock, refinement, displacementBlock, reminderBlock].join("\n");
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Builds system + user messages for the Gemini listing generation call (v7.1).
 *
 * v7.1 fixes over v7:
 * - BULLET tone enforcement: fullDescription contract now explicitly requires each
 *   feature bullet to be rewritten in the active tone register — not copy-pasted
 *   across tones. Professional=metric-first, Friendly=you+habit, Bold=verb+power,
 *   Minimal=feature+benefit only. Checklist item 3 reinforces this.
 * - [gap] keyword framing is now tone-specific with concrete framing direction:
 *     professional = clinical/data reliability complaint vocabulary
 *     friendly     = frustrated everyday user's venting search vocabulary
 *     bold         = lost-results / wasted-momentum anger vocabulary
 *     minimal      = specific functional failure description vocabulary
 *   Checklist item 4 reinforces gap framing check.
 * - Arabic tone parity: Arabic instruction now carries the full tone + vocabulary
 *   differentiation rules (copy, bullets, keywords, gap framing) in Arabic register.
 *   Arabic Professional uses formal clinical register; Arabic Friendly uses warm
 *   conversational register — same differentiation as English.
 *
 * v7 foundation (unchanged):
 * - TONE_BRIEF: COPY psychology + KEYWORD vocabulary register per tone
 * - keywordSuggestions: exactly 20 categorised phrases (8 [competitive] + 7 [intent] + 5 [gap])
 * - ctaSuggestions[0] = mandatory "WHY THIS RANKS:" visibility rationale
 * - fullDescription structure: Hook → Features (bullets+emojis) → CTA
 * - Safe-Passage displacement strategy for pain-point campaigns
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
