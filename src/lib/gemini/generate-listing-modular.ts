import "server-only";
import { SchemaType } from "@/lib/ai/schema-types";
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import { checkFinishReason, extractText } from "@/lib/ai/extract-model-text";
import { parseGeminiJsonText } from "@/lib/gemini/parse-gemini-json-response";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import {
  buildModularFinalizeExtrasMessages,
  buildModularLongMessages,
  buildModularShortMessages,
  buildModularTitleMessages,
  type LongBlockId,
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
  tryParseListingAsoBundle,
  type ListingGenerationOutput,
} from "@/lib/validation/listing-output";
import { z } from "zod";
import {
  normalizeModularLongParsed,
  normalizeModularShortParsed,
  normalizeModularTitleParsed,
} from "@/lib/gemini/normalize-modular-parsed";

const MODULAR_MAX_OUTPUT_TOKENS = 8_192;

async function callModularJson<T>(
  messages: { system: string; user: string },
  responseSchema: Record<string, unknown>,
  normalize: (parsed: unknown) => T,
  validate: (value: T) => z.SafeParseReturnType<T, T>,
  stepLabel: string,
): Promise<T> {
  const model = getGenerativeModel();
  model.systemInstruction = messages.system;

  let lastZodError: z.ZodError | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const userText =
      attempt === 0
        ? messages.user
        : `${messages.user}\n\nSTRICT RETRY: Return ONLY the exact JSON shape for ${stepLabel}. No orchestration wrapper, no extra keys.`;

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

    const parsed = parseGeminiJsonText(text);
    const normalized = normalize(parsed);
    const validated = validate(normalized);
    if (validated.success) {
      return validated.data;
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
  const model = getGenerativeModel();
  model.systemInstruction = messages.system;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: messages.user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: SHORT_RESPONSE_SCHEMA,
        maxOutputTokens: MODULAR_MAX_OUTPUT_TOKENS,
        temperature: 0.35,
        topP: 0.95,
      },
    });

    const finishReason = checkFinishReason(result);
    const text = extractText(result);
    if (!text?.trim()) {
      throw new InvalidModelOutputError("Model returned empty modular short JSON", {
        finishReason,
      });
    }

    const parsed = parseGeminiJsonText(text);
    const normalized = normalizeModularShortParsed(parsed);
    const validated = shortDescriptionZodSchema.safeParse(normalized);
    if (!validated.success) {
      throw new InvalidModelOutputError("Modular short description failed validation", {
        zodError: validated.error,
      });
    }
    return validated.data;
  } catch (error) {
    if (error instanceof InvalidModelOutputError) {
      throw error;
    }
    throw new InvalidModelOutputError(
      error instanceof Error ? error.message : "Modular short generation failed",
    );
  }
}

const LONG_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    hook: { type: SchemaType.STRING },
    features: { type: SchemaType.STRING },
    closing: { type: SchemaType.STRING },
  },
  required: ["hook", "features", "closing"],
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
  const data = await callModularJson(
    messages,
    LONG_RESPONSE_SCHEMA,
    (parsed) => normalizeModularLongParsed(parsed),
    (value) => modularLongStepOutputSchema.safeParse(value),
    block ? `long-${block}` : "long",
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

  if (!block) {
    if (!data.hook.trim() || !data.features.trim() || !data.closing.trim()) {
      throw new InvalidModelOutputError(
        "Modular long description returned empty hook, features, or closing block",
        {},
      );
    }
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

  const parsed = parseGeminiJsonText(text);
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
