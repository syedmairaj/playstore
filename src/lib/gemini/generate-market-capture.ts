import "server-only";
import { SchemaType } from "@/lib/ai/schema-types";
import { checkFinishReason, extractText, isBlockedFinishReason } from "@/lib/ai/extract-model-text";
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import { parseGeminiJsonText } from "@/lib/gemini/parse-gemini-json-response";
import {
  assembleMarketCaptureReport,
} from "@/lib/market-capture/market-capture-engine";
import type { MarketCaptureContext } from "@/lib/market-capture/market-capture.types";
import { buildMarketCaptureMessages } from "@/lib/market-capture/market-capture-prompt";
import { marketCaptureModelOutputSchema } from "@/lib/validation/market-capture-output";
import type { MarketCaptureReport } from "@/lib/market-capture/market-capture.types";

const FIELD_PROPOSAL_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    value: { type: SchemaType.STRING },
    rationale: { type: SchemaType.STRING },
    charCount: { type: SchemaType.INTEGER },
    keywordDensityPercent: { type: SchemaType.NUMBER },
  },
  required: ["value", "rationale", "charCount"],
};

const VERSION_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    strategy: { type: SchemaType.STRING },
    label: { type: SchemaType.STRING },
    title: FIELD_PROPOSAL_SCHEMA,
    shortDescription: FIELD_PROPOSAL_SCHEMA,
    fullDescription: FIELD_PROPOSAL_SCHEMA,
    whatsNew: FIELD_PROPOSAL_SCHEMA,
  },
  required: ["strategy", "label", "title", "shortDescription", "fullDescription"],
};

const MARKET_CAPTURE_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    versionA: VERSION_SCHEMA,
    versionB: VERSION_SCHEMA,
  },
  required: ["versionA", "versionB"],
};

export async function generateMarketCaptureWithGemini(
  ctx: MarketCaptureContext,
): Promise<MarketCaptureReport> {
  const { system, user } = buildMarketCaptureMessages(ctx);
  const model = getGenerativeModel();
  model.systemInstruction = system;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: MARKET_CAPTURE_RESPONSE_SCHEMA,
      temperature: 0.35,
      topP: 0.95,
      maxOutputTokens: 16_384,
    },
  });

  const finish = checkFinishReason(result);
  const finishReason = finish.finishReason;
  const truncated = finish.truncated;

  if (!finish.ok && finish.blocked && isBlockedFinishReason(finishReason)) {
    throw new InvalidModelOutputError(
      `Market Capture model response blocked (${finishReason ?? "unknown"}).`,
      { finishReason },
    );
  }

  if (truncated) {
    console.warn("[market-capture] Output truncated — attempting JSON recovery", {
      finishReason,
    });
  }

  const rawText = extractText(result);
  if (!rawText.trim()) {
    throw new InvalidModelOutputError("Market Capture model returned empty response.", {
      truncated,
      finishReason,
    });
  }

  const jsonParse = parseGeminiJsonText(rawText, { truncated, finishReason });
  if (!jsonParse.ok) {
    throw new InvalidModelOutputError(
      jsonParse.reason === "truncated"
        ? "Market Capture output was truncated mid-JSON."
        : "Market Capture model returned malformed JSON.",
      { truncated: jsonParse.reason === "truncated", finishReason },
    );
  }

  const parsed = jsonParse.value;

  const validated = marketCaptureModelOutputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new InvalidModelOutputError(
      "Market Capture output failed schema validation.",
      { zodError: validated.error, truncated, finishReason },
    );
  }

  return assembleMarketCaptureReport(ctx, validated.data);
}
