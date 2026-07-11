import type { ToneStyle } from "@/lib/types/listing";

export const TONE_STYLES: readonly ToneStyle[] = [
  "professional",
  "friendly",
  "bold",
  "minimal",
] as const;

/** High-contrast tone pairs for meaningful Play Store listing experiments. */
const TONE_AB_CONTRAST: Record<ToneStyle, ToneStyle> = {
  bold: "professional",
  professional: "bold",
  friendly: "minimal",
  minimal: "friendly",
};

export type ToneExperimentArm = {
  tone: ToneStyle;
  metadataVariant: "aggressive" | "growth";
  label: string;
  trafficShare: 50;
};

export type ToneExperimentMeta = {
  experimentId: string;
  selectedTone: ToneStyle;
  alternativeTone: ToneStyle;
  armA: ToneExperimentArm;
  armB: ToneExperimentArm;
};

export function isToneStyle(value: string): value is ToneStyle {
  return (TONE_STYLES as readonly string[]).includes(value);
}

export function parseToneStyle(value: unknown, fallback: ToneStyle = "professional"): ToneStyle {
  return typeof value === "string" && isToneStyle(value) ? value : fallback;
}

/** Title-case label for UI and Play Console copy (e.g. friendly → Friendly). */
export function formatToneStyleLabel(tone: ToneStyle): string {
  return tone.charAt(0).toUpperCase() + tone.slice(1);
}

/**
 * Picks the contrast tone for Arm B when the user does not specify one.
 * Arm A always uses the user's selected tone.
 */
export function resolveAlternativeTone(
  selectedTone: ToneStyle,
  alternativeTone?: ToneStyle,
): ToneStyle {
  if (alternativeTone && alternativeTone !== selectedTone) {
    return alternativeTone;
  }
  const contrast = TONE_AB_CONTRAST[selectedTone];
  return contrast !== selectedTone ? contrast : "professional";
}

export function buildToneExperimentId(armA: ToneStyle, armB: ToneStyle): string {
  return `${armA}_vs_${armB}`;
}

/**
 * Builds the 50/50 experiment arms keyed to listingVariants slots:
 * - aggressive → Arm A (user-selected tone)
 * - growth → Arm B (contrast tone)
 */
export function buildToneExperimentMeta(
  selectedTone: ToneStyle,
  alternativeTone?: ToneStyle,
): ToneExperimentMeta {
  const armATone = selectedTone;
  const armBTone = resolveAlternativeTone(selectedTone, alternativeTone);

  return {
    experimentId: buildToneExperimentId(armATone, armBTone),
    selectedTone: armATone,
    alternativeTone: armBTone,
    armA: {
      tone: armATone,
      metadataVariant: "aggressive",
      label: `${formatToneStyleLabel(armATone)} · 50%`,
      trafficShare: 50,
    },
    armB: {
      tone: armBTone,
      metadataVariant: "growth",
      label: `${formatToneStyleLabel(armBTone)} · 50%`,
      trafficShare: 50,
    },
  };
}
