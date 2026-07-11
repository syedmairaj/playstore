/**
 * Modular XML-delimited ASO system prompts.
 *
 * Structured for Gemini precision while staying compatible with existing
 * LISTING_CAPTIONS_SCHEMA enforcement and downstream JSON parsers.
 */

export const ASO_PLAY_STORE_LIMITS = {
  title: 30,
  shortDescription: 80,
  longDescription: 4000,
  caption: 70,
  uiFocus: 200,
} as const;

export type ListingCaptionTone = "bold" | "professional" | "friendly" | "minimal";

export type BuildListingCaptionsPromptInput = {
  appName: string;
  category: string;
  longDescription: string;
  locale: "en" | "ar";
  /** Final Play Store title — captions must align with this promise. */
  listingTitle?: string;
  /** Optimizer tone (bold, professional, friendly, minimal). */
  toneStyle?: string;
  /** Feature bullets for uiFocus / screenshot alignment. */
  appFeatures?: string;
  lockedKeywords?: string[];
  brandKit?: {
    primaryColor?: string | null;
    colorPalette?: string | null;
    style?: string | null;
    toneGuidelines?: string | null;
  };
};

const DEFAULT_ASO_ROLE =
  "You are an expert ASO (App Store Optimization) Strategist specialized in Play Store metadata for health-tech apps.";

const DEFAULT_ASO_OBJECTIVE =
  "Generate precise, conversion-optimized App Store listings that adhere to strict platform constraints.";

/** Shared XML system block for listing and caption generation. */
export function buildAsoSystemInstructionsXml(options?: {
  role?: string;
  objective?: string;
  extraConstraints?: string[];
}): string {
  const role = options?.role ?? DEFAULT_ASO_ROLE;
  const objective = options?.objective ?? DEFAULT_ASO_OBJECTIVE;
  const constraints = [
    `Title: Max ${ASO_PLAY_STORE_LIMITS.title} characters. Do not truncate mid-word.`,
    `Short Description: Max ${ASO_PLAY_STORE_LIMITS.shortDescription} characters. Clear value proposition.`,
    `Long Description: Max ${ASO_PLAY_STORE_LIMITS.longDescription} characters. Use feature-benefit formatting.`,
    "JSON_ONLY: Return ONLY valid JSON matching the provided schema. No conversational filler.",
    ...(options?.extraConstraints ?? []),
  ];

  const constraintXml = constraints
    .map((c) => `    <Constraint>${c}</Constraint>`)
    .join("\n");

  return `<SystemInstructions>
  <Role>${role}</Role>
  <Objective>${objective}</Objective>
  <ConstraintChecklist>
${constraintXml}
  </ConstraintChecklist>
  <ToneGuidelines>
    <Tone name="Bold">Use high-impact verbs: "Crush", "Command", "Eliminate". Focus on solving user frustration (e.g., ad-free, paywall-free).</Tone>
    <Tone name="Professional">Use authoritative language: "Data integrity", "Reliability", "Professional-grade". Focus on measurable outcomes.</Tone>
    <Tone name="Friendly">Use warm second-person language. Focus on daily wins, belonging, and progress without guilt or overwhelm.</Tone>
    <Tone name="Minimal">Use precise, stripped-down copy. Focus on clarity, control, and essential value — no filler adjectives.</Tone>
  </ToneGuidelines>
</SystemInstructions>`;
}

/** B2B multi-tenant analyst framing — prepend to listing/modular system prompts. */
export function buildPerformanceAnalystSystemXml(options?: {
  role?: string;
}): string {
  const role =
    options?.role ??
    "You are an ASO Data Analyst for a B2B SaaS platform serving multiple workspaces and app niches.";
  return `<SystemInstructions>
  <Role>${role}</Role>
  <Process>
    <Step order="1">Analyze the provided App Features and Target Keywords (plus workspace Keyword Tracker signals when present).</Step>
    <Step order="2">Identify the Conversion Gap: what top-performing competitors do that this app metadata does not yet exploit.</Step>
    <Step order="3">Generate metadata that explicitly closes that gap — not generic copy.</Step>
    <Step order="4">Provide ROI Intelligence: for each keyword cluster, explain why the cluster should drive higher install velocity (searchVolume, difficulty, relevance).</Step>
  </Process>
  <RoiIntelligenceStandards>
    <Standard name="SearchVolume">High-ROI competitive keywords should target &gt;5k monthly volume when data is available; long-tail quick wins may use &gt;1k volume with difficulty &lt;30.</Standard>
    <Standard name="DifficultyScore">0-100 realism check — prefer long-tail wins (volume &gt;1k, difficulty &lt;30) when competing against entrenched leaders.</Standard>
    <Standard name="RelevanceMatch">0-100 anti-spam score — keyword must match the app's core utility; Google penalizes irrelevant terms.</Standard>
  </RoiIntelligenceStandards>
</SystemInstructions>`;
}

/** Few-shot shape aligned with LISTING_CAPTIONS_SCHEMA (order, caption, theme, uiFocus). */
export function buildListingCaptionsFewShotXml(): string {
  return `<FewShotExamples>
  <!-- Example: brand recall + uiFocus aligned to caption capability -->
  {
    "captions": [
      {
        "order": 1,
        "caption": "Own your health with salt sugar",
        "theme": "hook",
        "uiFocus": "Health dashboard overview with blood pressure and glucose metric cards"
      },
      {
        "order": 2,
        "caption": "Scan labels in seconds",
        "theme": "feature",
        "uiFocus": "Scan screen with camera viewfinder active on nutrition label"
      }
    ]
  }
</FewShotExamples>`;
}

function buildInputDataXml(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `  <${key}>${value}</${key}>`)
    .join("\n");
  return `<InputData>\n${body}\n</InputData>`;
}

/**
 * Build the full user prompt for generateListingPipelineCaptions.
 * Schema enforcement remains in getGenerativeModel({ responseSchema: LISTING_CAPTIONS_SCHEMA }).
 */
export function buildListingCaptionsAsoPrompt(
  input: BuildListingCaptionsPromptInput,
): string {
  const {
    appName,
    category,
    longDescription,
    locale,
    listingTitle,
    toneStyle,
    appFeatures,
    lockedKeywords,
    brandKit,
  } = input;
  const isAr = locale === "ar";
  const playStoreTitle = listingTitle?.trim() || appName.trim();
  const toneLine = toneStyle?.trim() ? toneStyle.trim() : "match long description";

  const keywordLine =
    lockedKeywords && lockedKeywords.length > 0
      ? lockedKeywords.slice(0, 5).join(", ")
      : "";

  const brandKitLines: string[] = [];
  if (brandKit) {
    if (brandKit.style) brandKitLines.push(`Visual style: ${brandKit.style}`);
    if (brandKit.primaryColor) brandKitLines.push(`Primary brand color: ${brandKit.primaryColor}`);
    if (brandKit.colorPalette) brandKitLines.push(`Color palette: ${brandKit.colorPalette}`);
    if (brandKit.toneGuidelines) brandKitLines.push(`Brand tone: ${brandKit.toneGuidelines}`);
  }

  const localeInstruction = isAr
    ? "Write in natural Modern Standard Arabic (MSA). Mirror the emotional tone of the description. Do NOT transliterate — use full Arabic script."
    : "Write in English that matches the tone and voice of the long description below.";

  const captionConstraints = [
    `Screenshot caption: Max ${ASO_PLAY_STORE_LIMITS.caption} characters per caption. Short, punchy, no filler.`,
    `uiFocus: Max ${ASO_PLAY_STORE_LIMITS.uiFocus} characters. Name the exact UI screen/control shown (e.g. Scan screen, log chart, reminder panel).`,
    "Generate exactly 7 captions with themes: 1 hook, 3 feature, 2 benefit, 1 cta.",
    "theme must be one of: hook, feature, benefit, cta.",
    "No emojis. No generic filler like \"Download now\" or \"Available today\".",
    `Brandifier: At least ONE caption must mention or clearly imply the app brand "${appName}" (e.g. "Own your health with ${appName}"). Prefer hook or CTA slide.`,
    `Title verification: All captions must align with the Play Store title "${playStoreTitle}" — same value proposition, no contradictions.`,
    "Screenshot alignment: uiFocus MUST describe the UI that matches the caption text. If caption says Scan, uiFocus must show scan/camera UI. If caption says track/log, uiFocus must show log/chart UI.",
  ];

  if (brandKitLines.length > 0) {
    captionConstraints.push(
      "uiFocus must reference the Brand Kit palette and style (e.g. \"minimal dark dashboard with #1A73E8 accent\").",
    );
  }

  const systemBlock = buildAsoSystemInstructionsXml({
    role:
      "You are an expert ASO (App Store Optimization) Strategist specialized in Google Play screenshot carousel copy.",
    objective:
      "Generate exactly 7 conversion-optimized screenshot captions that match the listing tone and LISTING_CAPTIONS_SCHEMA.",
    extraConstraints: captionConstraints,
  });

  const inputBlock = buildInputDataXml({
    AppName: appName,
    PlayStoreTitle: playStoreTitle,
    Category: category,
    Locale: locale,
    Tone: toneLine,
    ...(keywordLine ? { Keywords: keywordLine } : {}),
    ...(appFeatures?.trim() ? { AppFeatures: appFeatures.trim().slice(0, 600) } : {}),
    ...(brandKitLines.length > 0 ? { BrandKit: brandKitLines.join(" | ") } : {}),
    LongDescriptionToneReference: longDescription.slice(0, 800),
  });

  const structureBlock = `<CaptionStructure>
  <Slide order="1" theme="hook">Opening value proposition — include brand recall when natural.</Slide>
  <Slide order="2" theme="feature">Core capability — uiFocus shows that exact screen (e.g. scan, log, chart).</Slide>
  <Slide order="3" theme="feature">Second key capability — uiFocus matches caption verb/noun.</Slide>
  <Slide order="4" theme="feature">Third key capability — uiFocus matches caption verb/noun.</Slide>
  <Slide order="5" theme="benefit">Outcome-focused — uiFocus shows results/dashboard view.</Slide>
  <Slide order="6" theme="benefit">Another tangible benefit — uiFocus shows outcome UI.</Slide>
  <Slide order="7" theme="cta">Closing CTA — may include brand name; uiFocus shows hero/CTA screen.</Slide>
</CaptionStructure>`;

  return `${systemBlock}

${buildListingCaptionsFewShotXml()}

${inputBlock}

${structureBlock}

<Task>
  Generate ASO screenshot captions for the inputs above.
  Tone: ${toneLine}.
  Match the Play Store title "${playStoreTitle}" and long description voice.
  ${localeInstruction}
</Task>

<OutputFormat>
  Return JSON conforming to LISTING_CAPTIONS_SCHEMA with exactly 7 items:
  { "captions": [{ "order": 1, "caption": "...", "theme": "hook", "uiFocus": "..." }, ...] }
  Every item MUST include uiFocus that visually matches the caption capability.
</OutputFormat>`;
}

/** General-purpose ASO prompt wrapper (listing metadata steps). */
export function buildAsoPrompt(data: {
  tone?: ListingCaptionTone;
  keywords: string[];
  features: string;
  task: string;
  outputFormat: string;
  extraInput?: Record<string, string>;
}): string {
  const systemBlock = buildAsoSystemInstructionsXml();
  const inputBlock = buildInputDataXml({
    ...(data.tone ? { Tone: data.tone } : {}),
    Keywords: data.keywords.join(", "),
    Features: data.features,
    ...data.extraInput,
  });

  return `${systemBlock}

${inputBlock}

<Task>${data.task}</Task>

<OutputFormat>${data.outputFormat}</OutputFormat>`;
}
