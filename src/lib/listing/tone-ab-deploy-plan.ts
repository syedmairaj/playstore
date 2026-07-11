import { categoriseKeywords } from "@/lib/listing/keyword-strategy-parse";
import {
  buildToneExperimentMeta,
  formatToneStyleLabel,
  parseToneStyle,
  type ToneExperimentMeta,
} from "@/lib/listing/tone-ab-pairs";
import type { ToneStyle } from "@/lib/types/listing";
import type { KeywordIntelligenceItem } from "@/lib/validation/listing-output";

export type ToneAbArm = {
  tone: ToneStyle;
  trafficShare: 50;
  /** Maps to listingVariants.aggressive | .growth in generated output. */
  metadataVariant: "aggressive" | "growth";
  label: string;
  headline: string;
  rationale: string;
  expectedOutcome: string;
};

export type PlayConsoleCalloutKind =
  | "warning"
  | "tip"
  | "significance"
  | "control";

export type PlayConsoleCallout = {
  kind: PlayConsoleCalloutKind;
  text: string;
};

export type PlayConsoleGuideStep = {
  title: string;
  body: string;
  /** Where to click in playstore.xyz (optional visual hint). */
  playstoreHint?: string;
  /** Where to paste in Google Play Console. */
  playConsoleHint?: string;
  callouts?: PlayConsoleCallout[];
};

export type ToneAbDeployPlan = {
  experimentId: string;
  selectedTone: ToneStyle;
  alternativeTone: ToneStyle;
  gapKeywordCount: number;
  competitorGapPct: number;
  arms: [ToneAbArm, ToneAbArm];
  monitorGuidance: string;
  /** @deprecated Use playConsoleGuide — kept for tests */
  playConsoleSteps: string[];
  playConsoleGuide: PlayConsoleGuideStep[];
};

export type BuildToneAbDeployPlanInput = {
  keywordSuggestions: string[];
  keywordIntelligence?: KeywordIntelligenceItem[];
  /** Both aggressive + growth variants must exist to run a tone A/B. */
  hasListingVariants: boolean;
  /** User-selected optimizer tone — Arm A (aggressive slot). */
  selectedToneStyle: ToneStyle | string;
  /** Optional contrast tone for Arm B; auto-resolved when omitted. */
  alternativeToneStyle?: ToneStyle | string;
};

const MIN_GAP_KEYWORDS = 3;
const MIN_GAP_INTEL = 2;
const MIN_GAP_SHARE = 0.2;

function armRationale(tone: ToneStyle, slot: "aggressive" | "growth"): string {
  const label = formatToneStyleLabel(tone);
  if (slot === "aggressive") {
    return `Variant A uses the ${label} tone register — your selected voice for this generation. Gap-heavy strategies benefit from a distinct tone arm that matches how switchers evaluate alternatives.`;
  }
  return `Variant B uses the ${label} tone register — the contrast control arm. Compares whether a different voice converts better on the same gap-keyword strategy.`;
}

function armExpectedOutcome(tone: ToneStyle): string {
  switch (tone) {
    case "bold":
      return "Expect higher click-through rate (CTR) from urgency-driven switchers.";
    case "professional":
      return "Expect stronger trust signals and retention among data-driven users.";
    case "friendly":
      return "Expect warmer engagement from users seeking approachable, low-friction apps.";
    case "minimal":
      return "Expect higher conversion from users who value precision and clarity over hype.";
    default:
      return "Compare CVR Δ against the other tone arm in Performance Attribution.";
  }
}

function buildArmsFromExperiment(meta: ToneExperimentMeta): [ToneAbArm, ToneAbArm] {
  return [
    {
      tone: meta.armA.tone,
      trafficShare: 50,
      metadataVariant: "aggressive",
      label: meta.armA.label,
      headline: `Deploy ${formatToneStyleLabel(meta.armA.tone)} to 50%`,
      rationale: armRationale(meta.armA.tone, "aggressive"),
      expectedOutcome: armExpectedOutcome(meta.armA.tone),
    },
    {
      tone: meta.armB.tone,
      trafficShare: 50,
      metadataVariant: "growth",
      label: meta.armB.label,
      headline: `Deploy ${formatToneStyleLabel(meta.armB.tone)} to 50%`,
      rationale: armRationale(meta.armB.tone, "growth"),
      expectedOutcome: armExpectedOutcome(meta.armB.tone),
    },
  ];
}

function buildPlayConsoleGuide(
  armALabel: string,
  armBLabel: string,
): { guide: PlayConsoleGuideStep[]; legacySteps: string[] } {
  const guide: PlayConsoleGuideStep[] = [
    {
      title: "Create the experiment in Play Console",
      body: "In Google Play Console, open Grow → Store presence → Store listing experiments → Create experiment. Choose a 50/50 traffic split (half your visitors see each version).",
      playConsoleHint: "Play Console → Grow → Store presence → Store listing experiments",
      callouts: [
        {
          kind: "warning",
          text: "Ensure your app is not currently running another store listing experiment on the same listing. Overlapping experiments corrupt your results.",
        },
        {
          kind: "tip",
          text: "If you have low daily traffic (under 100 installs per day), a 50/50 split is essential to reach statistical significance faster.",
        },
      ],
    },
    {
      title: "Set your control (current live listing)",
      body: "Play Console needs a baseline to measure improvement. Keep one arm as your current live store listing (Control). Do not replace the control with new AI copy — otherwise you lose the benchmark for how your listing performed before the test.",
      playConsoleHint: "Play Console → Control / Current listing (baseline)",
      callouts: [
        {
          kind: "control",
          text: `Ideal setup: Control = what is live today in Play Console. Paste only your new tone copy into Variant A (${armALabel}) and/or Variant B (${armBLabel}). If you replace both arms with new metadata, you are comparing tones to each other — not lift vs your previous live listing.`,
        },
      ],
    },
    {
      title: `Copy ${armALabel} into Play Console Variant A`,
      body: `In playstore.xyz: under “Metadata version”, click the ${armALabel} tab. Copy Title, Short description, and Full description (Copy button on each field). In Play Console, paste into Variant A — the first test arm (50% of visitors). Skip this step if Variant A is your unchanged control.`,
      playstoreHint: `Metadata version → ${armALabel} → Title / Short / Long`,
      playConsoleHint: "Play Console → Variant A (50%)",
    },
    {
      title: `Copy ${armBLabel} into Play Console Variant B`,
      body: `Switch to the ${armBLabel} tab in playstore.xyz. Copy Title, Short description, and Full description again. In Play Console, paste into Variant B — the second test arm (other 50%).`,
      playstoreHint: `Metadata version → ${armBLabel} → Title / Short / Long`,
      playConsoleHint: "Play Console → Variant B (50%)",
    },
    {
      title: "Wait for significance, then mark the winner Live",
      body: "Start the experiment in Play Console. Do not stop early just because 14 days passed — low traffic needs more time. When Play Console shows a clear winner, apply that variant as your live listing. Then click Mark winner as Live below so Growth Tracking and Performance Attribution stay accurate.",
      playConsoleHint: "Play Console → Start → monitor significance %",
      callouts: [
        {
          kind: "significance",
          text: "For reliable results, ensure your experiment reaches at least 95% statistical significance in Play Console before declaring a winner.",
        },
      ],
    },
  ];

  const legacySteps = guide.map((s) =>
    [s.title, s.body].filter(Boolean).join(" "),
  );

  return { guide, legacySteps };
}

/**
 * Recommends a 50/50 tone experiment when competitor-gap keywords dominate
 * the strategy. Arms are keyed to the user's selected tone vs a contrast tone.
 */
export function buildToneAbDeployPlan(
  input: BuildToneAbDeployPlanInput,
): ToneAbDeployPlan | null {
  if (!input.hasListingVariants) return null;

  const buckets = categoriseKeywords(input.keywordSuggestions);
  const gapCount = buckets.gap.length;
  const total = input.keywordSuggestions.filter((k) => k.trim()).length;
  const gapPct = total > 0 ? gapCount / total : 0;
  const gapIntelCount =
    input.keywordIntelligence?.filter((k) => k.cluster === "gap").length ?? 0;

  const qualifies =
    gapCount >= MIN_GAP_KEYWORDS ||
    gapIntelCount >= MIN_GAP_INTEL ||
    gapPct >= MIN_GAP_SHARE;

  if (!qualifies) return null;

  const selectedTone = parseToneStyle(input.selectedToneStyle);
  const alternativeTone = input.alternativeToneStyle
    ? parseToneStyle(input.alternativeToneStyle)
    : undefined;
  const experiment = buildToneExperimentMeta(selectedTone, alternativeTone);
  const armALabel = formatToneStyleLabel(experiment.armA.tone);
  const armBLabel = formatToneStyleLabel(experiment.armB.tone);
  const { guide, legacySteps } = buildPlayConsoleGuide(
    experiment.armA.label,
    experiment.armB.label,
  );

  return {
    experimentId: experiment.experimentId,
    selectedTone: experiment.selectedTone,
    alternativeTone: experiment.alternativeTone,
    gapKeywordCount: gapCount,
    competitorGapPct: Math.round(gapPct * 100),
    arms: buildArmsFromExperiment(experiment),
    monitorGuidance:
      `Wait until Play Console shows ≥95% statistical significance — not just 14 days. Then open Performance Attribution to compare ${armALabel} vs ${armBLabel}. Mark the winner as Live here when you apply it in Play Console. For paid installs, log CPI in Growth Tracking (weekly UAC spend ÷ installers).`,
    playConsoleSteps: legacySteps,
    playConsoleGuide: guide,
  };
}

/**
 * Prompt block instructing Gemini to write each listingVariants slot in a
 * specific tone register (Arm A = selected, Arm B = contrast).
 */
export function buildListingVariantsTonePromptBlock(
  selectedTone: ToneStyle,
  alternativeTone?: ToneStyle,
): string {
  const experiment = buildToneExperimentMeta(selectedTone, alternativeTone);
  const armA = formatToneStyleLabel(experiment.armA.tone);
  const armB = formatToneStyleLabel(experiment.armB.tone);

  return [
    "listingVariants: object with aggressive + growth — BOTH required when Strategy Mode block is present.",
    "Each variant: title (≤30), shortDescription (≤80), fullDescription (≤1500 — compact hook + bullets only), whatsNew (≤500).",
    `listingVariants.aggressive = Variant A (50% traffic) — write ENTIRELY in the ${armA} tone register. Apply ${armA} psychological triggers, vocabulary, and hook style to every field. This is the user's selected tone.`,
    `listingVariants.growth = Variant B (50% traffic) — write ENTIRELY in the ${armB} tone register. Apply ${armB} psychological triggers, vocabulary, and hook style to every field. This is the contrast control arm.`,
    `Root title/shortDescription/fullDescription/whatsNew MUST equal listingVariants.aggressive values (Variant A — ${armA} tone).`,
    `TONE PURITY: aggressive and growth variants MUST sound distinctly different — ${armA} vs ${armB} — not paraphrases of the same voice.`,
  ].join(" ");
}
