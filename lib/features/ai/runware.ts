import "server-only";

import { randomInt, randomUUID } from "node:crypto";

/** Runware REST base (POST JSON array of tasks). Override with `RUNWARE_API_URL` if needed. */
const DEFAULT_RUNWARE_API_URL = "https://api.runware.ai/v1";

/** FLUX.1 [schnell] — fast distilled model (see Runware model docs). */
const DEFAULT_RUNWARE_MODEL = "runware:100@1";

export class RunwareNotConfiguredError extends Error {
  readonly code = "logo_generation_unconfigured" as const;
  constructor(message = "RUNWARE_API_KEY is not configured") {
    super(message);
    this.name = "RunwareNotConfiguredError";
  }
}

export class RunwareApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunwareApiError";
  }
}

type RunwareInferenceRow = {
  taskType?: string;
  taskUUID?: string;
  imageURL?: string;
  imageDataURI?: string;
  imageBase64Data?: string;
  error?: string;
  message?: string;
};

type RunwareResponseBody = {
  data?: RunwareInferenceRow[];
  errors?: unknown;
};

function runwareBaseUrl(): string {
  const raw = process.env.RUNWARE_API_URL?.trim();
  const base = raw && raw.length > 0 ? raw.replace(/\/$/, "") : DEFAULT_RUNWARE_API_URL;
  return base;
}

function runwareModel(): string {
  const raw = process.env.RUNWARE_MODEL?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_RUNWARE_MODEL;
}

function inferSteps(model: string): number {
  // Schnell (`runware:100@1`) uses ~4 steps; dev / heavier defaults higher.
  if (model.includes("100@")) return 4;
  return 20;
}

function buildPositivePrompt(input: {
  appName: string;
  category: string;
  shortDescription?: string;
  style: string;
  variantIndex: number;
  brandColor?: string;
}): string {
  const short = input.shortDescription?.trim();
  const shortLine = short
    ? `Short description / positioning: ${short}`
    : "Short description / positioning: (not provided — infer only from app name and category.)";

  const colorLine = input.brandColor?.trim()
    ? `• Brand colour palette: dominant hue ${input.brandColor.toUpperCase()} — use this as the primary colour anchor for the icon background, motif, or accent. Keep it recognisable but harmonise with the style.`
    : null;

  const variant = input.variantIndex + 1;
  return [
    `Create one mobile app store icon (launcher-style) for the app named «${input.appName}».`,
    `Category: ${input.category}.`,
    shortLine,
    "",
    "Hard requirements:",
    "• Target: 1024×1024 PNG, square 1:1 frame; minimalist, modern, high contrast; crisp silhouette readable at tiny sizes.",
    "• No text, no letters, no numbers, no logotype, no watermarks, no UI chrome, no device mockups or screenshots.",
    "• Clean background (solid, soft gradient, or very subtle texture); centered subject; generous padding.",
    "• Motifs and metaphors must fit the category and feel trustworthy in a global store listing.",
    "• Culturally neutral iconography — must work well for English-speaking and Arabic-speaking users (avoid tiny ambiguous glyphs or region-specific lettering).",
    `• This is creative direction ${variant} of 4: use a clearly distinct composition, focal motif, or layout from the other three variants while staying one coherent product idea.`,
    ...(colorLine ? [colorLine] : []),
    "",
    `Style influence: ${input.style}.`,
  ].join("\n");
}

function extractImageRef(row: RunwareInferenceRow): string | null {
  const url = row.imageURL?.trim();
  if (url) return url;
  const dataUri = row.imageDataURI?.trim();
  if (dataUri) return dataUri;
  const b64 = row.imageBase64Data?.trim();
  if (b64) {
    const looksPng = b64.startsWith("iVBOR");
    const mime = looksPng ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${b64}`;
  }
  return null;
}

/**
 * Calls Runware `imageInference` four times in one request batch.
 * Returns four HTTPS URLs or data URIs (1024×1024 — resize to 512×512 in Play Console if needed).
 */
export async function generateAppLogos(input: {
  appName: string;
  category: string;
  shortDescription?: string;
  style: string;
  brandColor?: string;
}): Promise<string[]> {
  const apiKey = process.env.RUNWARE_API_KEY?.trim();
  if (!apiKey) {
    throw new RunwareNotConfiguredError();
  }

  const base = runwareBaseUrl();
  const model = runwareModel();
  const steps = inferSteps(model);

  const tasks = [0, 1, 2, 3].map((i) => ({
    taskType: "imageInference" as const,
    taskUUID: randomUUID(),
    model,
    positivePrompt: buildPositivePrompt({
      appName: input.appName.trim(),
      category: input.category.trim(),
      shortDescription: input.shortDescription,
      style: input.style.trim(),
      variantIndex: i,
      brandColor: input.brandColor,
    }),
    width: 1024,
    height: 1024,
    steps,
    outputFormat: "PNG" as const,
    outputType: "URL" as const,
    seed: randomInt(1, 2 ** 31 - 1),
  }));

  const res = await fetch(base, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(tasks),
  });

  const rawText = await res.text();
  let json: RunwareResponseBody;
  try {
    json = (rawText ? JSON.parse(rawText) : {}) as RunwareResponseBody;
  } catch {
    throw new RunwareApiError(
      `Runware returned non-JSON (HTTP ${res.status}): ${rawText.slice(0, 280)}`,
    );
  }

  if (!res.ok) {
    throw new RunwareApiError(
      `Runware HTTP ${res.status}: ${rawText.slice(0, 600)}`,
    );
  }

  const rows = Array.isArray(json.data) ? json.data : [];
  const byUuid = new Map<string, RunwareInferenceRow>();
  for (const row of rows) {
    if (row?.taskUUID) {
      byUuid.set(row.taskUUID, row);
    }
  }

  const images: string[] = [];
  for (const t of tasks) {
    const row = byUuid.get(t.taskUUID);
    if (!row) {
      throw new RunwareApiError("Runware response missing one or more image tasks.");
    }
    if (row.error || row.message) {
      throw new RunwareApiError(
        `Runware task error: ${row.error ?? row.message ?? "unknown"}`,
      );
    }
    const ref = extractImageRef(row);
    if (!ref) {
      throw new RunwareApiError("Runware returned a task without image URL or base64 data.");
    }
    images.push(ref);
  }

  if (Array.isArray(json.errors) && json.errors.length > 0) {
    throw new RunwareApiError(
      `Runware reported errors: ${JSON.stringify(json.errors).slice(0, 400)}`,
    );
  }
  if (typeof json.errors === "string" && json.errors.trim()) {
    throw new RunwareApiError(json.errors.trim().slice(0, 400));
  }

  return images;
}
