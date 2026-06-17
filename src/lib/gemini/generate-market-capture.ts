import "server-only";
import { SchemaType } from "@/lib/ai/schema-types";
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
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
      maxOutputTokens: 8192,
    },
  });

  const rawText = result.text?.trim() ?? "";
  if (!rawText) {
    throw new InvalidModelOutputError("Market Capture model returned empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new InvalidModelOutputError("Market Capture model returned malformed JSON.");
  }

  const validated = marketCaptureModelOutputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new InvalidModelOutputError(
      "Market Capture output failed schema validation.",
      validated.error,
    );
  }

  return assembleMarketCaptureReport(ctx, validated.data);
}
