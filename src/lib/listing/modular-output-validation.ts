import { z } from "zod";
import type { ModularLongStepData } from "@/lib/listing/modular-listing.types";
import { assembleModularFullDescription } from "@/lib/listing/assemble-modular-listing";

/** Reject assembled long copy shorter than this (hard floor). */
export const MODULAR_LONG_MIN_CHARS = 2000;
/** Elastic accept floor — content above this is returned with a warning, not a failure. */
export const MODULAR_LONG_ACCEPT_MIN_CHARS = 1500;
/** Prompt target range for full long-description generation. */
export const MODULAR_LONG_TARGET_MIN_CHARS = 2500;
export const MODULAR_LONG_TARGET_MAX_CHARS = 3500;

const SENTENCE_END_RE = /[.!?؟…]["')\]]*$/u;
const DANGLING_END_RE =
  /\b(and|or|to|for|with|the|a|an|in|on|at|of|&|و|في|من|على|إلى)\s*$/iu;

/**
 * Repair common model omissions before strict validation (never pads beyond 80 chars).
 */
export function normalizeShortVariationText(text: string): string {
  let t = text.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!t) return t;

  t = t.replace(/[-,:]\s*$/, "").trim();
  if (/\.{2,}$/.test(t)) {
    t = t.replace(/\.+$/, ".").trim();
  }

  if (!SENTENCE_END_RE.test(t) && t.length < 80 && !DANGLING_END_RE.test(t)) {
    t = `${t}.`;
  }

  if (t.length > 80) {
    const punctMatch = t.slice(0, 80).match(SENTENCE_END_RE);
    if (punctMatch && punctMatch.index != null) {
      t = t.slice(0, punctMatch.index + punctMatch[0].length).trim();
    } else {
      const lastSpace = t.lastIndexOf(" ", 79);
      if (lastSpace >= 24) {
        t = `${t.slice(0, lastSpace).trim()}.`;
      } else {
        t = t.slice(0, 80).trim();
      }
    }
  }

  return t.slice(0, 80);
}

/**
 * Short Play copy must be grammatically complete — no mid-word cuts or dangling fragments.
 */
export function isGrammaticallyCompleteShortText(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 80) return false;

  if (/-$/.test(t) || /,\s*$/.test(t) || /:\s*$/.test(t)) return false;
  if (/\.{3,}$/.test(t)) return false;

  if (DANGLING_END_RE.test(t)) return false;

  // Hitting the 80-char cap without terminal punctuation suggests truncation.
  if (t.length === 80 && !SENTENCE_END_RE.test(t)) {
    const lastSpace = t.lastIndexOf(" ");
    if (lastSpace < 12) return false;
    const tail = t.slice(lastSpace + 1);
    if (/^[a-zA-Z\u0600-\u06FF]+$/u.test(tail) && tail.length > 14) return false;
  }

  if (SENTENCE_END_RE.test(t)) return true;

  // Complete tagline without terminal punct — allowed only when clearly under the cap.
  return t.length < 80;
}

export function assembledLongCharCount(data: ModularLongStepData): number {
  return assembleModularFullDescription({
    hook: data.hook,
    features: data.features,
    closing: data.closing,
  }).length;
}

export function validateModularLongFullOutput(data: ModularLongStepData): void {
  const assessment = assessModularLongLength(data);
  if (!assessment.accepted) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        message: assessment.message,
        path: ["fullDescription"],
      },
    ]);
  }
}

export type ModularLongLengthAssessment = {
  accepted: boolean;
  charCount: number;
  belowTarget: boolean;
  message: string;
};

/** Elastic length gate — never hard-fails above {@link MODULAR_LONG_ACCEPT_MIN_CHARS}. */
export function assessModularLongLength(data: ModularLongStepData): ModularLongLengthAssessment {
  const charCount = assembledLongCharCount(data);
  if (charCount > MODULAR_LONG_ACCEPT_MIN_CHARS) {
    const belowTarget = charCount < MODULAR_LONG_MIN_CHARS;
    return {
      accepted: true,
      charCount,
      belowTarget,
      message: belowTarget
        ? `fullDescription: ${charCount} characters (target ${MODULAR_LONG_MIN_CHARS}; accepted with warning)`
        : `fullDescription: ${charCount} characters`,
    };
  }
  return {
    accepted: charCount > 0,
    charCount,
    belowTarget: true,
    message: `fullDescription: ${charCount} characters (below ${MODULAR_LONG_ACCEPT_MIN_CHARS} accept floor)`,
  };
}

export type ModularLongFeatureSection = {
  label: string;
  bullets: string[];
};

export const modularLongFeatureSectionSchema = z.object({
  label: z.string().trim().min(1).max(120),
  bullets: z.array(z.string().trim().min(1).max(400)).min(1).max(4),
});

export function modularLongFeaturesArraySchema(reducedComplexity: boolean) {
  return z
    .array(modularLongFeatureSectionSchema)
    .min(reducedComplexity ? 2 : 3)
    .max(reducedComplexity ? 8 : 14);
}

export function modularLongFeaturesSectionsToText(
  sections: ModularLongFeatureSection[],
): string {
  return sections
    .map((section) => {
      const bullets = section.bullets.join("\n");
      return section.label ? `${section.label}\n${bullets}` : bullets;
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 3200);
}

export function formatModularLongLengthRetryHint(
  data: ModularLongStepData,
): string {
  const len = assembledLongCharCount(data);
  return [
    `STRICT RETRY — LENGTH FAILURE: previous assembled output was ${len} characters.`,
    `You MUST return hook + features + closing totaling at least ${MODULAR_LONG_MIN_CHARS} characters (target ${MODULAR_LONG_TARGET_MIN_CHARS}–${MODULAR_LONG_TARGET_MAX_CHARS}).`,
    `Expand the features block with 10–14 emoji section headers and multi-line bullets grounded in APP CONTEXT.`,
    `Each block must be substantive — do not return thin placeholder copy.`,
  ].join(" ");
}

export function formatModularShortValidationRetryHint(error: z.ZodError): string {
  const issues = error.issues
    .map((issue) => issue.message)
    .filter(Boolean)
    .slice(0, 6);
  return [
    "STRICT RETRY — SHORT DESCRIPTION VALIDATION FAILED:",
    ...issues,
    "Each variation must be ≤80 chars, grammatically complete, and end with . ! ? or ؟.",
    "Rewrite for brevity instead of truncating mid-word or mid-sentence.",
  ].join("\n");
}
