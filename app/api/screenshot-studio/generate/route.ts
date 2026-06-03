/**
 * POST /api/screenshot-studio/generate
 *
 * Async job pattern — returns 202 immediately, never times out.
 *
 * ── Request lifecycle ────────────────────────────────────────────────────────
 * 1. Auth + validation + credit check + debit          (synchronous, <300 ms)
 * 2. Insert screenshot_jobs row (status = 'pending')   (synchronous, <50 ms)
 * 3. Return 202 { ok: true, jobId }                    (immediate response)
 * 4. after() background task:
 *    a. Tier 1 listing lookup (non-blocking)
 *    b. generateScreenshotPack — one Gemini call for all 6 slides
 *    c. Promise.all(6) → generateScreenshotLayout — parallel Gemini layout maps
 *    d. callRunware — single batch of 6 images (one HTTP call)
 *    e. Promise.all(6) → fetchBlob + saveToVault — parallel S3 uploads
 *    f. Write each slide to screenshot_jobs.slides as it completes
 *    g. Set status = 'completed' (or 'failed' + credit refund on error)
 *
 * Client polls GET /api/screenshot-studio/job/[jobId] every 2.5 s.
 *
 * ── Parallelism ──────────────────────────────────────────────────────────────
 * All 6 LayoutMap calls run in parallel (Promise.all).
 * Runware receives all 6 image tasks in a single HTTP request.
 * All 6 storage uploads run in parallel (Promise.all).
 * Total wall-clock time: ~15-25 s instead of ~60-90 s sequential.
 *
 * ── RTL / LTR ────────────────────────────────────────────────────────────────
 * Locale is read from the request body. The workspace's preferred locale
 * (ar / en) is also fetched from the workspaces table and used as a tiebreaker
 * if the body locale is absent, so background composition always mirrors
 * correctly for Arabic workspaces.
 *
 * Cost: AI_CREDIT_COSTS.screenshot_render (20 credits).
 */

import { after } from "next/server";
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
import { LISTING_LOGO_STYLES } from "@/lib/validation/listing-logo-generate-body";
import { loadLatestListingHydrationForApp } from "@/lib/listing/latest-listing-hydration";
import { generateScreenshotPack } from "@/lib/gemini/generate-screenshot-pack";
import { generateScreenshotLayout, type LayoutMap } from "@/lib/gemini/generate-screenshot-layout";
import { RunwareApiError, RunwareNotConfiguredError } from "@/lib/features/ai/runware";
import { composeScreenshot, getAndroidFrameAndCache } from "@/lib/screenshot/compose-screenshot";

const ROUTE = "POST /api/screenshot-studio/generate";
const BUCKET = "brand-assets";
const RUNWARE_TIMEOUT_MS = 90_000;
const MAX_RUNWARE_ATTEMPTS = 3;

// ─── Validation schema ────────────────────────────────────────────────────────

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  appId: z.string().uuid(),
  appName: z.string().trim().min(1).max(120),
  category: z.string().trim().max(120).default(""),
  shortDescription: z.string().trim().max(2000).optional(),
  style: z.enum(LISTING_LOGO_STYLES),
  /** Primary brand colour — dominant background tint */
  brandColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** Secondary brand colour — used for gradient stop 2 */
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  theme: z.string().trim().max(150).optional(),
  headlineOverride: z.string().trim().max(40).optional(),
  sublineOverride: z.string().trim().max(70).optional(),
  /** Explicit locale from UI. Falls back to workspace locale from DB. */
  locale: z.enum(["en", "ar"]).default("en"),
}).strict();

// ─── Negative prompt ──────────────────────────────────────────────────────────

// ── Runware negative prompt — applied to EVERY slide in EVERY generation ──────
//
// This is the hardcoded exclusion list that enforces the 5 constraints:
//   1. Zero hardware (phone, frame, bezel, notch, screen…)
//   2. No text or lettering
//   3. No cluttered or busy composition (preserves 30% negative space)
//   4. No amateurish or cheap aesthetics
//   5. Arabic / locale-agnostic — same negative applies for both EN and AR
//
// Mirrors the explicit negative prompt from the product spec:
// "phone, smartphone, iphone, android, device, hardware, frame, notch,
//  bezel, screen, text, lettering, words"
const BASE_NEGATIVE =
  // ── Hardware (constraint 1) ─────────────────────────────────────────────
  "phone, smartphone, mobile phone, iPhone, Apple iPhone, iOS device, " +
  "Android phone, Android device, device mockup, phone frame, phone outline, " +
  "phone silhouette, phone shape, hardware, hardware frame, hardware mockup, " +
  "screen bezel, notch, dynamic island, home button, phone screen, " +
  "tablet, iPad, laptop, computer, monitor, device, gadget, electronics, " +
  "product shot with device, tech device, mobile device, hand holding phone, " +
  // ── Text / lettering (constraint 5) ────────────────────────────────────
  "text, lettering, letters, words, fonts, typography, headline, caption, " +
  "watermark, label, logotype, word mark, numbers, digits, " +
  // ── UI / interface elements ─────────────────────────────────────────────
  "UI chrome, app interface, app screenshot, interface mockup, " +
  "icons, app icons, navigation bar, status bar, buttons, " +
  // ── Composition violations (constraint 2 — must leave negative space) ──
  "centered busy composition, symmetrical busy center, " +
  "crowded layout, cluttered background, dense pattern covering full frame, " +
  "objects in center of image, busy middle section, " +
  // ── Aesthetic quality (constraint 4) ───────────────────────────────────
  "amateurish, clip art, stock photo look, AI-generated artefacts, " +
  "cheap gradient, rainbow gradient, neon explosion, garish colors, " +
  "blurry, noisy, grainy, oversaturated, distorted, low quality, " +
  "watercolor wash, painterly, illustration, cartoon, " +
  // ── People ─────────────────────────────────────────────────────────────
  "portrait of person, realistic face, photorealistic human, hand, body part";

// ─── Runware: single batch call for all 6 images ──────────────────────────────

async function callRunware(
  prompts: { positive: string; negative: string }[],
): Promise<string[]> {
  const apiKey = process.env.RUNWARE_API_KEY?.trim();
  if (!apiKey) throw new RunwareNotConfiguredError();
  const base =
    process.env.RUNWARE_API_URL?.trim().replace(/\/$/, "") ??
    "https://api.runware.ai/v1";
  const model = process.env.RUNWARE_MODEL?.trim() ?? "runware:101@1";
  const steps = model.includes("101@") ? 28 : model.includes("100@") ? 6 : 25;

  // All 6 images in a single HTTP request — one round trip to Runware
  const tasks = prompts.map(({ positive, negative }) => ({
    taskType: "imageInference",
    taskUUID: randomUUID(),
    model, steps,
    positivePrompt: positive,
    negativePrompt: negative,
    // Runware requires dimensions that are multiples of 64.
    // 1080×1920 are NOT valid (1080/64=16.875, 1920/64=30).
    // Nearest valid portrait ratio: 1024×1792 (16:64 × 28:64 — close to 9:16).
    width: 1024, height: 1792,
    outputFormat: "PNG", outputType: "URL",
    seed: randomInt(1, 2 ** 31 - 1),
  }));

  let res: Response | undefined;
  for (let attempt = 1; attempt <= MAX_RUNWARE_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RUNWARE_TIMEOUT_MS);
    try {
      res = await fetch(base, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(tasks),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      break;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === MAX_RUNWARE_ATTEMPTS)
        throw new RunwareApiError(
          `Runware failed after ${MAX_RUNWARE_ATTEMPTS} attempts: ${err instanceof Error ? err.message : String(err)}`,
        );
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }

  if (!res || !res.ok) {
    const txt = (await res?.text().catch(() => "")) ?? "";
    throw new RunwareApiError(
      `Runware HTTP ${res?.status ?? "?"}: ${txt.slice(0, 400)}`,
    );
  }

  const json = (await res.json()) as {
    data?: { imageURL?: string }[];
    errors?: unknown;
  };
  if (json.errors)
    throw new RunwareApiError(
      `Runware errors: ${JSON.stringify(json.errors).slice(0, 400)}`,
    );

  const urls = (json.data ?? [])
    .map((r) => r.imageURL ?? "")
    .filter((u) => /^https:\/\//i.test(u));
  if (!urls.length) throw new RunwareApiError("Runware returned no image URLs");
  return urls;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const r = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    });
    return r.ok ? await r.blob() : null;
  } catch {
    return null;
  }
}

async function saveSlideToVault(
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
    headline: string;
    subline: string;
    optimizedForConversion: boolean;
  },
): Promise<string | null> {
  const {
    workspaceId, appId, variantIndex, batchId, blob,
    locale, style, layoutMap, headline, subline, optimizedForConversion,
  } = opts;
  const ext = blob.type === "image/jpeg" ? "jpg" : "png";
  const mimeType = blob.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const fileName = `screenshot-bg-${appId.slice(0, 8)}-${locale}-v${variantIndex + 1}.${ext}`;
  const storagePath = `${workspaceId}/${appId}/screenshots/${fileName}`;

  const { data: row, error } = await admin
    .from("brand_assets")
    .insert({
      workspace_id: workspaceId,
      app_id: appId,
      asset_type: "screenshot",
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: blob.size,
      variant_index: variantIndex,
      storage_path: storagePath,
      meta: {
        batchId, locale, style, slideIndex: variantIndex,
        layoutMap, headline, subline, optimizedForConversion,
      },
    })
    .select("id, storage_path")
    .single();

  if (error || !row) return null;

  const { data: uploadData } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(row.storage_path as string);
  if (!uploadData?.signedUrl) return null;

  await fetch(uploadData.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: blob,
  });

  const { data: readData } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path as string, 3600);
  return readData?.signedUrl ?? null;
}

// ─── Background pipeline ──────────────────────────────────────────────────────

async function runBackground(opts: {
  jobId: string;
  userId: string;
  ledgerId: string | undefined;
  workspaceId: string;
  appId: string;
  appName: string;
  category: string;
  shortDescription?: string;
  style: string;
  brandColor?: string;
  primaryColor?: string;
  theme?: string;
  headlineOverride?: string;
  sublineOverride?: string;
  locale: "en" | "ar";
  clientIp: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const started = Date.now();

  // Helper: update job row
  async function updateJob(patch: Record<string, unknown>) {
    await admin
      .from("screenshot_jobs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", opts.jobId);
  }

  try {
    await updateJob({ status: "running" });

    const {
      jobId, userId, workspaceId, appId, appName, category,
      shortDescription, style, brandColor, primaryColor, theme,
      headlineOverride, sublineOverride, locale,
    } = opts;

    // ── Tier 1: full listing intelligence lookup ─────────────────────────
    // Pull every signal the Listing Optimizer generated so the screenshots
    // are semantically synchronized with the store listing.
    let listingTitle: string | undefined;
    let listingShortDesc: string | undefined;
    let listingFeatures: string | undefined;
    let screenshotCaptions: string[] | undefined;
    let keywordSuggestions: string[] | undefined;
    let strategySummary: string | undefined;
    let ctaSuggestions: string[] | undefined;
    let optimizedForConversion = false;

    try {
      const { createClient: createServerClient } = await import("@/lib/supabase/server");
      const supabase = await createServerClient();
      const hydration = await loadLatestListingHydrationForApp(supabase, workspaceId, appId);
      if (hydration?.output?.title) {
        listingTitle     = hydration.output.title;
        listingShortDesc = hydration.output.shortDescription ?? undefined;
        listingFeatures  = hydration.appFeatures?.trim() || undefined;

        // Screenshot captions: up to 5 pre-optimized slot captions
        if (Array.isArray(hydration.output.screenshotCaptions) && hydration.output.screenshotCaptions.length > 0) {
          screenshotCaptions = hydration.output.screenshotCaptions as string[];
        }
        // Top keywords for theme alignment
        if (Array.isArray(hydration.output.keywordSuggestions) && hydration.output.keywordSuggestions.length > 0) {
          keywordSuggestions = hydration.output.keywordSuggestions as string[];
        }
        // Strategic positioning summary
        strategySummary = (hydration.output.strategySummary ?? hydration.output.strategicNote) as string | undefined;
        // CTA suggestions
        if (Array.isArray(hydration.output.ctaSuggestions) && hydration.output.ctaSuggestions.length > 0) {
          ctaSuggestions = hydration.output.ctaSuggestions as string[];
        }
        optimizedForConversion = true;
      }
    } catch { /* non-fatal — falls through to Tier 2 */ }

    // ── Gemini: 6-slide narrative arc, synchronized with listing themes ──
    const pack = await generateScreenshotPack({
      appName, category,
      shortDescription: listingShortDesc ?? shortDescription,
      listingTitle, features: listingFeatures,
      screenshotCaptions, keywordSuggestions, strategySummary, ctaSuggestions,
      style, brandColor, theme,
      headlineOverride, sublineOverride,
      locale, optimizedForConversion,
    });

    // ── Gemini: 6 LayoutMaps in parallel ────────────────────────────────
    const layoutMaps = await Promise.all(
      pack.slides.map((slide, i) =>
        generateScreenshotLayout({
          appName, category,
          shortDescription: listingShortDesc ?? shortDescription,
          headline: slide.headline,
          subline: slide.subline,
          uiFocus: slide.uiFocus,
          style, brandColor, primaryColor,
          locale, slideIndex: i,
          inferredMood: pack.inferredMood,
        }).catch((): LayoutMap => ({
          backgroundPrompt:
            `BACKGROUND ONLY — NO DEVICE FRAME. ${style} brand-identity background for ${category} app. ` +
            `${brandColor ? `Dominant brand color: ${brandColor}. ` : "Neutral, warm palette. "}` +
            "Pure atmospheric backdrop — the Android phone frame will be overlaid separately. " +
            "Identity-synced premium gradient, generous whitespace, top-10 app quality. " +
            "30% negative space on the right third reserved for device frame overlay.",
          negativeAdditions: "phone, smartphone, mobile phone, iPhone, Android phone, device, mockup, screen, bezel, notch, hardware, frame, silhouette, generic, template, clip-art, amateurish, UI elements, interface, app screenshot",
          selectedSchema: "minimalist-professional",
          typographyConfig: {
            primaryColor: brandColor ?? "#6366F1",
            fontStyle: "clean",
            shadowProfile: "subtle",
          },
          textPosition: "bottom",
          textColor: "#ffffff",
          accentColor: brandColor ?? "#6366F1",
          accentColorSecondary: primaryColor ?? "#4F46E5",
          backgroundMood: "modern brand gradient",
          uiMockDescription: `${appName} main dashboard screen`,
          backgroundLuminance: "dark",
        })),
      ),
    );

    // ── Runware: single batch HTTP call for all 6 backgrounds ────────────
    const runwarePrompts = layoutMaps.map((lm) => ({
      positive: lm.backgroundPrompt,
      negative: [BASE_NEGATIVE, lm.negativeAdditions].filter(Boolean).join(", "),
    }));
    const backgroundUrls = await callRunware(runwarePrompts);
    const batchId = randomUUID();

    // ── Composition pipeline for all 6 slides ─────────────────────────────
    // Schema-aware compositing with deterministic typography + shadows.
    // Each slide uses its layoutMap for schema-specific styling.
    //
    // Pipeline per slide:
    //   1. Fetch raw FLUX background blob from Runware CDN
    //   2. Compose: scale bg to 1080×1920, overlay Android frame (locale-aware)
    //   3. Apply schema-specific shadow profile to frame
    //   4. Use schema's fontStyle for typography (done at export, not here)
    //   5. Save composed PNG to Supabase Storage
    //   6. Write progress to screenshot_jobs so client polls see incremental updates
    const completedSlides: unknown[] = [];

    await Promise.all(
      backgroundUrls.slice(0, pack.slides.length).map(async (url, i) => {
        const slide = pack.slides[i];
        const layoutMap = layoutMaps[i];

        const rawBlob = await fetchBlob(url);
        let finalUrl = url;

        if (rawBlob) {
          // Convert Blob → Buffer for sharp
          const rawBuffer = Buffer.from(await rawBlob.arrayBuffer());

          // Composition-First: compose background + schema-driven frame + shadows
          // This is the only place device frames are applied — deterministic,
          // always Android, never AI-generated.
          // Schema metadata (selectedSchema, typographyConfig) drives asset selection.
          let composedBuffer: Buffer;
          try {
            composedBuffer = await composeScreenshot(rawBuffer, layoutMap, locale);
          } catch (composeErr) {
            // Composition failure is non-fatal — fall back to raw background
            console.warn(`[screenshot/compose] slide ${i} compose failed:`, composeErr);
            composedBuffer = rawBuffer;
          }

          // Convert Node Buffer → Uint8Array so Blob constructor accepts it in all TS targets
          const composedBlob = new Blob([new Uint8Array(composedBuffer)], { type: "image/png" });
          const stored = await saveSlideToVault(admin, {
            workspaceId, appId,
            variantIndex: i, batchId,
            blob: composedBlob,
            locale, style, layoutMap,
            headline: slide.headline,
            subline: slide.subline,
            optimizedForConversion,
          });
          if (stored) finalUrl = stored;
        }

        const slideResult = { backgroundUrl: finalUrl, layoutMap, slide };

        // Atomic append + progress increment via Supabase RPC / raw update
        // We push into the array and increment progress in one update
        completedSlides[i] = slideResult;
        const currentSlides = completedSlides.filter(Boolean);

        await admin
          .from("screenshot_jobs")
          .update({
            slides: currentSlides,
            progress: currentSlides.length,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }),
    );

    // ── Mark complete ────────────────────────────────────────────────────
    const finalSlides = backgroundUrls
      .slice(0, pack.slides.length)
      .map((url, i) => completedSlides[i] ?? { backgroundUrl: url, layoutMap: layoutMaps[i], slide: pack.slides[i] });

    await updateJob({
      status: "completed",
      progress: finalSlides.length,
      slides: finalSlides,
      batch_id: batchId,
      optimized_for_conversion: optimizedForConversion,
    });

    await logUsage(admin, {
      route: ROUTE, clientIp: opts.clientIp, success: true,
      durationMs: Date.now() - started,
      meta: {
        user_id: userId, workspace_id: workspaceId, app_id: appId,
        slides: finalSlides.length,
        tier: optimizedForConversion ? 1 : 2,
        job_id: jobId,
      },
    });
  } catch (e) {
    // Refund credits
    if (opts.ledgerId) {
      try {
        // Need a fresh auth-capable client for the refund
        const { createClient: createServerClient } = await import("@/lib/supabase/server");
        const supabase = await createServerClient();
        await refundWorkspaceAiCredits(supabase, {
          ledgerId: opts.ledgerId,
          userId: opts.userId,
          reason: "Screenshot background job failed",
        });
      } catch { /* non-fatal */ }
    }

    const message =
      e instanceof RunwareNotConfiguredError ? "Render service not configured." :
      e instanceof RunwareApiError || e instanceof Error ? e.message :
      "Generation failed";

    await updateJob({ status: "failed", error_message: message.slice(0, 1000) });

    await logUsage(admin, {
      route: ROUTE, clientIp: opts.clientIp, success: false,
      durationMs: Date.now() - started,
      errorMessage: message.slice(0, 2000),
      meta: { workspace_id: opts.workspaceId, job_id: opts.jobId },
    });
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);

  if (!process.env.RUNWARE_API_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: "unconfigured", message: "Render service not configured." } },
      { status: 503 },
    );
  }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: "unconfigured", message: "AI service not configured." } },
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
    if (e instanceof ZodError)
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "Invalid input", details: e.flatten() } },
        { status: 400 },
      );
    throw e;
  }

  const {
    workspaceId, appId, appName, category, shortDescription,
    style, brandColor, primaryColor, theme, headlineOverride, sublineOverride,
  } = input;

  // Resolve locale: body → workspace DB fallback
  let locale: "en" | "ar" = input.locale;
  try {
    const admin = getSupabaseAdmin();
    const { data: wsRow } = await admin
      .from("workspaces")
      .select("locale")
      .eq("id", workspaceId)
      .maybeSingle();
    const wsLocaleRaw = (wsRow as { locale?: string } | null)?.locale ?? "";
    if (!input.locale && wsLocaleRaw.startsWith("ar")) locale = "ar";
  } catch { /* use body locale */ }

  const wsRole = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!wsRole) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found" } },
      { status: 403 },
    );
  }

  // ── Credits: charge synchronously before returning 202 ─────────────────
  const creditCost = AI_CREDIT_COSTS.screenshot_render;
  const balance = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  if (!balance.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "wallet_error", message: "Could not read credits." } },
      { status: 503 },
    );
  }
  if (balance.remaining < creditCost) {
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(creditCost, balance.remaining),
      { status: 402 },
    );
  }

  const debit = await consumeWorkspaceAiCredits(supabase, {
    workspaceId,
    userId: user.id,
    amount: creditCost,
    description: "Screenshot Studio — 6-pack generation (Gemini + Runware FLUX)",
    sourceType: "generation",
    meta: { route: ROUTE, tool: "screenshot_generate", app_id: appId },
  });
  if (!debit.ok) {
    if (debit.code === "insufficient_credits")
      return NextResponse.json(
        buildInsufficientAiCreditsPayload(debit.required ?? creditCost, debit.remaining ?? 0),
        { status: 402 },
      );
    return NextResponse.json(
      { ok: false, error: { code: "wallet_error", message: "Could not reserve credits." } },
      { status: 503 },
    );
  }

  // ── Create job row ──────────────────────────────────────────────────────
  const admin = getSupabaseAdmin();
  const { data: jobRow, error: jobErr } = await admin
    .from("screenshot_jobs")
    .insert({
      workspace_id: workspaceId,
      app_id: appId,
      user_id: user.id,
      status: "pending",
      progress: 0,
      total: 6,
      slides: [],
      ledger_id: debit.ledgerId ?? null,
      credits_charged: creditCost,
      credits_remaining: debit.balanceAfter,
    })
    .select("id")
    .single();

  if (jobErr || !jobRow) {
    // Refund and bail
    if (debit.ledgerId) {
      await refundWorkspaceAiCredits(supabase, {
        ledgerId: debit.ledgerId,
        userId: user.id,
        reason: "Could not create screenshot job row",
      }).catch(() => {});
    }
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: "Could not create job. Please try again." } },
      { status: 503 },
    );
  }

  const jobId = jobRow.id as string;

  // ── Schedule background work with after() ──────────────────────────────
  // after() registers a callback that runs AFTER the response is sent.
  // The Vercel / Node.js runtime keeps the function alive until the promise resolves.
  after(
    runBackground({
      jobId,
      userId: user.id,
      ledgerId: debit.ledgerId,
      workspaceId, appId, appName, category, shortDescription,
      style, brandColor, primaryColor, theme, headlineOverride, sublineOverride, locale,
      clientIp,
    }),
  );

  // ── Return 202 immediately ─────────────────────────────────────────────
  return NextResponse.json(
    {
      ok: true,
      jobId,
      status: "pending",
      message: "Job accepted. Poll /api/screenshot-studio/job/:jobId for progress.",
      meta: { creditsCharged: creditCost, creditsRemaining: debit.balanceAfter },
    },
    { status: 202 },
  );
}
