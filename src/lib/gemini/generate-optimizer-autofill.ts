import "server-only";
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import { logGeminiOptimizerAutofillDebugError } from "@/lib/gemini/log-gemini-env";

export type OptimizerAutofillField = "keywords" | "features";

/** Strip control chars and collapse whitespace for safe prompt interpolation. */
function sanitizeOptimizerPromptContext(
  value: string,
  maxLen: number,
): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function stripCodeFences(text: string): string {
  const t = text.trim();
  if (t.startsWith("```")) {
    return t.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  return t;
}

/**
 * Keywords autofill: normalize model output to comma-separated terms (matches
 * `listingOptimizerRequestSchema` which accepts comma/newline-separated input).
 */
function normalizeKeywordsOutput(raw: string): string {
  const cleaned = stripCodeFences(raw);
  return cleaned
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}

function normalizeFeaturesOutput(raw: string): string {
  return stripCodeFences(raw).replace(/\s+\n/g, "\n").trim();
}

function keywordsSystemInstruction(appName: string, category: string): string {
  return `You are an expert Google Play ASO keyword researcher. Based on App Name: ${appName} and Category: ${category}, generate 8-12 high-intent, high-volume, low-competition keywords. Return as comma-separated list. Support English and Arabic if requested.`;
}

function featuresSystemInstruction(appName: string, category: string): string {
  return `You are an expert Google Play conversion copywriter. Based on App Name: ${appName} and Category: ${category}, generate 6-8 powerful feature-benefit bullets. Make it compelling and conversion-focused. Support English and Arabic if requested.`;
}

function languagePreferenceHint(language: "en" | "ar"): string {
  if (language === "ar") {
    return " Preferred output: Arabic (Modern Standard Arabic suitable for Google Play in MENA), unless the app name is a global brand that should stay Latin.";
  }
  return " Preferred output: English, unless the app clearly targets Arabic-only users.";
}

export async function generateOptimizerAutofillWithGemini(input: {
  appName: string;
  category: string;
  field: OptimizerAutofillField;
  language?: "en" | "ar";
}): Promise<string> {
  const apiKey = assertGeminiApiKey();
  const modelName = resolveGeminiModel();
  const appName = sanitizeOptimizerPromptContext(input.appName, 200);
  const category = sanitizeOptimizerPromptContext(input.category, 120);
  const language: "en" | "ar" = input.language === "ar" ? "ar" : "en";

  const systemInstruction =
    (input.field === "keywords"
      ? keywordsSystemInstruction(appName, category)
      : featuresSystemInstruction(appName, category)) +
    languagePreferenceHint(language);

  const userPrompt =
    input.field === "keywords"
      ? "Respond with only the comma-separated keyword list. No bullets, numbering, markdown, or extra commentary."
      : "Respond with plain text only: your 6-8 points, one per line. No markdown headings or code fences.";

  try {
    // ✅ REFACTORED: Use centralized Vertex AI gateway (no API key needed)
    const model = getGenerativeModel();
    model.systemInstruction = systemInstruction;

    const result = await model.generateContent(userPrompt);
    const text = result.response.text();
    if (!text?.trim()) {
      throw new Error("Model returned empty text");
    }

    return input.field === "keywords"
      ? normalizeKeywordsOutput(text)
      : normalizeFeaturesOutput(text);
  } catch (error: unknown) {
    logGeminiOptimizerAutofillDebugError(error);
    throw error;
  }
}
