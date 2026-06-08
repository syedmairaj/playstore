import type { ListingOptimizerInput, ToneStyle } from "@/lib/types/listing";

const PROMPT_VERSION = "listing-optimizer-v11.0";

export function getListingOptimizerPromptVersion(): string {
  return PROMPT_VERSION;
}

// ── Tone psychology — behaviourally differentiated (v9) ──────────────────────
// Each entry has FOUR parts:
//   HOOK: the psychological trigger that must drive the opening 80 chars.
//   COPY: how to write titles, descriptions, CTAs, and improvement tips.
//   BULLETS: how each feature bullet in fullDescription must be structured.
//   KEYWORDS: the vocabulary register for all three keyword categories.
//
// v9 additions over v7.1:
//   - HOOK instruction: opening 80 chars must address a specific high-intent
//     user goal (transformation) — not a generic category claim.
//   - Psychological trigger layer: each tone now specifies the primary
//     conversion trigger to embed (authority/data for professional,
//     belonging/progress for friendly, achievement/urgency for bold,
//     precision/control for minimal).
//   - Gap strategy: explicit "what incumbents miss" angle per tone, so
//     the displacement copy sounds like a genuine market insight, not a
//     feature list.
//   - Semantic weaving: keywords are not listed and matched — they are
//     woven into copy as natural language that signals topical authority
//     to Google Play's NLP algorithm.
//   - Clean room rule enforced in user message: only the current session's
//     exploit targets count. Previous sessions never bleed in.
const TONE_BRIEF: Record<ToneStyle, string> = {
  professional:
    "Professional / Data-authoritative — " +

    "HOOK: The first 80 characters of fullDescription must address a high-intent goal the app's target user has " +
    "RIGHT NOW — e.g. achieving a specific measurable outcome, managing a recurring problem with precision, " +
    "or reaching clinical-grade compliance with their goal. This is not a tagline — it is a direct promise of transformation. " +
    "Psychological trigger: AUTHORITY + DATA INTEGRITY. The user must feel they are trusting a precision instrument, not a casual app. " +

    "COPY: Use precise metrics, clinical or professional language, and factual benefit statements. " +
    "Lead with measurable outcomes (e.g. 'tracks X metrics', 'verified against authoritative sources'). " +
    "Avoid hyperbole and empty superlatives. Trust is built through specificity, not adjectives. " +
    "Gap to exploit: most apps in this category are either too complex or too shallow. " +
    "Position this app as precise AND human-designed — professional-grade accuracy with intuitive flow. " +

    "SHORT DESCRIPTION RULE: Front-load the PRIMARY CLINICAL/PROFESSIONAL BENEFIT — the single most important outcome. " +
    "Lead with what the user achieves, not with a qualifier or modifier. " +
    "WRONG: 'Advanced [App Category] for serious users. Monitor your key metrics daily.' (qualifier-first, passive) " +
    "RIGHT: 'Track [primary metric] with precision. Reliable data for every important decision.' (benefit-first, specific) " +
    "The first three words of shortDescription must be the most important thing the user gets — not a preamble. " +
    "SELF-CONTAINMENT RULE (critical): shortDescription must be a 100% complete thought within 80 characters. " +
    "NEVER start a sentence you cannot finish within the character limit. " +
    "Every sentence that opens must close. A trailing word or fragment is a hard failure — count characters before writing, not after. " +
    "WRONG: 'Track [metric] precisely. Eliminate errors. Reliable data for every decision. Own' (last word is fragment) " +
    "RIGHT: 'Track [metric] precisely. Eliminate errors. Reliable data for every decision.' (all sentences complete) " +

    "HUMAN ELEMENT: Include one sentence in the hook paragraph explaining why this app exists for real people " +
    "with real goals — not a feature claim, a human reason " +
    "(e.g. 'Built for people who need their data to be as reliable as a professional instrument'). " +

    "BRIDGE SENTENCE (mandatory): After the hook paragraph and before the bullet list, write one sentence that connects " +
    "the professional problem in the hook to the features that follow. Frame features as the solution to unreliability or complexity. " +
    "The transition must feel authoritative, not generic. " +
    "WRONG: 'Here is what you get:' (generic — no professional authority) " +
    "RIGHT: 'Every feature is built around a single standard: results you can rely on without second-guessing.' " +

    "BULLETS: Every feature bullet MUST lead with the user's professional or quantitative gain, THEN the feature. " +
    "NEVER start a bullet with a keyword phrase, feature name, or app-specific term. " +
    "WRONG: '📊 [Feature Name]: do X with the app.' " +
    "RIGHT: '📊 Eliminate guesswork: [benefit of feature] means every action the user takes reflects accurate data.' " +

    "KEYWORDS: Use the app's actual category and features to choose high-authority vocabulary. " +
    "Treat keywords as Mandatory Semantic Terms to weave naturally into copy — never list them verbatim. " +
    "Your [competitive] keywords reflect what a professional or data-driven user in this category types. " +
    "Your [intent] keywords reflect goal-oriented, outcome-specific queries relevant to the app's purpose. " +
    "Your [gap] keywords frame the competitor shortcoming as a professional or data reliability failure — " +
    "write them as a frustrated professional who discovered inaccurate or unreliable results in a rival app. " +
    "Gap keywords must sound like a professional's complaint, NOT a generic frustrated user.",

  friendly:
    "Friendly / Habit-empathetic — " +

    "HOOK: The first 80 characters of fullDescription must address a specific emotional goal the user has TODAY — " +
    "e.g. wanting to make progress without the stress, building one small habit that sticks, " +
    "or just understanding what they're doing without feeling overwhelmed. This is a warm invitation, not a clinical statement. " +
    "Psychological trigger: BELONGING + PROGRESS. The user must feel the app is their supportive companion — " +
    "it celebrates every small win and never makes them feel judged or overwhelmed. " +

    "COPY: Write in second-person ('you'), use warm inclusive language, and frame every feature as a daily habit win. " +
    "Celebrate incremental progress. Avoid intimidating jargon — make precision feel accessible. " +
    "Gap to exploit: most apps in this category feel like homework — complex, cold, or guilt-inducing. " +
    "Position this app as the one that makes progress feel natural and rewarding, not stressful. " +

    "SHORT DESCRIPTION RULE: Front-load the PRIMARY PERSONAL WIN — the single most motivating outcome the user experiences. " +
    "Lead with their benefit, not a feature name or qualifier. Make the first three words feel like a warm promise. " +
    "WRONG: 'Easy [App Category]. Build better habits with a simple daily log.' (feature-first, cold) " +
    "RIGHT: 'Build better habits daily. Track [primary goal] without the stress or guesswork.' (benefit-first, warm) " +
    "The first three words of shortDescription must make the user feel something positive — not read a spec. " +
    "SELF-CONTAINMENT RULE (critical): shortDescription must be a 100% complete thought within 80 characters. " +
    "NEVER start a sentence you cannot finish within the character limit. " +
    "Every sentence that opens must close. A trailing word or fragment is a hard failure — count characters before writing, not after. " +
    "WRONG: 'Build habits daily. Track [goal] easily. Make progress feel natural. Win' (last word is fragment) " +
    "RIGHT: 'Build habits daily. Track [goal] easily. Make progress feel natural.' (all sentences complete) " +

    "HUMAN ELEMENT: Include one sentence in the hook paragraph explaining why this app exists for everyday people — " +
    "a warm, relatable reason, not a feature claim " +
    "(e.g. 'Made for people who want to make a little progress every day, without turning it into a second job'). " +

    "BRIDGE SENTENCE (mandatory): After the hook paragraph and before the bullet list, write one warm sentence that connects " +
    "the emotional problem in the hook to the features that follow. Frame features as what makes the journey easy and rewarding. " +
    "The transition must feel like a supportive hand on the shoulder, not a product spec intro. " +
    "WRONG: 'Here is what the app includes:' (cold, spec-sheet tone) " +
    "RIGHT: 'Everything here is designed to make your daily progress feel effortless — not like a chore.' " +

    "BULLETS: Every bullet leads with a personal win the user will feel, then the feature behind it. " +
    "NEVER start a bullet with a feature name or keyword phrase — that reads like a spec sheet, not a companion. " +
    "WRONG: '📅 [Feature Name]: do X with the app.' " +
    "RIGHT: '📅 You build your streak effortlessly: [feature] makes [habit] happen in seconds, every single day.' " +

    "KEYWORDS: Use the app's actual category to choose lifestyle, habit-building, supportive-intent vocabulary. " +
    "Treat keywords as Mandatory Semantic Terms to weave naturally into copy — never list them verbatim. " +
    "Your [competitive] keywords reflect what a motivation-seeking everyday user in this category types. " +
    "Your [intent] keywords reflect journey-based, emotional, or habit-forming queries relevant to the app. " +
    "Your [gap] keywords frame the competitor shortcoming as a frustrating everyday experience — " +
    "write them as a real user who gave up on a rival app because it was too complex or kept failing them. " +
    "Gap keywords must sound like a real person's frustrated search, NOT clinical or technical language.",

  bold:
    "Bold / Result-driven — " +

    "HOOK: The first 80 characters of fullDescription must hit like a challenge or a declaration — " +
    "e.g. owning your outcomes, eliminating the guesswork holding progress back, " +
    "or taking decisive action TODAY. High urgency. No hedging. " +
    "Psychological trigger: ACHIEVEMENT + URGENCY. The user must feel that every day without this app " +
    "is a day of wasted potential. The copy is a call to action, not a product description. " +

    "COPY: Use imperative verbs, short punchy sentences, and power words (Crush, Master, Dominate, Zero, Own, Win). " +
    "Every sentence must earn its place — cut anything that doesn't push urgency or outcome. High energy throughout. " +
    "No passive voice. No filler. If it doesn't create momentum, delete it. " +
    "Gap to exploit: most apps in this category are passive log-books. " +
    "Position this app as an active weapon — it doesn't just record; it helps the user take control and see results fast. " +

    "SHORT DESCRIPTION RULE: Front-load the PRIMARY OUTCOME — the single most powerful result the user achieves. " +
    "Lead with the win, not a qualifier or preamble. First three words must hit hard. " +
    "WRONG: 'Eliminate guesswork and get started to finally reach your goals fast.' (buried outcome, slow start) " +
    "RIGHT: 'Crush your [primary goal]. Track [key metric] precisely and see results fast.' (outcome first, high energy) " +
    "The first three words of shortDescription must deliver the punch — not warm up to it. " +
    "SELF-CONTAINMENT RULE (critical): shortDescription must be a 100% complete thought within 80 characters. " +
    "NEVER start a sentence you cannot finish within the character limit. " +
    "Every sentence that opens must close. A trailing word or fragment is a hard failure — count characters before writing, not after. " +
    "WRONG: 'Crush your [goal]. Track [metric] precisely. See rapid results. Own' (last word is fragment — kills impact) " +
    "RIGHT: 'Crush your [goal]. Track [metric] precisely. See rapid results.' (all sentences complete, ends with force) " +

    "HUMAN ELEMENT: Include one sentence in the hook paragraph that frames the app as the weapon the user has been missing — " +
    "a declaration, not a description " +
    "(e.g. 'Built for people who are done with excuses and ready to see real results move'). " +

    "BRIDGE SENTENCE (mandatory): After the hook paragraph and before the bullet list, write one bridge sentence that connects " +
    "the frustration stated in the hook to the feature list that follows. Frame the features as the SOLUTION, " +
    "not just an introduction. The transition must feel earned, not abrupt. " +
    "WRONG: 'Here is what you get:' (generic — kills momentum completely) " +
    "RIGHT: 'We built every feature in this app to replace passive log-books with active, result-driving tools.' " +
    "The bridge sentence must be imperative, outcome-focused, zero filler. " +

    "BULLETS: Every bullet opens with a strong action verb or power word, then delivers the payoff immediately. " +
    "NEVER start a bullet with a keyword phrase or feature label — that kills momentum. " +
    "The outcome must be concrete and measurable, not vague. " +
    "WRONG: '🎯 [Feature Name]: use it to reach your targets.' " +
    "RIGHT: '🎯 Crush your targets: set precise [primary metric] goals and watch the numbers move — every single day.' " +

    "KEYWORDS: Use the app's actual category to choose action-oriented, outcome-specific vocabulary. " +
    "Treat keywords as Mandatory Semantic Terms to weave naturally into copy — never list them verbatim. " +
    "Your [competitive] keywords reflect ambitious, result-focused search queries in this category. " +
    "Your [intent] keywords reflect urgency and performance transformation relevant to the app's purpose. " +
    "Your [gap] keywords name the failure state and lost results competitors leave users in — " +
    "write them as someone who got burned and is searching for an app that actually delivers results. " +
    "Gap keywords must convey lost momentum and a demand for an app that performs.",

  minimal:
    "Minimal / Feature-first — " +

    "HOOK: The first 80 characters of fullDescription must state the single most important functional benefit " +
    "with zero decoration — e.g. what the app does, how precisely, and why that matters in one tight sentence. " +
    "No emotional language. No adjectives that don't carry information. " +
    "Psychological trigger: PRECISION + CONTROL. The user must feel they are choosing the most efficient, " +
    "no-nonsense tool available. Complexity is stripped away. Only signal remains. " +

    "COPY: Zero fluff. State each feature once, precisely. No exclamation marks, no filler adjectives. " +
    "If a word can be removed without losing meaning, remove it. Every sentence is a complete thought. " +
    "Gap to exploit: most apps in this category are over-designed with features users don't need. " +
    "Position this app as the one that does exactly what it says — nothing more, nothing less. Pure function. " +

    "SHORT DESCRIPTION RULE: Front-load the RESOLUTION OF THE PRIMARY PAIN POINT — " +
    "start with the problem the user has RIGHT NOW that this app eliminates, then follow with how. " +
    "Pain-point resolution is a higher-converting hook than a feature statement because it makes the user feel seen immediately. " +
    "Lead with the outcome/resolution, NOT the feature name or a qualifier. " +
    "EMOTIONAL ANCHOR ALLOWANCE: Minimal tone permits exactly ONE benefit-driven emotional anchor word " +
    "(e.g. 'confidently', 'reliably', 'effortlessly') placed at the END of the shortDescription only — " +
    "never at the start, never more than one. This word must express the user's emotional state AFTER achieving the outcome, " +
    "NOT a promise or a qualifier at the beginning. The copy remains stripped and functional — the anchor is the finishing touch. " +
    "WRONG: 'Track [primary metric] precisely. Eliminate guesswork, hit goals confidently.' (feature-first — pain point buried second) " +
    "RIGHT: 'Eliminate guesswork. Track [primary metric] precisely, hit your goals confidently.' (pain-point resolution first, feature second, anchor at end) " +
    "The first three words of shortDescription must resolve the user's primary pain point — not describe a feature. " +
    "SELF-CONTAINMENT RULE (critical): shortDescription must be a 100% complete thought within 80 characters. " +
    "NEVER start a sentence you cannot finish within the character limit. " +
    "Every sentence that opens must close. A trailing word or fragment is a hard failure — count characters before writing, not after. " +
    "WRONG: 'Eliminate guesswork. Track [metric] precisely, hit goals confidently. Own' (last word is fragment) " +
    "RIGHT: 'Eliminate guesswork. Track [metric] precisely, hit goals confidently.' (all sentences complete) " +

    "HUMAN ELEMENT: Include one sentence in the hook paragraph that states simply what the app does and for whom — " +
    "no adjectives, no claims, just a precise statement of purpose " +
    "(e.g. 'Built for people who need accurate [primary metric] data without the noise'). " +

    "BRIDGE SENTENCE (mandatory): After the hook paragraph and before the bullet list, write one minimal sentence that connects " +
    "the functional problem in the hook to the features that follow. No filler — one clean statement of purpose. " +
    "WRONG: 'Here is a list of the app features:' (redundant, adds zero value) " +
    "RIGHT: 'Built to do one thing well: give you accurate data, fast, every time.' " +
    "The bridge sentence must be stripped and precise — if it can be shorter, make it shorter. " +

    "BULLETS: Every bullet is one concrete benefit + the feature that delivers it. Nothing more. " +
    "NEVER start a bullet with a feature name, app term, or keyword phrase. " +
    "Start with the outcome — the thing the user now has — then name what delivers it. " +
    "WRONG: '📊 [Feature Name]: use it to get data.' " +
    "RIGHT: '📊 Accurate data instantly: [feature description] — no manual steps, no errors.' " +

    "KEYWORDS: Use the app's actual category to choose precise, function-specific vocabulary with zero marketing language. " +
    "Treat keywords as Mandatory Semantic Terms to weave naturally into copy — never list them verbatim. " +
    "Your [competitive] keywords are exact-match functional queries for this app's category. " +
    "Your [intent] keywords describe a specific task a user wants to complete in this category, stated plainly. " +
    "Your [gap] keywords name a specific functional failure users report in rival apps — " +
    "write them as a task-oriented user describing what broke and what they need instead. " +
    "Gap keywords must be specific and functional — no emotional or vague language.",
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

// ── System message (v11) ─────────────────────────────────────────────────────
//
// v11 redesign: "World's Leading ASO Strategist" framing with explicit
// SYNTHESIS LOGIC hierarchy (Fix → Capture → Convert → Tone). This
// mirrors the prompt spec the user designed:
//   1. FIX FIRST  — review issues addressed in fullDescription + whatsNew
//   2. CAPTURE DEMAND — market spotlight keywords drive title + shortDescription
//   3. CONVERT BETTER — competitor weaknesses write the competitive displacement
//   4. TONE CONSISTENCY — all fields in one voice
//
// New output fields added: strategySummary (replaces strategicNote naming for
// clarity), ctaSuggestion (single best outcome-driven CTA alongside array).
// All v8/v10 fields retained.
//
function buildSystemMessage(targetArabic: boolean): string {
  return [
    // ── Role ─────────────────────────────────────────────────────────────────
    "You are the world's leading ASO Strategist. " +
      "Your mandate is to generate comprehensive, high-converting app store listings that synthesize " +
      "multiple data streams into a unified, persuasive, search-optimised Play Store presence. " +
      "You combine keyword intelligence, conversion copywriting, competitive displacement strategy, " +
      "and psychological trigger architecture to push apps into the top-10 organic results " +
      "while maximising both CVR and install rate.",

    // ── Clean room rule ──────────────────────────────────────────────────────
    "CLEAN ROOM RULE — CRITICAL: Treat every generation as a fresh brief. " +
      "The ONLY inputs that count are the fields provided in the current request. " +
      "Do NOT reference, infer, or carry forward any prior context, past common issues, crash reports, " +
      "or previous generation content. If a signal is not explicitly listed in this request, do NOT assume it exists. " +
      "When in doubt about any app detail, base copy solely on what is stated in the current brief.",

    // ── Synthesis workflow ───────────────────────────────────────────────────
    "In ONE response (no tool calls), execute this SYNTHESIS WORKFLOW internally: " +
      "(1) BRIEF ANALYSIS: Identify the single strongest USP, the primary user transformation, " +
      "the market gap, all staged review issues, all market spotlight keywords, and all competitor weaknesses. " +
      "(2) SYNTHESIS HIERARCHY — apply in this exact priority order: " +
      "PRIORITY 1 FIX: Address ALL provided review issues directly in fullDescription + whatsNew. Reassure users these specific issues are resolved. " +
      "PRIORITY 2 CAPTURE: Use provided market spotlight keywords as the foundation for title and shortDescription. " +
      "PRIORITY 3 CONVERT: Use competitor weaknesses to position this app as the superior alternative in fullDescription. " +
      "PRIORITY 4 TONE: Apply the requested tone consistently across ALL fields. " +
      "(3) SEMANTIC MAPPING: Map all keywords to natural language INTENT — never insert keyword strings verbatim if awkward. " +
      "(4) DRAFT all fields with hierarchy active. " +
      "(5) SELF-AUDIT: Every sentence aloud. Fix anything robotic, stuffed, or generic. " +
      "Check character limits, synthesis coverage, tone purity. " +
      "(6) OUTPUT: A single JSON object only — no markdown, no code fences, no prose.",

    // ── Hard character limits ────────────────────────────────────────────────
    "HARD CHARACTER LIMITS — Google Play enforces these at submission:",
    "  title: max 30 characters. WORD-BOUNDARY RULE: must end on a complete word. Count carefully. " +
      "WRONG: 'AppName: Track Glucose & So' (truncates 'Sodium'). RIGHT: complete word, ≤30 chars.",
    "  shortDescription: max 80 characters. LENGTH SAFETY BUFFER: aim for 70 chars max. " +
      "SELF-CONTAINMENT RULE: every sentence that opens MUST close within 80 chars — no trailing fragments. " +
      "WRONG: last word dangling. RIGHT: all sentences complete within limit.",
    "  fullDescription: max 4000 characters.",
    "  whatsNew: max 500 characters.",
    "  screenshotCaptions: each caption max 80 characters.",

    // ── JSON field contract ──────────────────────────────────────────────────
    "Return a single JSON object with EXACTLY these camelCase keys:",

    "  title: string ≤30 chars. " +
      "SYNTHESIS: If market spotlight keywords are present, the title MUST include the most relevant one. " +
      "Format: primary market keyword + transformation hook. Signals relevance (search) AND outcome (conversion). " +
      "Tone-consistent. Complete-word boundary.",

    "  shortDescription: string ≤80 chars (target 70). " +
      "SYNTHESIS: Lead with the market spotlight keyword intent if present — this is CAPTURE DEMAND. " +
      "Standalone install hook answering 'why install NOW'. Benefit-first. Every sentence complete.",

    "  fullDescription: string ≤4000 chars. Structure EXACTLY: " +
      "(A) HOOK PARAGRAPH — 2-3 sentences. " +
      "SYNTHESIS PRIORITY 1 (FIX): If review issues are present, the first sentence MUST open with a direct promise that the primary review issue is resolved/addressed. " +
      "SYNTHESIS PRIORITY 3 (CONVERT): If competitor weaknesses are present, the hook must frame this app as the definitive solution to those rival failures. " +
      "Include one human-reason sentence ('Built for people who…'). " +
      "(B) BRIDGE SENTENCE — tone-consistent connection from hook problem to features. Never generic. " +
      "(C) BULLET LIST — 5-8 bullets with emojis. BENEFIT FIRST: user outcome leads, feature name follows. " +
      "SYNTHESIS PRIORITY 2 (CAPTURE): Feature bullets may naturally reference market spotlight keyword intent. " +
      "SYNTHESIS PRIORITY 3 (CONVERT): One bullet MUST position against the primary competitor weakness — without naming rivals. " +
      "ALL bullets in active tone register. " +
      "(D) SOCIAL PROOF — one line if supported by real features (never invent stats). " +
      "(E) CTA — 1-2 sentences. Imperative. Tone-consistent. High-momentum close.",

    "  keywordSuggestions: array of exactly 20 keyword phrases. Format EACH as '[category] keyword phrase'. " +
      "Categories: [competitive] (8 items — what market leaders rank for), " +
      "[intent] (7 items — goal-oriented queries your user types), " +
      "[gap] (5 items — SYNTHESIS: if competitor weaknesses present, gap keywords must directly reflect them; " +
      "otherwise frame competitor shortcomings as frustrated search queries). " +
      "Vocabulary register matches tone. Keywords are for Play Console backend — not for verbatim insertion in prose.",

    "  ctaSuggestions: array of 4-8 items. " +
      "First item MUST start with 'WHY THIS RANKS: ' — 1-2 sentences on the specific keyword + displacement angle for page 1. " +
      "Remaining items: conversion-focused CTAs, max 60 chars each, tone-consistent.",

    "  ctaSuggestion: string ≤120 chars. " +
      "The SINGLE strongest outcome-driven CTA for this listing. " +
      "This is the hero install CTA — one punchy line that makes the user tap Install immediately. " +
      "Must reference the primary transformation this app delivers. Tone-consistent. " +
      "WRONG: 'Download the app today.' (generic — no transformation). " +
      "RIGHT: 'Start [primary transformation] — install free today.' (outcome + action + urgency).",

    "  asoScore: integer 0-100. MUST equal exact sum of scoreBreakdown values.",
    "  scoreBreakdown: object — title (0-30), shortDescription (0-20), longDescription (0-40), persuasiveness (0-10). Sum = asoScore.",
    "  improvementTips: array of 2-8 tips. Specific to THIS listing. " +
      "Last tip MUST be 'Rationale for Ranking' — why this copy beats market leaders for primary keyword.",

    // ── v11 synthesis summary ────────────────────────────────────────────────
    "  strategySummary: string ≤400 chars. ONE sentence. " +
      "Explains HOW you synthesized all the available signals: what review issues were fixed, " +
      "which market keywords were woven in, how competitor weaknesses were positioned against. " +
      "This is shown to the user as their 'Strategy Summary' — make it specific, consultant-grade, and human-readable. " +
      "Format: 'Fixed [X] from user reviews + captured demand for [Y] market keywords in title/short + " +
      "positioned against [Z] competitor weakness + applied [tone] tone throughout.' " +
      "Skip any clause where that signal type was not present. " +
      "WRONG: 'Optimized the listing using available signals.' " +
      "RIGHT: 'Fixed crash on launch from reviews, captured demand for \"AI coach\" and \"community\" keywords in title, " +
      "positioned against competitors missing social features, applied bold tone throughout.' " +
      "If targetArabic: write in natural Arabic.",

    // ── v8 fields (unchanged) ────────────────────────────────────────────────
    "  whatsNew: string ≤500 chars. Play Store 'What's New' release notes. " +
      "SYNTHESIS PRIORITY 1 (FIX): If review issues are present, MUST open with the primary fix/resolution. " +
      "State 2-3 improvements as tight benefit-first statements specific to THIS app's features. " +
      "Close with install nudge matching tone. Weave 1-2 primary keywords naturally. " +
      "If targetArabic: write entirely in natural Arabic, tone-consistent.",

    "  screenshotCaptions: array of exactly 5 strings, each ≤80 chars. " +
      "Visual-first, conversion-priority overlay headlines for Play Store screenshots. " +
      "CRITICAL: Every caption derived from THIS app's actual features — never generic. " +
      "Regardless of tone, ALL captions use bold-energy, outcome-driven language. " +
      "SYNTHESIS: Caption 1 should reflect the primary market spotlight keyword if present. " +
      "Conversion order: (1) Strongest hook / primary transformation. " +
      "(2) Most-used feature benefit. (3) Credibility / social proof. " +
      "(4) Competitor differentiator — what rivals can't match. " +
      "(5) CTA / install nudge. " +
      "If targetArabic: all 5 captions in natural Arabic — short, punchy, high-impact.",

    "  abTestVariant: object — titleB (string ≤30 chars) + hypothesis (string ≤300 chars). " +
      "titleB MUST be derived from THIS app's APP BRIEF. Must contain a high-search-volume term users type. " +
      "Tests a DIFFERENT angle from titleA (if titleA = keyword+benefit, titleB = keyword+action or keyword+audience). " +
      "WORD-BOUNDARY RULE: titleB ends on complete word. " +
      "hypothesis: references this app's specific category + user segment, explains angle difference, " +
      "metric to watch (CVR), minimum 2-week test duration. For non-technical app owners. " +
      "If targetArabic: both fields in natural Arabic, titleB keyword-rich.",

    // ── ASO quality standards ────────────────────────────────────────────────
    "ASO QUALITY STANDARDS — the difference between a 7/10 and a 10/10 listing:",
    "  • NO KEYWORD STUFFING — express keyword INTENT naturally. Semantic > exact-match. Never awkward phrases.",
    "  • BENEFIT-FIRST BULLETS — user gain leads every bullet. No feature name or keyword phrase as opener.",
    "  • SYNTHESIS COHERENCE — the listing reads as a unified campaign, not separate parts. " +
      "A user reading the title, then short description, then full description must feel a consistent story unfold.",
    "  • HUMAN ORIGIN STORY — at least one sentence explaining why this app exists for real people.",
    "  • HOOK STRENGTH — first 80 chars make the target user feel seen. Not generic.",
    "  • TONE PURITY — one voice, one register, zero drift.",
    "  • CONVERSION FLOW — Hook → Bridge → Bullets → Proof → CTA builds momentum.",
    "  • No hyperbole without evidence. No prohibited content. No misleading claims.",
    "  • Bullets and emojis required — walls of text kill conversion.",

    // ── Arabic instruction (conditional) ────────────────────────────────────
    targetArabic
      ? "LANGUAGE: All user-visible string values must be natural modern Arabic (MSA/Gulf mix for MENA users). " +
        "Keyword category tags [competitive], [intent], [gap] stay in English as prefixes. Numeric scores stay as numbers. " +
        "The Clean Room Rule, Synthesis Hierarchy, tone differentiation, psychological triggers, semantic weaving, " +
        "and gap strategy ALL apply in Arabic exactly as in English — same standards, different language. " +
        "Professional Arabic uses formal clinical register. " +
        "Friendly Arabic uses warm conversational register. " +
        "Bold Arabic uses imperative action verbs and power words. " +
        "Minimal Arabic is stripped and precise — no filler. " +
        "ALL STRUCTURAL RULES apply in Arabic: benefit-first bullets, bridge sentence, human element, " +
        "short description self-containment. Do not produce generic Arabic copy."
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

// ── User message (v11) ─────────────────────────────────────────────────────
//
// v11 redesign over v10:
//   - New framing: "ACTIVE OPTIMIZATION INPUTS" with three distinct signal types
//     presented as the user sees them in the UI (review issues, market keywords,
//     competitor weaknesses), matching the "Data-Aggregating Canvas" product concept.
//   - Synthesis Logic section mirrors the exact hierarchy: Fix → Capture → Convert → Tone.
//   - New ctaSuggestion field (singular) — the single hero install CTA.
//   - strategySummary replaces strategicNote — richer consultant-grade one-liner.
//   - Competitor weaknesses (CONVERT BETTER block) now explicitly addressed.

function buildUserMessage(
  input: ListingOptimizerInput,
  keywords: string[],
  exploitTargets: string[],
  targetArabic: boolean,
): string {
  const toneBrief = TONE_BRIEF[input.toneStyle];

  // ── Classify signals from exploitTargets ─────────────────────────────────
  // market_spotlight: prefix → market demand keywords (CAPTURE DEMAND)
  // All others → review issues / backlog pain points (FIX FIRST)
  const spotlightKeywords = exploitTargets
    .filter((t) => t.startsWith("market_spotlight:"))
    .map((t) => t.replace(/^market_spotlight:/, "").trim())
    .filter(Boolean);

  const reviewIssues = exploitTargets
    .filter((t) => !t.startsWith("market_spotlight:"))
    .filter(Boolean);

  // Competitor weaknesses come from userInstruction (injected by the Exploit bridge)
  // They are extracted from the instruction text — no separate field needed here
  // since they already arrive as the inversionDirective prepended to userInstruction.

  // ── Core identity block ──────────────────────────────────────────────────
  const identityBlock = [
    "═══════════════════════════════════════════",
    "APP IDENTITY",
    "═══════════════════════════════════════════",
    `App Name: ${input.appName}`,
    `Category: ${input.category}`,
    `Seed Keywords (Mandatory Semantic Terms — weave naturally into copy, never list verbatim): ${keywords.join(", ")}`,
    "",
    "═══════════════════════════════════════════",
    "TONE / STYLE",
    "═══════════════════════════════════════════",
    "Apply this tone register across ALL fields (title, shortDescription, fullDescription, CTAs, keywords, captions, whatsNew, strategySummary).",
    toneBrief,
    "",
    "═══════════════════════════════════════════",
    "APP FEATURES & VALUE PROPS",
    "═══════════════════════════════════════════",
    "Write honest copy based ONLY on these features. Do not invent stats or claims not described here.",
    input.appFeatures,
  ].join("\n");

  // ── Active Optimization Inputs section ──────────────────────────────────
  // Only rendered when at least one signal type is present.
  const hasAnySignals = reviewIssues.length > 0 || spotlightKeywords.length > 0;

  const optimizationInputsBlock = hasAnySignals
    ? [
        "",
        "═══════════════════════════════════════════",
        "ACTIVE OPTIMIZATION INPUTS (Integrate ALL of these into the listing)",
        "═══════════════════════════════════════════",

        // Signal 1: Review Issues
        reviewIssues.length > 0
          ? [
              "",
              "1. REVIEW ISSUES (Critical Fixes — Highest Priority):",
              "   CLEAN ROOM: These are the ONLY review issues to address. Do NOT infer others.",
              `   Active issues: [${reviewIssues.join(", ")}]`,
              "   • These are UX/trust signals — do NOT insert as keywords.",
              "   • Map each issue type to the correct displacement language:",
              "     Stability/crash → 'zero crashes', 'rock-solid', 'battle-tested reliability'",
              "     Inaccurate data → 'verified', 'trusted', 'validated' (never claim 'perfect')",
              "     Ad friction → smooth experience, fair pricing, zero interruptions",
              "     Missing features → depth, comprehensive, power-user capabilities",
              "     Poor UX → intuitive design, fast onboarding, clean interface",
              "     Other → infer strongest displacement angle assertively",
              "   • Do NOT name competitors. Displacement must read as genuine positioning.",
            ].join("\n")
          : null,

        // Signal 2: Market Opportunities
        spotlightKeywords.length > 0
          ? [
              "",
              "2. MARKET OPPORTUNITIES (Trending Keywords — from real-time top-10 chart analysis):",
              `   Trending keywords: [${spotlightKeywords.join(", ")}]`,
              "   • Use as the primary foundation for title and shortDescription.",
              "   • Weave semantically into fullDescription — never as a keyword list.",
              "   • Exploit the category gap these keywords reveal: position this app as what the top 10 don't offer.",
              "   • Max one spotlight keyword per sentence. Never force-fit irrelevant terms.",
            ].join("\n")
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  // ── Synthesis Logic block ─────────────────────────────────────────────────
  // Always present — defines the hierarchy the model must follow.
  const synthesisBlock = [
    "",
    "═══════════════════════════════════════════",
    "SYNTHESIS LOGIC (Hierarchy of Operations — follow in this exact order)",
    "═══════════════════════════════════════════",
    reviewIssues.length > 0
      ? `1. FIX FIRST: Address [${reviewIssues.join(", ")}] directly in fullDescription (hook must open with resolution promise) AND whatsNew (must be first thing the user reads). Reassure users these specific issues are resolved.`
      : "1. FIX FIRST: No review issues staged this session — skip this step.",
    spotlightKeywords.length > 0
      ? `2. CAPTURE DEMAND: Use [${spotlightKeywords.join(", ")}] as the foundation for title and shortDescription to maximize search visibility.`
      : "2. CAPTURE DEMAND: No market spotlight keywords staged — use seed keywords to maximise search visibility.",
    typeof input.userInstruction === "string" && input.userInstruction.trim().startsWith("Tracked competitor analysis")
      ? "3. CONVERT BETTER: Competitor weaknesses are described in PRODUCT OWNER DIRECTION below. Write the fullDescription to position this app as the superior alternative to those rival failures."
      : "3. CONVERT BETTER: No competitor weaknesses staged — focus on app's own differentiation in fullDescription.",
    "4. TONE CONSISTENCY: The entire output must strictly follow the requested TONE / STYLE above. No drift across any field.",
  ].join("\n");

  // ── Product owner direction (competitor inversion + user refinements) ─────
  const refinement =
    typeof input.userInstruction === "string" && input.userInstruction.trim()
      ? [
          "",
          "═══════════════════════════════════════════",
          "PRODUCT OWNER DIRECTION (overrides defaults where conflicting)",
          "═══════════════════════════════════════════",
          input.userInstruction.trim(),
        ].join("\n")
      : "";

  // ── Final quality checklist ──────────────────────────────────────────────
  const reminderBlock = [
    "",
    "═══════════════════════════════════════════",
    "FINAL QUALITY CHECKLIST (10/10 STANDARD)",
    "═══════════════════════════════════════════",
    "1. title: ≤30 chars? WORD BOUNDARY CHECK — last character is NOT mid-word? " +
      "SYNTHESIS CHECK — market spotlight keyword present if supplied?",
    "2. shortDescription: ≤80 chars (target 70)? SELF-CONTAINED — every sentence closes within limit? " +
      "Benefit/outcome leads — no qualifier first? SYNTHESIS CHECK — spotlight keyword intent leads if supplied?",
    "3. fullDescription: Hook → Bridge → Bullets → Proof → CTA structure present? " +
      "SYNTHESIS CHECK — review issue resolved in hook if supplied? Competitor weakness addressed in bullets? " +
      "Bridge sentence tone-consistent (NOT 'Here is what you get:')? " +
      "Human element present ('Built for people who…')?",
    "4. ANTI-STUFFING: Every sentence reads as natural human language? " +
      "No awkward keyword phrases verbatim in prose?",
    "5. Bullets: every bullet leads with USER'S BENEFIT (not feature name or keyword)? " +
      "All bullets unmistakably in correct tone register?",
    "6. keywordSuggestions: exactly 20 items? 8 [competitive] + 7 [intent] + 5 [gap]? " +
      "SYNTHESIS CHECK — [gap] keywords reflect staged review issues if present?",
    "7. ctaSuggestions[0]: starts with 'WHY THIS RANKS: '?",
    "8. ctaSuggestion: ≤120 chars? Single strongest hero CTA? References primary transformation?",
    "9. asoScore = exact sum of scoreBreakdown values?",
    "10. improvementTips: last tip is 'Rationale for Ranking'?",
    "11. whatsNew: ≤500 chars? SYNTHESIS CHECK — opens with review issue fix if supplied? " +
      "Specific to THIS app — not generic? Tone-consistent? Arabic if targetArabic?",
    "12. screenshotCaptions: exactly 5 items? ≤80 chars each? All outcome-driven, bold-impact? " +
      "SYNTHESIS CHECK — caption 1 reflects spotlight keyword if supplied? " +
      "Derived from THIS app's features — not generic? Arabic if targetArabic?",
    "13. abTestVariant: titleB ≤30 chars? WORD BOUNDARY CHECK? " +
      "Keyword-rich with real search term? Different angle from titleA? " +
      "Hypothesis references THIS app's category + user segment? Arabic if targetArabic?",
    "14. strategySummary: ≤400 chars? One sentence? Consultant-grade, specific, human-readable? " +
      "Covers all signal types present (review fix / market keywords / competitor / tone)?",
    "If ANY item fails — rewrite the affected field. Then output the single JSON object.",
  ].join("\n");

  return [identityBlock, optimizationInputsBlock, synthesisBlock, refinement, reminderBlock].join("\n");
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Builds system + user messages for the Gemini listing generation call (v11).
 *
 * v11 redesign over v10:
 * - "World's Leading ASO Strategist" system role with explicit SYNTHESIS WORKFLOW.
 * - User message uses "ACTIVE OPTIMIZATION INPUTS" framing matching the UI canvas:
 *     Signal 1: Review Issues (FIX FIRST — opens hook + whatsNew)
 *     Signal 2: Market Opportunities — trending keywords (CAPTURE DEMAND — title + short)
 *     Signal 3: Competitor Weaknesses — via userInstruction (CONVERT BETTER — fullDescription)
 * - SYNTHESIS LOGIC hierarchy block in user message (Fix → Capture → Convert → Tone).
 * - New output field: ctaSuggestion (single hero CTA, ≤120 chars).
 * - strategySummary replaces strategicNote — fuller consultant-grade synthesis note.
 * - All v8 fields retained: whatsNew, screenshotCaptions (5), abTestVariant.
 * - All v10 quality standards, clean room rule, anti-stuffing, tone psychology retained.
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
