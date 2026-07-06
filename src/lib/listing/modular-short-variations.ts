import { z } from "zod";
import { isGrammaticallyCompleteShortText } from "@/lib/listing/modular-output-validation";

import { normalizeShortVariationText } from "@/lib/listing/modular-output-validation";

/** Canonical order for Phase 2 short-description variants. */
export const SHORT_VARIATION_TYPES = ["growth", "conversion", "utility"] as const;

export type ShortVariationType = (typeof SHORT_VARIATION_TYPES)[number];

export const shortVariationTypeSchema = z.enum(SHORT_VARIATION_TYPES);

export type ShortVariationItem = {
  type: ShortVariationType;
  text: string;
};

export const shortVariationItemSchema = z.object({
  type: shortVariationTypeSchema,
  text: z.string().trim().max(80),
});

/** Strict Gemini / API output — exactly 3 typed variations with non-empty text. */
export const shortDescriptionSchema = z
  .object({
    variations: z
      .array(
        shortVariationItemSchema.extend({
          text: z.string().trim().min(1).max(80),
        }),
      )
      .length(3),
  })
  .superRefine((data, ctx) => {
    const types = new Set(data.variations.map((v) => v.type));
    if (
      types.size !== 3 ||
      !SHORT_VARIATION_TYPES.every((type) => types.has(type))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "variations must include exactly one growth, conversion, and utility item",
        path: ["variations"],
      });
    }
    data.variations.forEach((variation, index) => {
      if (!isGrammaticallyCompleteShortText(variation.text)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `${variation.type}: text must be a grammatically complete sentence (≤80 chars, no truncated words or dangling fragments)`,
          path: ["variations", index, "text"],
        });
      }
    });
  });

export type ModularShortStepData = z.infer<typeof shortDescriptionSchema>;

const ORCHESTRATION_ID_BY_TYPE: Record<ShortVariationType, string> = {
  growth: "offensive",
  conversion: "defensive",
  utility: "primary",
};

const TYPE_BY_ORCHESTRATION_ID: Record<string, ShortVariationType> = {
  offensive: "growth",
  defensive: "conversion",
  primary: "utility",
};

export function shortVariationText(item: ShortVariationItem): string {
  return normalizeShortVariationText(item.text);
}

export function defaultShortVariationType(index: number): ShortVariationType {
  return SHORT_VARIATION_TYPES[Math.min(2, Math.max(0, index))] ?? "utility";
}

/** Coerce legacy `string[]` or partial objects into typed variation rows (draft ingress). */
export function coerceShortVariationsInput(val: unknown): ShortVariationItem[] {
  if (!Array.isArray(val)) return [];
  return val.map((item, index) => {
    const fallbackType = defaultShortVariationType(index);
    if (typeof item === "string") {
      return { type: fallbackType, text: normalizeShortVariationText(item) };
    }
    if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      const parsedType = shortVariationTypeSchema.safeParse(row.type);
      return {
        type: parsedType.success ? parsedType.data : fallbackType,
        text:
          typeof row.text === "string"
            ? normalizeShortVariationText(row.text)
            : "",
      };
    }
    return { type: fallbackType, text: "" };
  });
}

/** Sort variations into growth → conversion → utility order; fill missing types. */
export function orderShortVariations(items: ShortVariationItem[]): ShortVariationItem[] {
  const byType = new Map<ShortVariationType, ShortVariationItem>();
  for (const item of items) {
    if (item.text.trim()) {
      byType.set(item.type, {
        type: item.type,
        text: normalizeShortVariationText(item.text),
      });
    }
  }
  return SHORT_VARIATION_TYPES.map((type) => byType.get(type) ?? { type, text: "" });
}

export function orchestrationVariationIdForType(type: ShortVariationType): string {
  return ORCHESTRATION_ID_BY_TYPE[type];
}

export function shortVariationTypeFromOrchestrationId(
  variationId: string,
  index: number,
): ShortVariationType {
  const direct = shortVariationTypeSchema.safeParse(variationId);
  if (direct.success) return direct.data;
  return TYPE_BY_ORCHESTRATION_ID[variationId] ?? defaultShortVariationType(index);
}

/** Build Phase 2 variations from a full unlock response (no extra API round-trip). */
export function shortVariationsFromFullOutput(output: {
  title?: string;
  shortDescription?: string;
  orchestration?: {
    modules: {
      conversion: {
        shortVariations: Array<{ variationId: string; shortDescription: string }>;
      };
    };
  };
}): ShortVariationItem[] {
  const orch =
    output.orchestration?.modules?.conversion?.shortVariations;
  if (orch && orch.length > 0) {
    const fromOrch = orderShortVariations(
      orch.map((v, i) => ({
        type: shortVariationTypeFromOrchestrationId(v.variationId ?? "", i),
        text: normalizeShortVariationText(v.shortDescription ?? ""),
      })),
    );
    if (fromOrch.some((v) => v.text.trim())) {
      return fromOrch;
    }
  }

  const single = normalizeShortVariationText(output.shortDescription ?? "");
  if (!single) return [];

  return orderShortVariations(
    SHORT_VARIATION_TYPES.map((type) => ({ type, text: single })),
  );
}

export function zodErrorToFieldErrors(
  error: z.ZodError,
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
    if (!fieldErrors[key]) fieldErrors[key] = [];
    fieldErrors[key].push(issue.message);
  }
  return fieldErrors;
}
