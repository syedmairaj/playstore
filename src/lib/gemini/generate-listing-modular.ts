import "server-only";
import { SchemaType } from "@/lib/ai/schema-types";
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import { checkFinishReason, extractText } from "@/lib/ai/extract-model-text";
import { robustParseJson } from "@/lib/utils/json-repair";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import {
  buildModularFinalizeExtrasMessages,
  buildModularLongFeaturesOnlyMessages,
  buildModularLongHookClosingMessages,
  buildModularLongMessages,
  buildModularShortMessages,
  buildModularTitleMessages,
  type LongBlockId,
  type ModularLongPromptOptions,
} from "@/lib/prompts/listing-modular";
import type {
  ModularLongStepData,
  ModularShortStepData,
  ModularTitleStepData,
} from "@/lib/listing/modular-listing.types";
import {
  modularLongStepOutputSchema,
  modularTitleStepSchema as modularTitleStepZodSchema,
  shortDescriptionSchema as shortDescriptionZodSchema,
} from "@/lib/listing/modular-listing.types";
import {
  formatModularShortValidationRetryHint,
  modularLongFeaturesArraySchema,
  modularLongFeaturesSectionsToText,
} from "@/lib/listing/modular-output-validation";
import {
  tryParseListingAsoBundle,
  type ListingGenerationOutput,
} from "@/lib/validation/listing-output";
import { z } from "zod";
import {
  normalizeModularLongParsed,
  normalizeModularShortParsed,
  normalizeModularTitleParsed,
} from "@/lib/gemini/normalize-modular-parsed";
import { safeAssemble } from "@/lib/listing/listing-assembler";
import { runGranularModularLongGeneration } from "@/lib/listing/modular-long-granular-generation";

const MODULAR_MAX_OUTPUT_TOKENS = 8_192;
const MODULAR_SHORT_MAX_ATTEMPTS = 4;

async function callModularJson<T>(
  messages: { system: string; user: string },
  responseSchema: Record<string, unknown>,
  normalize: (parsed: unknown) => T,
  validate: (value: T) => z.SafeParseReturnType<T, T>,
  stepLabel: string,
  postValidate?: (value: T) => void,
): Promise<T> {
  const model = getGenerativeModel();
  model.systemInstruction = messages.system;

  let lastZodError: z.ZodError | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const userText =
      attempt === 0
        ? messages.user
        : `${messages.user}\n\nSTRICT RETRY: Return ONLY the exact JSON shape for ${stepLabel}. No orchestration wrapper, no extra keys. Honor all length and grammatical completion rules.`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
        maxOutputTokens: MODULAR_MAX_OUTPUT_TOKENS,
        temperature: attempt === 0 ? 0.35 : 0.2,
        topP: 0.95,
      },
    });

    const finishReason = checkFinishReason(result);
    const text = extractText(result);
    if (!text?.trim()) {
      if (attempt === 1) {
        throw new InvalidModelOutputError("Model returned empty modular JSON", {
          finishReason,
        });
      }
      continue;
    }

    const parsed = robustParseJson(text);
    if (parsed === null) {
      if (attempt === 1) {
        throw new InvalidModelOutputError("Model returned unparseable modular JSON", {
          finishReason,
        });
      }
      continue;
    }
    const normalized = normalize(parsed);
    const validated = validate(normalized);
    if (validated.success) {
      try {
        postValidate?.(validated.data);
        return validated.data;
      } catch (postError) {
        if (postError instanceof z.ZodError) {
          lastZodError = postError;
          continue;
        }
        throw postError;
      }
    }
    lastZodError = validated.error;

    if (process.env.NODE_ENV !== "production" || process.env.DEBUG_GEMINI === "1") {
      console.warn(`[listing-modular/${stepLabel}] validation failed`, {
        attempt,
        preview: text.slice(0, 400),
        issues: validated.error.flatten(),
      });
    }
  }

  throw new InvalidModelOutputError("Modular JSON failed validation", {
    zodError: lastZodError,
  });
}

const TITLE_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING },
    lockedKeywords: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
  required: ["title", "lockedKeywords"],
};

const SHORT_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    variations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["growth", "conversion", "utility"],
          },
          text: { type: SchemaType.STRING },
        },
        required: ["type", "text"],
      },
    },
  },
  required: ["variations"],
};

async function callModularShortJson(
  messages: { system: string; user: string },
): Promise<z.infer<typeof shortDescriptionZodSchema>> {
  const candidate = await fetchModularShortModelOutput(messages);
  if (candidate.parseFailed) {
    throw new InvalidModelOutputError("Model returned unparseable modular short JSON", {
      finishReason: candidate.finishReason,
    });
  }
  if (candidate.validated?.success) {
    return candidate.validated.data;
  }
  throw new InvalidModelOutputError("Modular short description failed validation", {
    zodError: candidate.lastZodError,
  });
}

export type ModularShortRawResult = {
  rawText: string;
  parsed: unknown | null;
  finishReason?: string;
};

/** Single Gemini call for short phase — parsing delegated to orchestrator defensive loop. */
export async function invokeModularShortGeneration(
  messages: { system: string; user: string },
  userSuffix = "",
): Promise<ModularShortRawResult> {
  const model = getGenerativeModel();
  model.systemInstruction = messages.system;

  const userText = userSuffix ? `${messages.user}\n\n${userSuffix}` : messages.user;
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: SHORT_RESPONSE_SCHEMA,
      maxOutputTokens: MODULAR_MAX_OUTPUT_TOKENS,
      temperature: 0.35,
      topP: 0.95,
    },
  });

  const finishReason = checkFinishReason(result);
  const rawText = extractText(result);
  const parsed = rawText?.trim() ? robustParseJson(rawText) : null;

  return {
    rawText: rawText ?? "",
    parsed,
    finishReason: finishReason.finishReason,
  };
}

export type ModularShortModelOutput = {
  normalized: ReturnType<typeof normalizeModularShortParsed>;
  validated: z.SafeParseReturnType<
    z.infer<typeof shortDescriptionZodSchema>,
    z.infer<typeof shortDescriptionZodSchema>
  > | null;
  lastZodError?: z.ZodError;
  parseFailed: boolean;
  finishReason?: string;
  rawRecovered: boolean;
};

/** Gemini short step — returns best-effort parse + validation for orchestrator repair. */
export async function fetchModularShortModelOutput(
  messages: { system: string; user: string },
): Promise<ModularShortModelOutput> {
  const model = getGenerativeModel();
  model.systemInstruction = messages.system;

  let lastZodError: z.ZodError | undefined;
  let lastNormalized: ReturnType<typeof normalizeModularShortParsed> = { variations: [] };
  let lastFinishReason: string | undefined;
  let rawRecovered = false;

  for (let attempt = 0; attempt < MODULAR_SHORT_MAX_ATTEMPTS; attempt += 1) {
    const retryHint =
      attempt > 0 && lastZodError
        ? `\n\n${formatModularShortValidationRetryHint(lastZodError)}`
        : attempt > 0
          ? "\n\nSTRICT RETRY: Each variation must be ≤80 chars, grammatically complete, ending with . ! ? or ؟ — rewrite for brevity instead of truncating."
          : "";
    const userText = `${messages.user}${retryHint}`;

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SHORT_RESPONSE_SCHEMA,
          maxOutputTokens: MODULAR_MAX_OUTPUT_TOKENS,
          temperature: attempt === 0 ? 0.35 : Math.max(0.15, 0.35 - attempt * 0.05),
          topP: 0.95,
        },
      });

      const finishReason = checkFinishReason(result);
      lastFinishReason = finishReason.finishReason;
      const text = extractText(result);
      if (!text?.trim()) {
        if (attempt === MODULAR_SHORT_MAX_ATTEMPTS - 1) {
          return {
            normalized: lastNormalized,
            validated: null,
            lastZodError,
            parseFailed: true,
            finishReason: lastFinishReason,
            rawRecovered,
          };
        }
        continue;
      }

      const parsed = robustParseJson(text);
      if (parsed === null) {
        if (attempt === MODULAR_SHORT_MAX_ATTEMPTS - 1) {
          return {
            normalized: lastNormalized,
            validated: null,
            lastZodError,
            parseFailed: true,
            finishReason: lastFinishReason,
            rawRecovered,
          };
        }
        continue;
      }

      rawRecovered = true;
      lastNormalized = normalizeModularShortParsed(parsed);
      const validated = shortDescriptionZodSchema.safeParse(lastNormalized);
      if (validated.success) {
        return {
          normalized: lastNormalized,
          validated,
          parseFailed: false,
          finishReason: lastFinishReason,
          rawRecovered,
        };
      }
      lastZodError = validated.error;

      if (process.env.NODE_ENV !== "production" || process.env.DEBUG_GEMINI === "1") {
        console.warn("[listing-modular/short] validation failed", {
          attempt,
          preview: text.slice(0, 400),
          issues: validated.error.flatten(),
        });
      }
    } catch (error) {
      if (error instanceof InvalidModelOutputError) {
        if (attempt === MODULAR_SHORT_MAX_ATTEMPTS - 1) {
          return {
            normalized: lastNormalized,
            validated: null,
            lastZodError,
            parseFailed: true,
            finishReason: lastFinishReason,
            rawRecovered,
          };
        }
        continue;
      }
      throw new InvalidModelOutputError(
        error instanceof Error ? error.message : "Modular short generation failed",
      );
    }
  }

  const validated = lastZodError
    ? shortDescriptionZodSchema.safeParse(lastNormalized)
    : null;

  return {
    normalized: lastNormalized,
    validated: validated?.success ? validated : null,
    lastZodError,
    parseFailed: false,
    finishReason: lastFinishReason,
    rawRecovered,
  };
}

const LONG_FEATURE_SECTION_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    label: { type: SchemaType.STRING },
    bullets: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: ["label", "bullets"],
};

const LONG_FEATURES_ONLY_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    features: {
      type: SchemaType.ARRAY,
      items: LONG_FEATURE_SECTION_SCHEMA,
    },
  },
  required: ["features"],
};

const LONG_HOOK_CLOSING_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    hook: { type: SchemaType.STRING },
    closing: { type: SchemaType.STRING },
  },
  required: ["hook", "closing"],
};

function parseFeaturesSections(parsed: unknown): Array<{ label: string; bullets: string[] }> {
  const root = parsed as Record<string, unknown>;
  if (!Array.isArray(root.features)) return [];
  return root.features
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const label = typeof item.label === "string" ? item.label.trim() : "";
      const bullets = Array.isArray(item.bullets)
        ? item.bullets
            .filter((b): b is string => typeof b === "string")
            .map((b) => b.trim())
            .filter(Boolean)
        : [];
      if (!label || bullets.length === 0) return null;
      return { label, bullets };
    })
    .filter((row): row is { label: string; bullets: string[] } => row !== null);
}

/** Granular call 1 — features array only. */
export async function generateListingLongFeaturesWithGemini(
  input: ListingOptimizerInput,
  context: { title: string; shortDescription: string },
  lockedKeywords: string[],
  options?: ModularLongPromptOptions,
): Promise<string> {
  const reduced = options?.reducedComplexity === true;
  const messages = buildModularLongFeaturesOnlyMessages(
    input,
    context,
    lockedKeywords,
    options,
  );
  const model = getGenerativeModel();
  model.systemInstruction = messages.system;

  let lastZodError: z.ZodError | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retryHint =
      attempt > 0
        ? `\n\nSTRICT RETRY: Return ONLY {"features":[...]}. Complete the array — no truncation.${reduced ? " Use 4–6 sections, 2 bullets each." : ""}`
        : "";
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: `${messages.user}${retryHint}` }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: LONG_FEATURES_ONLY_SCHEMA,
        maxOutputTokens: MODULAR_MAX_OUTPUT_TOKENS,
        temperature: attempt === 0 ? 0.35 : 0.2,
        topP: 0.95,
      },
    });

    const finishReason = checkFinishReason(result);
    const text = extractText(result);
    if (!text?.trim()) continue;

    const parsed = robustParseJson(text);
    if (parsed === null) continue;

    const sections = parseFeaturesSections(parsed);
    const validated = modularLongFeaturesArraySchema(reduced).safeParse(sections);
    if (!validated.success) {
      lastZodError = validated.error;
      continue;
    }

    const featuresText = modularLongFeaturesSectionsToText(validated.data);
    if (!featuresText.trim()) continue;
    return featuresText;
  }

  throw new InvalidModelOutputError("Modular long features array failed validation", {
    zodError: lastZodError,
  });
}

/** Granular call 2 — hook and closing only (features body supplied as anchor). */
export async function generateListingLongHookClosingWithGemini(
  input: ListingOptimizerInput,
  context: { title: string; shortDescription: string },
  featuresBody: string,
  lockedKeywords: string[],
  options?: ModularLongPromptOptions,
): Promise<{ hook: string; closing: string }> {
  const messages = buildModularLongHookClosingMessages(
    input,
    context,
    featuresBody,
    lockedKeywords,
    options,
  );

  const data = await callModularJson(
    messages,
    LONG_HOOK_CLOSING_SCHEMA,
    (parsed) => {
      const normalized = normalizeModularLongParsed(parsed);
      return { hook: normalized.hook, closing: normalized.closing };
    },
    (value) =>
      z
        .object({
          hook: z.string().trim().max(4000),
          closing: z.string().trim().max(4000),
        })
        .safeParse(value),
    "long-hook-closing",
  );

  return data;
}

const LONG_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    features: {
      type: SchemaType.ARRAY,
      items: LONG_FEATURE_SECTION_SCHEMA,
    },
    hook: { type: SchemaType.STRING },
    closing: { type: SchemaType.STRING },
  },
  required: ["features", "hook", "closing"],
};

export async function generateListingTitleWithGemini(
  input: ListingOptimizerInput,
  lockedKeywords: string[],
): Promise<ModularTitleStepData> {
  const fallbackLocked =
    lockedKeywords.length > 0 ? lockedKeywords : input.targetKeywords;
  const messages = buildModularTitleMessages(input, fallbackLocked);
  const data = await callModularJson(
    messages,
    TITLE_RESPONSE_SCHEMA,
    (parsed) => normalizeModularTitleParsed(parsed, fallbackLocked),
    (value) => modularTitleStepZodSchema.safeParse(value),
    "title",
  );
  return {
    title: data.title.slice(0, 30),
    lockedKeywords: data.lockedKeywords,
  };
}

export async function generateListingShortWithGemini(
  input: ListingOptimizerInput,
  contextTitle: string,
  lockedKeywords?: string[],
): Promise<ModularShortStepData> {
  const locked =
    lockedKeywords && lockedKeywords.length > 0
      ? lockedKeywords
      : input.targetKeywords.slice(0, 20);
  const messages = buildModularShortMessages(input, contextTitle, locked);
  const data = await callModularShortJson(messages);
  return { variations: data.variations };
}

export async function generateListingLongWithGemini(
  input: ListingOptimizerInput,
  context: { title: string; shortDescription: string },
  block?: LongBlockId,
  existing?: Partial<ModularLongStepData>,
  lockedKeywords?: string[],
): Promise<ModularLongStepData> {
  const locked =
    lockedKeywords && lockedKeywords.length > 0
      ? lockedKeywords
      : input.targetKeywords.slice(0, 20);
  const messages = buildModularLongMessages(input, context, block, locked);

  if (!block) {
    const raw = await runGranularModularLongGeneration(input, context, locked);
    return safeAssemble(raw, { targetArabic: input.targetArabic ?? false }).data;
  }

  const data = await callModularJson(
    messages,
    LONG_RESPONSE_SCHEMA,
    (parsed) => normalizeModularLongParsed(parsed),
    (value) => modularLongStepOutputSchema.safeParse(value),
    `long-${block}`,
  );
  if (block && existing) {
    const merged = {
      hook: block === "hook" ? data.hook : (existing.hook ?? ""),
      features: block === "features" ? data.features : (existing.features ?? ""),
      closing: block === "closing" ? data.closing : (existing.closing ?? ""),
    };
    if (!merged[block]?.trim()) {
      throw new InvalidModelOutputError(`Modular long block "${block}" was empty`, {});
    }
    return merged;
  }

  return {
    hook: data.hook,
    features: data.features,
    closing: data.closing,
  };
}

const EXTRAS_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    keywordSuggestions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    ctaSuggestions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    asoScore: { type: SchemaType.INTEGER },
    scoreBreakdown: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.INTEGER },
        shortDescription: { type: SchemaType.INTEGER },
        longDescription: { type: SchemaType.INTEGER },
        persuasiveness: { type: SchemaType.INTEGER },
      },
    },
    improvementTips: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
};

export async function generateListingFinalizeExtrasWithGemini(
  input: ListingOptimizerInput,
  copy: { title: string; shortDescription: string; fullDescription: string },
): Promise<Partial<ListingGenerationOutput>> {
  const messages = buildModularFinalizeExtrasMessages(input, copy);
  const model = getGenerativeModel();
  model.systemInstruction = messages.system;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: messages.user }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: EXTRAS_RESPONSE_SCHEMA,
      maxOutputTokens: MODULAR_MAX_OUTPUT_TOKENS,
      temperature: 0.5,
      topP: 0.9,
    },
  });

  const text = extractText(result);
  if (!text?.trim()) return {};

  const parsed = robustParseJson(text);
  if (parsed === null) return {};
  const asoTry = tryParseListingAsoBundle(parsed);
  if (asoTry.ok) {
    return {
      keywordSuggestions: Array.isArray((parsed as { keywordSuggestions?: unknown }).keywordSuggestions)
        ? ((parsed as { keywordSuggestions: string[] }).keywordSuggestions ?? []).slice(0, 30)
        : input.targetKeywords.slice(0, 20),
      ctaSuggestions: Array.isArray((parsed as { ctaSuggestions?: unknown }).ctaSuggestions)
        ? ((parsed as { ctaSuggestions: string[] }).ctaSuggestions ?? []).slice(0, 10)
        : [],
      asoScore: asoTry.value.asoScore,
      scoreBreakdown: asoTry.value.scoreBreakdown,
      improvementTips: asoTry.value.improvementTips,
    };
  }

  return {
    keywordSuggestions: input.targetKeywords.slice(0, 20),
    ctaSuggestions: [],
  };
}
