import "server-only";
import { z } from "zod";

/** Gemini `responseSchema` for listing localization (REST generateContent). */
export const LOCALIZE_LISTING_GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    shortDescription: { type: "STRING" },
    longDescription: { type: "STRING" },
    keywords: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
  required: ["title", "shortDescription", "longDescription", "keywords"],
} as const;

export type GeminiGenerateContentJsonResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{ text?: string; thought?: boolean }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    thoughtsTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

export const localizedListingFieldsSchema = z.object({
  title: z.string().min(1),
  shortDescription: z.string().min(1),
  longDescription: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
});

export type LocalizedListingFields = z.infer<typeof localizedListingFieldsSchema>;

export type LocalizeGeminiFailureReason =
  | "empty"
  | "parse"
  | "max_tokens"
  | "validation"
  | "http";

export type LocalizeGeminiCallResult =
  | {
      ok: true;
      data: LocalizedListingFields;
      usage: GeminiGenerateContentJsonResponse["usageMetadata"];
    }
  | { ok: false; reason: LocalizeGeminiFailureReason; message: string };

const JSON_PARSE_ERROR =
  /JSON|Unexpected token|Unterminated string|Unexpected end/i;

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/** Joins non-thought text parts from the first candidate. */
export function extractGeminiCandidateText(
  data: GeminiGenerateContentJsonResponse,
): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!parts?.length) {
    return "";
  }

  const chunks: string[] = [];
  for (const part of parts) {
    if (!part || typeof part.text !== "string") continue;
    if (part.thought === true) continue;
    const trimmed = part.text.trim();
    if (trimmed) chunks.push(trimmed);
  }

  if (chunks.length === 0) return "";
  // Structured JSON is a single payload; prefer the last non-thought part.
  return chunks[chunks.length - 1]!;
}

export function getGeminiCandidateFinishReason(
  data: GeminiGenerateContentJsonResponse,
): string | undefined {
  return data?.candidates?.[0]?.finishReason;
}

export function wasGeminiOutputTruncated(
  data: GeminiGenerateContentJsonResponse,
): boolean {
  const reason = getGeminiCandidateFinishReason(data);
  return reason === "MAX_TOKENS" || reason === "LENGTH";
}

/**
 * Output token budget for localization. Arabic and other scripts need headroom;
 * gemini-2.5-flash may spend thinking tokens against `maxOutputTokens` unless
 * `thinkingBudget` is 0.
 */
export function resolveLocalizeMaxOutputTokens(
  sourceLongChars: number,
  isRetry: boolean,
): number {
  const source = Math.min(Math.max(sourceLongChars, 0), 4000);
  const estimated = 512 + Math.ceil(source * 1.25) + 256;
  const firstPass = Math.min(8192, Math.max(2048, estimated));
  if (!isRetry) return firstPass;
  return Math.min(8192, Math.max(firstPass + 1024, firstPass * 2));
}

export function parseGeminiCandidateJson<T>(
  data: GeminiGenerateContentJsonResponse,
): T {
  const jsonText = stripCodeFences(extractGeminiCandidateText(data));
  if (!jsonText) {
    throw new Error("Gemini returned empty text");
  }
  if (wasGeminiOutputTruncated(data)) {
    throw new Error(
      `Gemini output truncated (${getGeminiCandidateFinishReason(data) ?? "unknown"})`,
    );
  }
  try {
    return JSON.parse(jsonText) as T;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON from Gemini: ${detail}`);
  }
}

function clampLocalizedFields(data: LocalizedListingFields): LocalizedListingFields {
  return {
    title:
      data.title.length > 30 ? data.title.slice(0, 30).trimEnd() : data.title,
    shortDescription:
      data.shortDescription.length > 80
        ? data.shortDescription.slice(0, 80).trimEnd()
        : data.shortDescription,
    longDescription:
      data.longDescription.length > 4000
        ? data.longDescription.slice(0, 4000).trimEnd()
        : data.longDescription,
    keywords: data.keywords,
  };
}

function parseAndValidateLocalizedListing(
  data: GeminiGenerateContentJsonResponse,
): LocalizedListingFields {
  const raw = parseGeminiCandidateJson<unknown>(data);
  const validated = localizedListingFieldsSchema.safeParse(raw);
  if (!validated.success) {
    throw new Error(
      validated.error.errors[0]?.message ?? "Localized listing failed validation",
    );
  }
  return clampLocalizedFields(validated.data);
}

function classifyGeminiLocalizeError(err: unknown): {
  reason: LocalizeGeminiFailureReason;
  message: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("truncated") || message.includes("MAX_TOKENS")) {
    return { reason: "max_tokens", message };
  }
  if (JSON_PARSE_ERROR.test(message) || message.includes("Invalid JSON")) {
    return { reason: "parse", message };
  }
  if (message.includes("validation") || message.includes("Required")) {
    return { reason: "validation", message };
  }
  if (message.startsWith("Gemini ")) {
    return { reason: "http", message };
  }
  if (message.includes("empty")) {
    return { reason: "empty", message };
  }
  return { reason: "parse", message };
}

export async function callGeminiLocalizeListing(input: {
  geminiUrl: string;
  prompt: string;
  sourceLongChars: number;
}): Promise<LocalizeGeminiCallResult> {
  const attempts = [false, true] as const;

  for (let i = 0; i < attempts.length; i++) {
    const isRetry = attempts[i];
    const maxOutputTokens = resolveLocalizeMaxOutputTokens(
      input.sourceLongChars,
      isRetry,
    );

    let geminiRes: Response;
    try {
      geminiRes = await fetch(input.geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: input.prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens,
            responseMimeType: "application/json",
            responseSchema: LOCALIZE_LISTING_GEMINI_RESPONSE_SCHEMA,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: "http", message };
    }

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => "(unreadable)");
      return {
        ok: false,
        reason: "http",
        message: `Gemini ${geminiRes.status}: ${errBody}`,
      };
    }

    const geminiData =
      (await geminiRes.json()) as GeminiGenerateContentJsonResponse;

    try {
      const data = parseAndValidateLocalizedListing(geminiData);
      return { ok: true, data, usage: geminiData.usageMetadata };
    } catch (err) {
      const classified = classifyGeminiLocalizeError(err);
      const retryable =
        classified.reason === "parse" ||
        classified.reason === "max_tokens" ||
        classified.reason === "empty";

      if (!isRetry && retryable) {
        continue;
      }

      return { ok: false, reason: classified.reason, message: classified.message };
    }
  }

  return {
    ok: false,
    reason: "parse",
    message: "Localization failed after retry",
  };
}
