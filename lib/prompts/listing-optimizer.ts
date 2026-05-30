import type { ListingOptimizerInput, ToneStyle } from "@/lib/types/listing";

const PROMPT_VERSION = "listing-optimizer-v9.3";

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

    "HOOK: The first 80 characters of fullDescription must address a high-intent goal a health professional or " +
    "data-driven user has RIGHT NOW — e.g. managing chronic sodium intake, monitoring glucose post-meal, " +
    "or achieving clinical-grade dietary compliance. This is not a tagline — it is a direct promise of transformation. " +
    "Psychological trigger: AUTHORITY + DATA INTEGRITY. The user must feel they are trusting a precision instrument, not a casual app. " +

    "COPY: Use precise metrics, clinical language, and factual benefit statements. " +
    "Lead with measurable outcomes (e.g. 'tracks 50+ nutrients', 'verified against clinical databases'). " +
    "Avoid hyperbole and empty superlatives. Trust is built through specificity, not adjectives. " +
    "Gap to exploit against incumbents: most nutrition trackers are either too complex (medical-software UX) or " +
    "too shallow (consumer-grade data). Position this app as precise AND human-designed — clinical accuracy with intuitive flow. " +

    "SHORT DESCRIPTION RULE: Front-load the PRIMARY CLINICAL BENEFIT — the single most important outcome the user gains. " +
    "Lead with what they achieve, not with a qualifier or secondary modifier. " +
    "WRONG: 'Accurate nutrition tracking for health-focused users. Monitor sodium, sugar daily.' (qualifier-first, passive) " +
    "RIGHT: 'Track sodium & sugar with clinical accuracy. Reliable data for every health decision.' (benefit-first, specific) " +
    "The first three words of shortDescription must be the most important thing the user gets — not a preamble. " +

    "HUMAN ELEMENT: Include one sentence in the hook paragraph explaining why this app exists for real patients and " +
    "health-conscious individuals — not a feature claim, a human reason " +
    "(e.g. 'Built for people who need their tracking data to be as reliable as their lab results'). " +

    "BRIDGE SENTENCE (mandatory): After the hook paragraph and before the bullet list, write one sentence that connects " +
    "the clinical problem stated in the hook to the features that follow. Frame features as the solution to data unreliability. " +
    "The transition must feel authoritative, not generic. " +
    "WRONG: 'Here is what you get:' (generic — no clinical authority) " +
    "RIGHT: 'Every feature is built around a single standard: data you can present to a clinician without hesitation.' " +

    "BULLETS: Every feature bullet MUST lead with the user's clinical or quantitative gain, THEN the feature. " +
    "NEVER start a bullet with a keyword phrase, feature name, or app-specific term. " +
    "WRONG: '📊 Food database scanner: search 2M entries for nutrition data.' " +
    "RIGHT: '📊 Eliminate data guesswork: verified entries across 2M+ foods mean every logged meal reflects reality.' " +

    "KEYWORDS: Choose high-authority, data-specific vocabulary. Treat keywords as Mandatory Semantic Terms to weave " +
    "naturally into copy — never list them verbatim. " +
    "Your [competitive] keywords reflect what a health professional or data-driven user types " +
    "(e.g. 'sodium intake monitor', 'dietary compliance tool', 'clinical nutrition tracker'). " +
    "Your [intent] keywords reflect goal-oriented, outcome-specific queries " +
    "(e.g. 'track daily sodium for blood pressure', 'accurate macro logging app'). " +
    "Your [gap] keywords frame the competitor shortcoming as a clinical or data reliability failure — " +
    "write them as a frustrated professional would search after discovering inaccurate data: " +
    "(e.g. 'unreliable nutrition data app', 'inaccurate calorie tracker alternative', 'food tracker with verified data'). " +
    "Gap keywords must sound like a clinician's complaint about data quality, NOT a generic frustrated user.",

  friendly:
    "Friendly / Habit-empathetic — " +

    "HOOK: The first 80 characters of fullDescription must address a specific emotional goal the user has TODAY — " +
    "e.g. wanting to eat a little better without the stress, building one small healthy habit that sticks, " +
    "or just understanding what they're putting in their body. This is a warm invitation, not a clinical statement. " +
    "Psychological trigger: BELONGING + PROGRESS. The user must feel the app is their supportive companion — " +
    "it celebrates every small win and never makes them feel judged or overwhelmed. " +

    "COPY: Write in second-person ('you'), use warm inclusive language, and frame every feature as a daily habit win. " +
    "Celebrate incremental progress. Avoid intimidating numbers or clinical terminology — make precision feel accessible. " +
    "Gap to exploit against incumbents: most health trackers feel like homework — complex, cold, or guilt-inducing. " +
    "Position this app as the one that makes healthy habits feel natural and rewarding, not stressful. " +

    "SHORT DESCRIPTION RULE: Front-load the PRIMARY PERSONAL WIN — the single most motivating outcome the user experiences. " +
    "Lead with their benefit, not a feature name or qualifier. Make the first three words feel like a warm promise. " +
    "WRONG: 'Easy health tracking. Build better habits with a simple salt & sugar log.' (feature-first, cold) " +
    "RIGHT: 'Build healthier habits daily. Track salt & sugar without the stress or guesswork.' (benefit-first, warm) " +
    "The first three words of shortDescription must make the user feel something positive — not read a spec. " +

    "HUMAN ELEMENT: Include one sentence in the hook paragraph explaining why this app exists for everyday people — " +
    "a warm, relatable reason, not a feature claim " +
    "(e.g. 'Made for people who want to eat a little better every day, without turning nutrition into a second job'). " +

    "BRIDGE SENTENCE (mandatory): After the hook paragraph and before the bullet list, write one warm sentence that connects " +
    "the emotional problem in the hook to the features that follow. Frame features as what makes the journey easy and rewarding. " +
    "The transition must feel like a supportive hand on the shoulder, not a product spec intro. " +
    "WRONG: 'Here is what the app includes:' (cold, spec-sheet tone) " +
    "RIGHT: 'Everything here is designed to make your healthy habits feel effortless — not like a chore.' " +

    "BULLETS: Every bullet leads with a personal win the user will feel, then the feature behind it. " +
    "NEVER start a bullet with a feature name or keyword phrase — that reads like a spec sheet, not a companion. " +
    "WRONG: '📅 Daily food log: record what you ate each day.' " +
    "RIGHT: '📅 You build your streak effortlessly: log a meal in seconds and watch your healthy habits compound day by day.' " +

    "KEYWORDS: Choose lifestyle, habit-building, and supportive-intent vocabulary. Treat keywords as Mandatory Semantic Terms " +
    "to weave naturally into copy — never list them verbatim. " +
    "Your [competitive] keywords reflect what a motivation-seeking everyday user types " +
    "(e.g. 'easy salt tracker', 'healthy eating habits app', 'daily wellness tracker'). " +
    "Your [intent] keywords reflect journey-based, emotional, or habit-forming queries " +
    "(e.g. 'how to start eating healthier every day', 'simple app to build better habits'). " +
    "Your [gap] keywords frame the competitor shortcoming as a frustrating everyday experience — " +
    "write them as a discouraged real user who gave up on a rival app and is searching for something simpler: " +
    "(e.g. 'app keeps crashing fix', 'health app too complicated', 'simple food tracker that actually works'). " +
    "Gap keywords must sound like a real person's frustrated search, NOT clinical or technical language.",

  bold:
    "Bold / Result-driven — " +

    "HOOK: The first 80 characters of fullDescription must hit like a challenge or a declaration — " +
    "e.g. owning your health outcomes, eliminating the guesswork that's been holding progress back, " +
    "or taking decisive action on nutrition TODAY. High urgency. No hedging. " +
    "Psychological trigger: ACHIEVEMENT + URGENCY. The user must feel that every day without this app " +
    "is a day of wasted potential. The copy is a call to action, not a product description. " +

    "COPY: Use imperative verbs, short punchy sentences, and power words (Crush, Master, Dominate, Zero, Own, Win). " +
    "Every sentence must earn its place — cut anything that doesn't push urgency or outcome. High energy throughout. " +
    "No passive voice. No filler. If it doesn't create momentum, delete it. " +
    "Gap to exploit against incumbents: most trackers are passive log-books. " +
    "Position this app as an active weapon — it doesn't just record; it helps the user take control and see results fast. " +

    "SHORT DESCRIPTION RULE: Front-load the PRIMARY OUTCOME — the single most powerful result the user achieves. " +
    "Lead with the win, not a qualifier or preamble. First three words must hit hard. " +
    "WRONG: 'Eliminate guesswork and track nutrition to crush your diet goals fast.' (buried outcome, slow start) " +
    "RIGHT: 'Crush your diet goals. Track salt & sugar precisely and see results fast.' (outcome first, high energy) " +
    "The first three words of shortDescription must deliver the punch — not warm up to it. " +

    "HUMAN ELEMENT: Include one sentence in the hook paragraph that frames the app as the weapon the user has been missing — " +
    "a declaration, not a description " +
    "(e.g. 'Built for people who are done guessing and ready to see real numbers move'). " +

    "BRIDGE SENTENCE (mandatory): After the hook paragraph and before the bullet list, write one bridge sentence that connects " +
    "the frustration stated in the hook to the feature list that follows. This sentence must frame the features as the SOLUTION, " +
    "not just introduce them. The transition must feel earned, not abrupt. " +
    "WRONG: 'Here is what you get:' (generic — kills momentum completely) " +
    "RIGHT: 'We built every feature in this app to replace passive log-books with active, result-driving tools.' " +
    "The bridge sentence must be imperative, outcome-focused, zero filler. " +

    "BULLETS: Every bullet opens with a strong action verb or power word, then delivers the payoff immediately. " +
    "NEVER start a bullet with a keyword phrase or feature label — that kills momentum. " +
    "The outcome must be concrete and measurable, not vague. " +
    "WRONG: '🎯 Goal tracker app: set sodium and sugar targets.' " +
    "RIGHT: '🎯 Crush your targets: set precise sodium and sugar goals and watch the numbers move — every single day.' " +

    "KEYWORDS: Choose action-oriented, outcome-specific vocabulary. Treat keywords as Mandatory Semantic Terms to weave " +
    "naturally into copy — never list them verbatim. " +
    "Your [competitive] keywords reflect ambitious, result-focused search queries " +
    "(e.g. 'crush your diet goals app', 'master calorie tracking', 'dominate your nutrition'). " +
    "Your [intent] keywords reflect urgency and performance transformation " +
    "(e.g. 'lose weight fast tracking app', 'stop sugar spikes now', 'rapid health results tracker'). " +
    "Your [gap] keywords name the failure state and lost results competitors leave users in — " +
    "write them as someone who got burned and is searching for an app that actually delivers: " +
    "(e.g. 'food tracker that doesnt crash results', 'stop wasting progress unreliable app', 'nutrition app that actually delivers'). " +
    "Gap keywords must convey lost momentum and a demand for an app that performs.",

  minimal:
    "Minimal / Feature-first — " +

    "HOOK: The first 80 characters of fullDescription must state the single most important functional benefit " +
    "with zero decoration — e.g. what the app tracks, how precisely, and why that matters in one tight sentence. " +
    "No emotional language. No adjectives that don't carry information. " +
    "Psychological trigger: PRECISION + CONTROL. The user must feel they are choosing the most efficient, " +
    "no-nonsense tool available. Complexity is stripped away. Only signal remains. " +

    "COPY: Zero fluff. State each feature once, precisely. No exclamation marks, no filler adjectives. " +
    "If a word can be removed without losing meaning, remove it. Every sentence is a complete thought. " +
    "Gap to exploit against incumbents: most trackers are over-designed with features users don't need. " +
    "Position this app as the one that does exactly what it says — nothing more, nothing less. Pure function. " +

    "SHORT DESCRIPTION RULE: Front-load the PRIMARY FUNCTIONAL BENEFIT — the single most important outcome the user achieves. " +
    "Lead with what they get, not with a qualifier, modifier, or setup phrase. " +
    "WRONG: 'Eliminate guesswork. Track salt & sugar precisely. Achieve rapid health results.' (qualifier-first, fragmented) " +
    "RIGHT: 'Track salt & sugar precisely. Eliminate guesswork and hit your health goals daily.' (outcome-first, tight) " +
    "The first three words of shortDescription must be the most important thing the user gets — not a preamble. " +

    "HUMAN ELEMENT: Include one sentence in the hook paragraph that states simply what the app does and for whom — " +
    "no adjectives, no claims, just a precise statement of purpose " +
    "(e.g. 'Built for people who need accurate sodium and glucose data without the noise'). " +

    "BRIDGE SENTENCE (mandatory): After the hook paragraph and before the bullet list, write one minimal sentence that connects " +
    "the functional problem in the hook to the features that follow. No filler — one clean statement of purpose. " +
    "WRONG: 'Here is a list of the app features:' (redundant, adds zero value) " +
    "RIGHT: 'Built to do one thing well: give you accurate data, fast, every time.' " +
    "The bridge sentence must be stripped and precise — if it can be shorter, make it shorter. " +

    "BULLETS: Every bullet is one concrete benefit + the feature that delivers it. Nothing more. " +
    "NEVER start a bullet with a feature name, app term, or keyword phrase. " +
    "Start with the outcome — the thing the user now has — then name what delivers it. " +
    "WRONG: '📊 Barcode scanner: scan foods for nutrition data.' " +
    "RIGHT: '📊 Accurate data instantly: scan any barcode and get verified nutritional facts — no manual entry, no errors.' " +

    "KEYWORDS: Choose precise, function-specific vocabulary with zero marketing language. Treat keywords as " +
    "Mandatory Semantic Terms to weave naturally into copy — never list them verbatim. " +
    "Your [competitive] keywords are exact-match functional queries " +
    "(e.g. 'food log app', 'macro tracker', 'barcode nutrition scanner'). " +
    "Your [intent] keywords describe a specific task a user wants to complete, stated plainly " +
    "(e.g. 'log sodium intake daily', 'scan barcode food nutrition', 'track glucose after meals'). " +
    "Your [gap] keywords name a specific functional failure users report in rival apps — " +
    "write them as a task-oriented user describing what broke and what they need instead: " +
    "(e.g. 'food tracker crash fix', 'nutrition app sync error', 'barcode scanner not working app'). " +
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

// ── System message (v9) ───────────────────────────────────────────────────────
function buildSystemMessage(targetArabic: boolean): string {
  return [
    // ── Role ────────────────────────────────────────────────────────────────
    "You are a Senior App Store Optimization Consultant with 10+ years of experience in the Health & Fitness " +
      "category on Google Play. Your mandate is to maximise both keyword visibility AND conversion rate (CVR) — " +
      "not one at the expense of the other. You push apps into the top-10 organic results by combining " +
      "keyword intelligence, data-first conversion copywriting, psychological trigger architecture, " +
      "and competitive displacement strategy.",

    // ── Clean room rule ──────────────────────────────────────────────────────
    "CLEAN ROOM RULE — CRITICAL: Treat every generation as a fresh brief. " +
      "The ONLY inputs that count are the fields provided in the current request: App Brief, Tone Psychology, " +
      "App Features & Value Props, and (if present) Strategic Displacement Campaign. " +
      "Do NOT reference, infer, or carry forward any prior context, past common issues, crash reports, " +
      "or previous generation content. If a pain point is not explicitly listed in this request's " +
      "Strategic Displacement Campaign block, do NOT assume it exists. " +
      "When in doubt about any app detail, base copy solely on what is stated in the current brief.",

    // ── Internal workflow ────────────────────────────────────────────────────
    "In ONE response (no tool calls), execute this workflow internally: " +
      "(1) BRIEF ANALYSIS: Identify the single strongest USP, the primary user transformation (what life looks like after using this app), " +
      "and the market gap against incumbents stated in the TONE PSYCHOLOGY block. " +
      "(2) SEMANTIC MAPPING: Map the seed keywords to natural language INTENT — the meaning behind the keyword, not the string itself. " +
      "Google Play's NLP algorithm understands semantic intent; it does not require exact-match keyword strings in copy. " +
      "NEVER insert a keyword phrase verbatim into a sentence if it reads awkwardly. " +
      "If 'barcode scanner accuracy app' is a keyword, express that intent as 'scan any barcode and get verified nutritional data instantly' — " +
      "not as the literal phrase. The keyword list is for Play Console's backend keyword field, not for direct insertion into prose. " +
      "(3) DRAFT: Write all fields in the correct tone register with psychological triggers active. " +
      "(4) SELF-AUDIT: Read every sentence aloud mentally. If any sentence sounds robotic, keyword-stuffed, or 'generated', rewrite it. " +
      "Check: character limits, semantic keyword coverage (intent present, not string-matched), " +
      "tone consistency, hook strength, bullet benefit-first structure, and human origin story present. " +
      "(5) REWRITE: Fix any section that is generic, tone-inconsistent, stuffed, or inhuman. " +
      "(6) OUTPUT: A single JSON object only — no markdown, no code fences, no prose.",

    // ── Hard character limits ────────────────────────────────────────────────
    "HARD CHARACTER LIMITS — Google Play enforces these at submission:",
    "  title: max 30 characters. Count every character including spaces. Never 31+.",
    "  shortDescription: max 80 characters. Count every character. Never 81+. " +
      "If draft exceeds 80, shorten aggressively until it fits.",
    "  fullDescription: max 4000 characters.",

    // ── JSON field contract ──────────────────────────────────────────────────
    "Return a single JSON object with EXACTLY these camelCase keys:",
    "  title: string ≤30 chars — primary keyword + transformation hook. Must signal both relevance (for search) " +
      "and outcome (for conversion). Tone-consistent.",
    "  shortDescription: string ≤80 chars — standalone install hook visible in search results. " +
      "Must answer 'why install NOW' in one tight benefit statement. This is the highest-CVR real estate on the listing.",
    "  fullDescription: string ≤4000 chars. Structure MUST follow this exact sequence: " +
      "(A) HOOK PARAGRAPH — 2-3 sentences. First sentence (≤80 chars): transformation promise for the target user. " +
      "Second sentence: explain WHY the app exists — the human reason it was built " +
      "(e.g. 'Built for people managing blood pressure or glucose who need data they can trust'). " +
      "Third sentence (optional): bridge from problem to solution. No keywords forced here — write as you would explain to a friend. " +
      "(B) FEATURES PARAGRAPH — 1-2 sentences BEFORE the bullet list. Introduce the features section in plain human language. " +
      "Example: 'Here is what you get from day one:' or 'Everything you need, nothing you don't:'. " +
      "(C) BULLET LIST — 5-8 bullets with emojis. BENEFIT FIRST rule: every bullet must lead with the user outcome or benefit, " +
      "THEN the feature name. NEVER lead with a keyword phrase or feature name. " +
      "WRONG: '📊 Barcode scanner accuracy app — scan foods to track nutrients.' " +
      "RIGHT: '📊 Instant barcode scanning: point your camera at any food and get verified nutritional data in under a second.' " +
      "CRITICAL: Every bullet MUST be written in the active tone register from TONE PSYCHOLOGY. " +
      "Professional = clinical outcome first. Friendly = personal daily win first. " +
      "Bold = power verb + result first. Minimal = one benefit + one feature, nothing else. " +
      "Generic bullets that read identically across tones are a failure — rewrite until each is unmistakably tone-specific. " +
      "(D) SOCIAL PROOF — one line if supported by real app features (never invent stats). " +
      "(E) CTA — 1-2 sentences. Imperative. Tone-consistent. Ends the listing with momentum toward install.",
    "  keywordSuggestions: array of exactly 20 keyword phrases. Format EACH as '[category] keyword phrase'. " +
      "Categories: [competitive] (8 items), [intent] (7 items), [gap] (5 items). " +
      "CRITICAL — TWO-LAYER KEYWORD STRATEGY: " +
      "Layer 1 (copy): The INTENT behind each keyword must be expressed naturally in title, shortDescription, or fullDescription. " +
      "Do NOT copy-paste the keyword string into prose. 'Barcode scanner accuracy app' is a keyword for Play Console's backend — " +
      "its intent ('accurate barcode scanning') belongs in copy as natural language. " +
      "Layer 2 (list): The keywordSuggestions list itself is for Play Console's keyword field — these are exact search strings, " +
      "optimised for what users actually type, not what reads well in a sentence. They can be short, blunt, and search-optimised. " +
      "Vocabulary register must match tone (see TONE PSYCHOLOGY). Never mix registers.",
    "  ctaSuggestions: array of 4-8 items. First item MUST start with 'WHY THIS RANKS: ' — " +
      "explain in 1-2 sentences the specific keyword + displacement angle that will push this listing to page 1. " +
      "Remaining items are conversion-focused CTAs, max 60 chars each.",
    "  asoScore: integer 0-100. MUST equal exact sum of scoreBreakdown values.",
    "  scoreBreakdown: object — title (0-30), shortDescription (0-20), longDescription (0-40), persuasiveness (0-10). Sum = asoScore.",
    "  improvementTips: array of 2-8 tips. Each tip must be specific to THIS listing — no generic ASO advice. " +
      "The last tip MUST be a 'Rationale for Ranking' — one sentence explaining exactly why this copy will " +
      "outperform market leaders for the primary keyword.",

    // ── v8 fields ────────────────────────────────────────────────────────────
    "  whatsNew: string ≤500 chars. Play Store 'What's New' release notes. " +
      "Open with the primary pain point resolved. List 2-3 key improvements as tight benefit statements. " +
      "Close with a one-line install/update nudge. Weave in 1-2 primary keywords naturally. " +
      "Tone-consistent. Never write generic changelogs.",

    "  screenshotCaptions: array of exactly 5 strings, each ≤80 chars. " +
      "Conversion-priority order: (1) strongest hook / pain point resolved, (2) most-used feature benefit, " +
      "(3) social proof or data claim, (4) secondary differentiator, (5) CTA / download nudge. " +
      "Every caption must be tone-consistent and specific to this app's USP. No generic captions.",

    "  abTestVariant: object — titleB (string ≤30 chars) + hypothesis (string ≤300 chars). " +
      "titleB MUST be keyword-rich — it must contain at least one high-search-volume term from the category " +
      "(e.g. 'Track', 'Log', 'Monitor', the primary nutrient name, or the primary health goal). " +
      "Abstract benefit phrases without search terms (e.g. 'Your Health Command', 'Take Control Now') are FORBIDDEN " +
      "— they destroy search discovery. titleB tests a DIFFERENT angle from titleA: " +
      "if titleA is keyword+benefit, titleB must be keyword+action or keyword+audience. " +
      "hypothesis explains: what each title tests, which user segment each targets, " +
      "what metric to watch (CVR or installs), and minimum test duration (2 weeks). " +
      "Written for a non-technical app owner.",

    // ── ASO quality standards ────────────────────────────────────────────────
    "ASO QUALITY STANDARDS — the difference between a 7/10 and a 10/10 listing:",
    "  • NO KEYWORD STUFFING — this is the most common failure. Never insert a keyword string directly into a sentence " +
      "if it reads awkwardly. 'End searches for a barcode scanner accuracy app' is keyword stuffing. " +
      "'Scan any barcode for verified nutritional data' expresses the same intent naturally. " +
      "Google Play's algorithm is semantic — it understands intent, not exact-match strings in prose. " +
      "Keyword stuffing triggers spam filters and destroys user trust. Never do it.",
    "  • BENEFIT-FIRST BULLETS — every bullet leads with what the user gains, not with a feature name or keyword. " +
      "If a bullet could appear in any generic health app, it is too generic. Rewrite it.",
    "  • HUMAN ORIGIN STORY — every listing must contain at least one sentence explaining why the app exists " +
      "for real people with real health goals. This is the sentence that converts skeptical users.",
    "  • HOOK STRENGTH — first 80 chars must make the target user feel seen. Not 'track your health' — " +
      "that could describe 1000 apps. Something specific: 'Managing your sodium intake shouldn't require a medical degree.'",
    "  • TONE PURITY — every field reads as one voice in one register. No tone drift between title and bullets.",
    "  • CONVERSION FLOW — Hook paragraph → Features paragraph → Bullet list → Social proof → CTA builds momentum.",
    "  • No hyperbole: 'Best app ever' or '100% accurate' without evidence are disqualifying.",
    "  • Bullets and emojis required — walls of text kill conversion.",
    "  • Google Play policy: no prohibited content, no misleading category claims.",

    // ── Arabic instruction (conditional) ────────────────────────────────────
    targetArabic
      ? "LANGUAGE: All user-visible string values must be natural modern Arabic (MSA/Gulf mix for MENA users). " +
        "Keyword category tags [competitive], [intent], [gap] stay in English as prefixes. Numeric scores stay as numbers. " +
        "The Clean Room Rule, tone differentiation, psychological triggers, hook structure, semantic weaving, " +
        "and gap strategy ALL apply in Arabic exactly as in English — same standards, different language. " +
        "Professional Arabic uses formal clinical register (e.g. 'مراقب استهلاك الصوديوم', 'أداة الامتثال الغذائي'). " +
        "Friendly Arabic uses warm conversational register (e.g. 'تتبع الملح بسهولة', 'تطبيق صديق لعاداتك اليومية'). " +
        "Bold Arabic uses imperative action verbs and power words (e.g. 'تحكم في صحتك', 'سحق أهدافك اليوم'). " +
        "Minimal Arabic is stripped and precise — no filler, no marketing adjectives. " +
        "ALL FOUR STRUCTURAL RULES apply in Arabic exactly as in English: " +
        "(1) SHORT DESCRIPTION RULE: front-load the primary benefit — first three words of shortDescription must deliver " +
        "the main outcome in Arabic, not a qualifier or preamble. " +
        "(2) BRIDGE SENTENCE: required in all 4 tones in Arabic — connect the hook paragraph to the feature list " +
        "with one tone-consistent sentence that frames features as the solution. " +
        "(3) BENEFIT-FIRST BULLETS: every Arabic bullet leads with the user outcome, never with a feature name. " +
        "(4) HUMAN ELEMENT: one sentence explaining why the app exists for real Arabic-speaking users — " +
        "culturally relevant, not a translated English phrase. " +
        "Do not produce generic Arabic copy — every field must be in the correct register."
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

// ── User message (v9) ─────────────────────────────────────────────────────────
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
    // Seed keywords are presented as Mandatory Semantic Terms — the model
    // must weave these naturally into copy, not list them verbatim.
    `Mandatory Semantic Terms (weave naturally into copy to signal topical authority — never list verbatim): ${keywords.join(", ")}`,
    "",
    "── TONE PSYCHOLOGY ──",
    "Apply this tone across ALL fields (title, shortDescription, fullDescription, CTAs, keywords, captions, whatsNew).",
    "This is the source of truth for copy register, bullet structure, keyword vocabulary, and gap framing:",
    toneBrief,
    "",
    "── APP FEATURES & VALUE PROPS ──",
    "Use ONLY the features listed below to write honest copy. Do not invent features or stats not described here.",
    input.appFeatures,
  ].join("\n");

  const refinement =
    typeof input.userInstruction === "string" && input.userInstruction.trim()
      ? [
          "",
          "── PRODUCT OWNER DIRECTION (overrides defaults where conflicting) ──",
          input.userInstruction.trim(),
        ].join("\n")
      : "";

  // Competitor displacement block — CLEAN ROOM: only injected when the current
  // session has explicitly staged pain-point targets. Never inferred from history.
  const displacementBlock =
    exploitTargets.length > 0
      ? [
          "",
          "── STRATEGIC DISPLACEMENT CAMPAIGN ──",
          "CLEAN ROOM: The following pain points are the ONLY competitive issues to address. " +
            "Do NOT reference any other pain points, bugs, or historical issues not listed here.",
          `Pain points identified from competitor and own-app reviews this session: [${exploitTargets.join(", ")}].`,
          "Apply the Safe-Passage Strategy: your fullDescription hook MUST open with a direct promise of relief " +
            "from these pain points — make it the first thing the user reads.",
          "Displacement rules per pain-point type:",
          "  • Inaccurate data / food database issues → position around data precision, verified entries, " +
            "clinical-grade accuracy. Never imply your data is 'perfect' — use 'verified', 'trusted', 'validated'.",
          "  • Stability/crash issues → position as 'zero crashes', 'rock-solid performance', 'battle-tested'.",
          "  • Ad/monetization friction → highlight smooth experience, fair pricing, zero interruptions.",
          "  • Missing features/limited → showcase depth, comprehensive tracking, power-user capabilities.",
          "  • Poor UX/navigation → emphasise intuitive design, fast onboarding, clean interface.",
          "  • General dissatisfaction → build trust through specifics: data sources, audit trail, guarantee.",
          "  • Any other type → infer the strongest displacement angle and apply it assertively.",
          "Blend naturally into copy. Do NOT name competitors. The displacement must read as genuine positioning.",
          "Your [gap] keywords MUST directly reflect these staged pain points only.",
        ].join("\n")
      : "";

  const reminderBlock = [
    "",
    "── FINAL QUALITY CHECKLIST (10/10 STANDARD) — applies to ALL tones, English AND Arabic ──",
    "1. title: ≤30 chars? Primary keyword present naturally? Signals transformation — not just a category label?",
    "2. shortDescription: ≤80 chars? BENEFIT-FIRST — do the first three words deliver the primary outcome? " +
      "NOT a qualifier, modifier, or preamble? Read it aloud — does it answer 'why install NOW' immediately?",
    "3. fullDescription structure: Hook paragraph → BRIDGE SENTENCE → Bullet list → Social proof → CTA? " +
      "BRIDGE SENTENCE CHECK: Is there one tone-consistent sentence between the hook paragraph and the bullet list " +
      "that frames the features as the solution to the hook's problem? If missing, add it. " +
      "A generic 'Here is what you get:' is NOT a bridge sentence — it must connect the specific frustration to the solution.",
    "4. Hook paragraph: First sentence ≤80 chars with transformation promise? " +
      "Human element sentence present (why this app exists for real people — not a feature claim)?",
    "5. ANTI-STUFFING CHECK — read every sentence. Does any sentence contain an awkward keyword phrase " +
      "that a human would never say naturally? (e.g. 'end searches for barcode scanner accuracy app', " +
      "'food tracker data error fix solution'). If yes, rewrite it as natural language expressing the same intent.",
    "6. Bullets: Does every bullet lead with the USER'S BENEFIT, not a feature name or keyword? " +
      "Cover your feature names with your hand — does the benefit still make the user want the app? " +
      "Are ALL bullets unmistakably in the correct tone register?",
    "7. Keyword naturalness: Are the Mandatory Semantic Terms expressed as organic language in copy? " +
      "Are the keywordSuggestions list items optimised as search strings (not required to read well in sentences)?",
    "8. keywordSuggestions: exactly 20 items? 8 [competitive] + 7 [intent] + 5 [gap]? Register matches tone?",
    "9. ctaSuggestions[0]: starts with 'WHY THIS RANKS: '?",
    "10. asoScore = exact sum of scoreBreakdown values?",
    "11. improvementTips: last tip is a 'Rationale for Ranking' — why this copy beats market leaders?",
    "12. whatsNew: ≤500 chars? Opens with pain point resolved? No awkward keyword strings?",
    "13. screenshotCaptions: exactly 5 items? ≤80 chars each? Benefit-first? Tone-specific?",
    "14. abTestVariant: titleB ≤30 chars? Keyword-rich — contains at least one search term (Track/Log/Monitor/nutrient name)? " +
      "NOT an abstract phrase with no search value (e.g. 'Your Health Command' is forbidden)? " +
      "Different angle from titleA? Hypothesis clear to a non-technical owner?",
    "If ANY item above fails, rewrite the affected field before outputting. Then output the single JSON object.",
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
