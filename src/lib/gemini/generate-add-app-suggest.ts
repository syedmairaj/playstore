import "server-only";
import { getGenerativeModel } from "@/lib/ai/modelGateway";

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

function packageHints(pkg: string): string {
  const parts = pkg.split(".").filter(Boolean);
  if (parts.length < 2) return "";
  const tail = parts.slice(-2).join(" ");
  return `Package segments hint: ${tail}.`;
}

function appNameInstruction(ctx: {
  appName?: string;
  category?: string;
  packageName?: string;
}): string {
  const bits: string[] = [
    "You are a Google Play ASO naming expert. Propose ONE concise, brandable app display name (max 50 characters) that fits Google Play policies.",
  ];
  if (ctx.appName?.trim()) {
    bits.push(`Current draft name: "${sanitize(ctx.appName, 120)}". Improve or refine it; keep it distinct and memorable.`);
  }
  if (ctx.category?.trim()) {
    bits.push(`Category: ${sanitize(ctx.category, 120)}.`);
  }
  if (ctx.packageName?.trim()) {
    bits.push(packageHints(sanitize(ctx.packageName, 200)));
  }
  bits.push(
    "Respond with the suggested name only — no quotes, bullets, markdown, or extra words.",
  );
  return bits.join(" ");
}

function shortDescriptionInstruction(ctx: {
  appName?: string;
  category?: string;
  packageName?: string;
  shortDescriptionHint?: string;
}): string {
  const bits: string[] = [
    "You are a Google Play ASO copywriter. Write ONE store short description (max 80 characters) that is compelling, keyword-aware, and policy-safe.",
  ];
  if (ctx.appName?.trim()) {
    bits.push(`App name: ${sanitize(ctx.appName, 120)}.`);
  }
  if (ctx.category?.trim()) {
    bits.push(`Category: ${sanitize(ctx.category, 120)}.`);
  }
  if (ctx.packageName?.trim()) {
    bits.push(packageHints(sanitize(ctx.packageName, 200)));
  }
  if (ctx.shortDescriptionHint?.trim()) {
    bits.push(`User hint: ${sanitize(ctx.shortDescriptionHint, 500)}`);
  }
  bits.push(
    "Respond with the short description text only — no quotes, numbering, markdown, or character count labels.",
  );
  return bits.join(" ");
}

function normalizeAppName(raw: string): string {
  const oneLine = stripCodeFences(raw).split(/\n/)[0]?.trim() ?? "";
  return oneLine.slice(0, 120);
}

function normalizeShortDescription(raw: string): string {
  return stripCodeFences(raw).replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function generateAddAppFieldSuggest(input: {
  field: "app_name" | "short_description";
  context: {
    appName?: string;
    category?: string;
    packageName?: string;
    shortDescriptionHint?: string;
  };
}): Promise<string> {
  const apiKey = assertGeminiApiKey();
  const modelName = resolveGeminiModel();
  const systemInstruction =
    input.field === "app_name"
      ? appNameInstruction(input.context)
      : shortDescriptionInstruction(input.context);

  const userPrompt =
    input.field === "app_name"
      ? "Output only the single suggested app name."
      : "Output only the single suggested short description line.";

  // ✅ REFACTORED: Use centralized Vertex AI gateway (no API key needed)
  const model = getGenerativeModel({
    maxOutputTokens: 256,
  });
  model.systemInstruction = systemInstruction;

  const result = await model.generateContent(userPrompt);
  const text = result.response.text();
  if (!text?.trim()) {
    throw new Error("Model returned empty text");
  }

  return input.field === "app_name"
    ? normalizeAppName(text)
    : normalizeShortDescription(text);
}
