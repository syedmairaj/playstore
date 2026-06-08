import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  assertGeminiApiKey,
  mergeGeminiGenerationConfig,
  resolveGeminiModel,
} from "@/lib/gemini/gemini-defaults";
import type { GeminiUsageCounts } from "@/lib/gemini/pricing";
import { parseGeminiUsageMetadata } from "@/lib/gemini/pricing";

function sanitize(value: string, maxLen: number): string {
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

const LANGUAGE_LABEL: Record<"en" | "ar" | "hi", string> = {
  en: "English",
  ar: "Arabic",
  hi: "Hindi",
};

export type ReviewReplyDraftResult = {
  reply: string;
  usage: GeminiUsageCounts | null;
};

export async function generateReviewReplyDraft(input: {
  reviewText: string;
  rating: number;
  replyLanguage: "en" | "ar" | "hi";
  appName?: string;
  userName?: string;
}): Promise<ReviewReplyDraftResult> {
  const apiKey = assertGeminiApiKey();
  const modelName = resolveGeminiModel();
  const lang = LANGUAGE_LABEL[input.replyLanguage];
  const appLabel = input.appName?.trim()
    ? sanitize(input.appName, 120)
    : "the app";
  const reviewer = input.userName?.trim()
    ? sanitize(input.userName, 80)
    : "the reviewer";

  const systemInstruction = [
    "You are a professional Google Play developer replying publicly to a user review.",
    `Write ONLY the reply body in ${lang} — no subject line, quotes, markdown, or meta commentary.`,
    "Be empathetic, concise (2–4 sentences), and policy-safe. Acknowledge specifics from the review.",
    "Do not promise exact dates unless the review already mentions a timeline. Do not ask for email or PII.",
    `App: ${appLabel}. Reviewer display name (optional greeting): ${reviewer}. Star rating: ${input.rating}/5.`,
  ].join(" ");

  const userPrompt = `Review text:\n${sanitize(input.reviewText, 4000)}\n\nOutput the developer reply in ${lang} only.`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction,
    generationConfig: mergeGeminiGenerationConfig({
      maxOutputTokens: 512,
    }),
  });

  const result = await model.generateContent(userPrompt);
  const text = result.response.text();
  if (!text?.trim()) {
    throw new Error("Model returned empty text");
  }

  const usageMeta = result.response.usageMetadata;
  const usage = parseGeminiUsageMetadata(usageMeta ?? null);

  return {
    reply: stripCodeFences(text).trim().slice(0, 2000),
    usage,
  };
}
