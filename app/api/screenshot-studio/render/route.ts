/**
 * POST /api/screenshot-studio/render
 *
 * Implements the consultant's 3-layer screenshot architecture:
 *
 * Layer 1 — Gemini Semantic Layout Engine
 *   Calls generateScreenshotLayout() for each slide. Gemini extracts the
 *   core value proposition and returns a LayoutMap: the FLUX background
 *   prompt, text position, accent colour, and phone-frame UI description.
 *
 * Layer 2 — Runware FLUX.1 [dev] Background Generation
 *   Runware generates ONLY the atmospheric background (no text, no phone
 *   frame, no UI chrome). The prompt is the Gemini-authored backgroundPrompt
 *   — keeping art style consistent with icons & banners already generated.
 *
 * Layer 3 — Canvas "Bake-at-Download" (client-side)
 *   Background URLs + LayoutMap metadata are returned to the client.
 *   The ScreenshotStudioClient canvas compositor places:
 *     • FLUX background image (full bleed, 1080×1920)
 *     • SVG Pixel 9 phone frame (static, high-res)
 *     • Sharp system-font headline + subline text overlay
 *   Only at export time — preview stays clean (raw FLUX background).
 *
 * Background images are saved to Supabase Storage with LayoutMap in meta,
 * so the vault query can reconstruct both image + compositing metadata.
 *
 * Cost: AI_CREDIT_COSTS.screenshot_render (15 credits).
 */

import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { randomUUID, randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { getClientIp } from "@/lib/client-ip";
import {
  AI_CREDIT_COSTS,
  buildInsufficientAiCreditsPayload,
  consumeWorkspaceAiCredits,
  readWorkspaceAiCreditsRemaining,
  refundWorkspaceAiCredits,
} from "@/lib/features";
import { logUsage } from "@/lib/usage-log";
import {
  RunwareApiError,
  RunwareNotConfiguredError,
} from "@/lib/features/ai/runware";
import { LISTING_LOGO_STYLES } from "@/lib/validation/listing-logo-generate-body";
import { generateScreenshotLayout, type LayoutMap } from "@/lib/gemini/generate-screenshot-layout";

const ROUTE = "POST /api/screenshot-studio/render";
const BUCKET = "brand-assets";
const RUNWARE_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

// ─── Zod schema ───────────────────────────────────────────────────────────────

const slideSchema = z.object({
  position: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  headline: z.string().max(40),
  subline: z.string().max(70),
  uiFocus: z.string().max(200),
});

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  appId: z.string().uuid(),
  appName: z.string().trim().min(1).max(120),
  category: z.string().trim().max(120).default(""),
  shortDescription: z.string().trim().max(2000).optional(),
  style: z.enum(LISTING_LOGO_STYLES),
  brandColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  slides: z.array(slideSchema).min(1).max(3),
  locale: z.enum(["en", "ar"]).default("en"),
}).strict();

// ─── BASE negative prompt (Consultant: no text, no phone frame from FLUX) ────

const BASE_NEGATIVE_PROMPT = [
  "text, letters, words, typography, captions, headlines, labels, watermark,",
  "phone frame, device mockup, smartphone outline, screen bezel, UI chrome, app interface,",
  "blurry, low quality, distorted, oversaturated, noisy, grainy,",
  "portrait of person, face, human, photorealistic person,",
  "cluttered, busy composition, centered focal point",
].join(" ");

// ─── Runware call ─────────────────────────────────────────────────────────────

async function callRunware(tasks: unknown[]): Promise<string[]> {
  const apiKey = process.env.RUNWARE_API_KEY?.trim();
  if (!apiKey) throw new RunwareNotConfiguredError();

  const base = process.env.RUNWARE_API_URL?.trim().replace(/\/$/, "") ?? "https://api.runware.ai/v1";
  const model = process.env.RUNWARE_MODEL?.trim() ?? "runware:101@1";
  // Use high step count for FLUX dev — backgrounds need coherent atmosphere
  const steps = model.includes("101@") ? 28 : model.includes("100@") ? 6 : 25;

  // Attach model + steps to each task
  const enriched = (tasks as Record<string, unknown>[]).map((t) => ({
    ...t, model, steps,
    outputFormat: "PNG",
    outputType: "URL",
    // Runware requires multiples of 64. Nearest valid 9:16 portrait: 1024×1792.
    // (1080 and 1920 are not multiples of 64 — would cause HTTP 400.)
    // Canvas compositor scales to true 1080×1920 / 1242×2208 at export time.
    width: 1024,
    height: 1792,
  }));

  let res: Response | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RUNWARE_TIMEOUT_MS);
    try {
      res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(enriched),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      break;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === MAX_ATTEMPTS) {
        throw new RunwareApiError(
          `Runware request failed after ${MAX_ATTEMPTS} attempts: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  if (!res || !res.ok) {
    const text = (await res?.text().catch(() => "")) ?? "";
    throw new RunwareApiError(`Runware HTTP ${res?.status ?? "?"}: ${text.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    data?: { imageURL?: string; error?: string }[];
    errors?: unknown;
  };
  if (json.errors) {
    throw new RunwareApiError(`Runware API error: ${JSON.stringify(json.errors).slice(0, 400)}`);
  }

  const urls = (json.data ?? [])
    .map((row) => row.imageURL ?? "")
    .filter((u) => /^https:\/\//i.test(u));

  if (urls.length === 0) throw new RunwareApiError("Runware returned no image URLs");
  return urls;
}

// ─── Supabase Storage upload ──────────────────────────────────────────────────

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const r = await fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" });
    return r.ok ? await r.blob() : null;
  } catch { return null; }
}

async function uploadBackground(
  admin: ReturnType<typeof getSupabaseAdmin>,
  opts: {
    workspaceId: string;
    appId: string;
    variantIndex: number;
    batchId: string;
    blob: Blob;
    locale: string;
    style: string;
    layoutMap: LayoutMap;
  },
): Promise<string | null> {
  const { workspaceId, appId, variantIndex, batchId, blob, locale, style, layoutMap } = opts;
  const ext = blob.type === "image/jpeg" ? "jpg" : "png";
  const fileName = `screenshot-bg-${appId.slice(0, 8)}-${locale}-v${variantIndex + 1}.${ext}`;
  const storagePath = `${workspaceId}/${appId}/screenshots/${fileName}`;

  const { data: row, error: insertErr } = await admin
    .from("brand_assets")
    .insert({
      workspace_id: workspaceId,
      app_id: appId,
      asset_type: "screenshot",
      file_name: fileName,
      mime_type: blob.type === "image/jpeg" ? "image/jpeg" : "image/png",
      size_bytes: blob.size,
      variant_index: variantIndex,
      storage_path: storagePath,
      meta: {
        batchId,
        locale,
        style,
        slideIndex: variantIndex,
        // LayoutMap stored in meta — client compositor reads this at export time
        layoutMap,
      },
    })
    .select("id, storage_path")
    .single();

  if (insertErr || !row) return null;

  const { data: urlData } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(row.storage_path as string);
  if (!urlData?.signedUrl) return null;

  await fetch(urlData.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": blob.type === "image/jpeg" ? "image/jpeg" : "image/png" },
    body: blob,
  });

  const { data: readUrl } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path as string, 3600);
  return readUrl?.signedUrl ?? null;
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const started = Date.now();
  const clientIp = getClientIp(request);

  if (!process.env.RUNWARE_API_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: "unconfigured", message: "AI render service not configured." } },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  let input;
  try { input = bodySchema.parse(body); } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "Invalid input", details: e.flatten() } },
        { status: 400 },
      );
    }
    throw e;
  }

  const { workspaceId, appId, appName, category, shortDescription, style, brandColor, slides, locale } = input;

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found" } },
      { status: 403 },
    );
  }

  // ── Credits ────────────────────────────────────────────────────────────────
  const creditCost = AI_CREDIT_COSTS.screenshot_render;
  const balance = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  if (!balance.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "wallet_error", message: "Could not read AI credit balance." } },
      { status: 503 },
    );
  }
  if (balance.remaining < creditCost) {
    return NextResponse.json(buildInsufficientAiCreditsPayload(creditCost, balance.remaining), { status: 402 });
  }

  const debit = await consumeWorkspaceAiCredits(supabase, {
    workspaceId, userId: user.id, amount: creditCost,
    description: "Screenshot Studio — background render (Runware FLUX)",
    sourceType: "generation",
    meta: { route: ROUTE, tool: "screenshot_render", app_id: appId },
  });
  if (!debit.ok) {
    if (debit.code === "insufficient_credits") {
      return NextResponse.json(
        buildInsufficientAiCreditsPayload(debit.required ?? creditCost, debit.remaining ?? 0),
        { status: 402 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "wallet_error", message: "Could not reserve credits." } },
      { status: 503 },
    );
  }

  const ledgerId = debit.ledgerId;
  const admin = getSupabaseAdmin();

  try {
    // ── Layer 1: Gemini Semantic Layout Engine ──────────────────────────────
    // Run layout map generation for all slides in parallel.
    // Each LayoutMap contains the FLUX background prompt + canvas metadata.
    const layoutMaps = await Promise.all(
      slides.map((slide, i) =>
        generateScreenshotLayout({
          appName, category, shortDescription,
          headline: slide.headline,
          subline: slide.subline,
          uiFocus: slide.uiFocus,
          style,
          brandColor,
          locale,
          slideIndex: i,
        }).catch((): LayoutMap => ({
          // Graceful fallback if Gemini layout fails for one slide
          backgroundPrompt: `${style} abstract background for ${category} app, ${brandColor ? `${brandColor} accent color,` : ""} clean gradient, modern design, atmospheric`,
          negativeAdditions: "",
          textPosition: "bottom",
          textColor: "#ffffff",
          accentColor: brandColor ?? "#22C55E",
          backgroundMood: "modern gradient",
          uiMockDescription: `${appName} main screen`,
        })),
      ),
    );

    // ── Layer 2: Runware FLUX — pure background images ──────────────────────
    // CRITICAL: No text, no phone frame. FLUX generates ONLY atmosphere.
    // Text + phone frame are composited on the client canvas at export time.
    const tasks = layoutMaps.map((layout) => ({
      taskType: "imageInference",
      taskUUID: randomUUID(),
      positivePrompt: layout.backgroundPrompt,
      negativePrompt: [BASE_NEGATIVE_PROMPT, layout.negativeAdditions].filter(Boolean).join(", "),
      seed: randomInt(1, 2 ** 31 - 1),
    }));

    const backgroundUrls = await callRunware(tasks);

    // ── Layer 3: Save backgrounds + LayoutMaps to Supabase Storage ──────────
    // The client canvas compositor reads LayoutMap from meta at export time
    // to place: phone frame SVG + headline text + accent strip.
    const batchId = randomUUID();

    const storedSlides = await Promise.all(
      backgroundUrls.slice(0, slides.length).map(async (url, i) => {
        const blob = await fetchBlob(url);
        if (!blob) {
          // Runware URL still usable by client even if storage upload fails
          return {
            backgroundUrl: url,
            layoutMap: layoutMaps[i],
            slide: slides[i],
          };
        }
        const storedUrl = await uploadBackground(admin, {
          workspaceId, appId,
          variantIndex: i,
          batchId, blob,
          locale, style,
          layoutMap: layoutMaps[i],
        });
        return {
          backgroundUrl: storedUrl ?? url,
          layoutMap: layoutMaps[i],
          slide: slides[i],
        };
      }),
    );

    await logUsage(admin, {
      route: ROUTE, clientIp, success: true,
      durationMs: Date.now() - started,
      meta: {
        user_id: user.id, workspace_id: workspaceId, app_id: appId,
        image_count: storedSlides.length,
      },
    });

    return NextResponse.json({
      ok: true,
      // Each slide: background URL + layout metadata for client compositor
      slides: storedSlides,
      batchId,
      meta: { creditsCharged: creditCost, creditsRemaining: debit.balanceAfter },
    });
  } catch (e) {
    if (ledgerId) {
      await refundWorkspaceAiCredits(supabase, {
        ledgerId, userId: user.id,
        reason: "Screenshot background render failed",
      }).catch(() => { /* non-fatal */ });
    }

    const message = e instanceof RunwareNotConfiguredError
      ? "Render service not configured."
      : e instanceof RunwareApiError || e instanceof Error
        ? e.message
        : "Screenshot render failed";

    await logUsage(admin, {
      route: ROUTE, clientIp, success: false,
      durationMs: Date.now() - started,
      errorMessage: message.slice(0, 2000),
      meta: { user_id: user.id, workspace_id: workspaceId },
    });

    const isProd = process.env.NODE_ENV === "production";
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "render_error",
          message: isProd ? "Screenshot render failed. Please try again." : message,
        },
      },
      { status: 502 },
    );
  }
}
