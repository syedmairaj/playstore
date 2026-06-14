import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { generateReviewAnalysis, type IssueItem } from "@/lib/gemini/generate-review-analysis";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import {
  buildInsufficientAiCreditsPayload,
} from "@/lib/features/billing/workspace-ai-credits";
import {
  consumeWorkspaceAiCredits,
  refundWorkspaceAiCredits,
} from "@/lib/features/billing/wallet";
import { logAdminAiTransaction } from "@/lib/admin/log-ai-transaction";
import {
  savePendingReviewInsights,
} from "@/lib/review-insights/pending-insights.service";
import { guardReviewAnalysisAction } from "@/lib/review-insights";
import { nextReviewAnalysisResetIso } from "@/lib/review-insights/monthly-usage";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE = "GET|POST /api/workspaces/[workspaceId]/reviews/analyze";
const TABLE = "competitor_insights";

/**
 * Cache TTL — 7 days.
 * Results stay visible for a full week. The GET handler returns
 * hasBeenAnalyzed=false only after this window expires, forcing a re-purchase.
 * Users can force a fresh run at any time via POST { force: true } (3 credits).
 */
const CACHE_TTL_HOURS = 168;

/**
 * Server-side cap on review texts sent to Gemini.
 * Keeps prompt tokens and latency predictable.
 */
const MAX_REVIEWS_PER_ANALYSIS = 80;

type Ctx = { params: Promise<{ workspaceId: string }> };

// ─────────────────────────────────────────────────────────────────────────────
// Response shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every successful response from both GET and POST uses this flat shape.
 * No nested `data` wrapper — fields are at the top level alongside `success`.
 *
 * hasBeenAnalyzed — the SOLE paywall gate the client must branch on:
 *
 *   false → No fresh DB row exists that was written by a paid Gemini run.
 *           Client MUST show the paywall. No data rendered, no empty state.
 *           Covers: never purchased | cache expired | zero-review short-circuit.
 *
 *   true  → A fresh row produced by a real Gemini call exists in the DB.
 *           Client skips the paywall; branch only on insights.length:
 *             insights.length === 0  → "No Pain-Point Clusters Found"  (STATE C)
 *             insights.length  > 0   → IssueCard grid                  (STATE D)
 */
type SuccessPayload = {
  success: true;
  hasBeenAnalyzed: boolean;
  insights: IssueItem[];
  /**
   * ISO 8601 timestamp of when the cached Gemini result was last written.
   * Present on every hasBeenAnalyzed=true response (GET hit and POST success).
   * The client converts this into a human-readable relative label
   * ("Analysed 2 days ago") for the freshness footer.
   */
  updatedAt?: string;
  /**
   * Number of raw ≤2★ reviews available for this package+country combo.
   * Only populated on hasBeenAnalyzed=false responses from GET — gives the
   * client enough information to render a data-driven paywall badge without
   * an extra round-trip.  Omitted on POST responses and GET cache hits.
   */
  rawReviewCount?: number;
  /** Pain points auto-bridged to Listing Optimizer Active Context. */
  bridge?: { savedCount: number };
  usage?: { monthlyUsed: number; monthlyLimit: number };
};

/** Flat success response — used by both GET and POST. */
function successJson(payload: SuccessPayload, meta?: Record<string, unknown>) {
  return NextResponse.json({ ...payload, meta });
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const analyzeBodySchema = z.object({
  /**
   * Android package identifier — the workspace's own app or a competitor.
   * Part of the composite cache key: (workspace_id, package_name, lang_code, country).
   */
  packageName: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(
      /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i,
      "Must be a valid Android package name (e.g. com.example.app)",
    ),

  /**
   * BCP-47 language tag for the scraper pass that produced reviewTexts.
   * Derived server-side from the country code via country-lang-map.ts.
   */
  langCode: z.string().trim().toLowerCase().min(2).max(10).optional().default("en"),

  /**
   * ISO 3166-1 alpha-2 market country code (lowercase).
   * Independent cache slot per market.
   */
  country: z
    .string()
    .trim()
    .toLowerCase()
    .length(2, "Must be a 2-character ISO 3166-1 alpha-2 country code")
    .optional()
    .default("us"),

  /**
   * ≤2★ review texts from the client's live sync.
   * The route does NOT query a reviews table — texts are passed in-body
   * to keep the pipeline stateless with respect to review storage.
   */
  reviewTexts: z.array(z.string().max(2000)).max(200).optional().default([]),

  /** Bypass cache and re-run Gemini even if a fresh result exists. */
  force: z.boolean().optional().default(false),
});

type AnalyzeBody = z.infer<typeof analyzeBodySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

type CachedRow = {
  id: string;
  insights: unknown;
  updated_at: string;
  analysis_transaction_id: string | null;
};

/**
 * Looks up a cached Gemini result by the 4-column composite key:
 *   (workspace_id, package_name, lang_code, country)
 *
 * Returns null when:
 *   – no row exists, OR
 *   – the row's insights column is null / not an array (written by old code
 *     before the paywall existed — must not be treated as "purchased").
 *
 * This null-insights guard is the critical protection against stale rows from
 * earlier code versions setting hasBeenAnalyzed=true without a real Gemini run.
 */
async function getCachedInsights(
  workspaceId: string,
  packageName: string,
  langCode: string,
  country: string,
): Promise<CachedRow | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from(TABLE)
    .select("id, insights, updated_at, analysis_transaction_id")
    .eq("workspace_id", workspaceId)
    .eq("package_name", packageName)
    .eq("lang_code", langCode)
    .eq("country", country)
    .maybeSingle();

  if (error) {
    console.error(`[${ROUTE}] cache read error:`, error.message);
    return null;
  }

  // Treat rows with null insights as if they don't exist.
  // These are left-over rows from earlier code that short-circuited on zero
  // reviews and wrote an empty payload — they were never real Gemini results.
  if (!data || !Array.isArray(data.insights)) return null;

  // ── Sentinel-row guard ─────────────────────────────────────────────────────
  // Earlier versions of generateReviewAnalysis wrote a PARSE_FALLBACK_ITEM
  // ("Review Insights Processing") to the DB when JSON.parse failed on the
  // Gemini response. These rows look like valid cache hits but contain synthetic
  // placeholder text, not real analysis. Detect and evict them so the next POST
  // triggers a fresh Gemini call instead of serving the stale fallback.
  const insights = data.insights as Array<Record<string, unknown>>;
  const isSentinelRow =
    insights.length === 1 &&
    typeof insights[0]?.title === "string" &&
    insights[0].title === "Review Insights Processing";

  if (isSentinelRow) {
    console.info(
      `[${ROUTE}] sentinel row detected for package — evicting as cache miss`,
      { workspaceId, packageName },
    );
    return null;
  }

  return data as CachedRow;
}

function isCacheFresh(updatedAt: string): boolean {
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  return ageMs < CACHE_TTL_HOURS * 60 * 60 * 1000;
}

/**
 * Upserts a Gemini result into competitor_insights.
 * Composite conflict key: (workspace_id, package_name, lang_code, country).
 * Only `insights` and `updated_at` are overwritten on conflict.
 *
 * NOTE: this function is only called after a real Gemini run. Zero-review
 * short-circuits do NOT call upsertInsights — no row is written, so the next
 * GET will correctly return hasBeenAnalyzed=false and re-show the paywall.
 */
async function upsertInsights(
  workspaceId: string,
  packageName: string,
  langCode: string,
  country: string,
  issues: IssueItem[],
  analysisTransactionId: string,
): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from(TABLE)
    .upsert(
      {
        workspace_id: workspaceId,
        package_name: packageName,
        lang_code: langCode,
        country,
        insights: issues,
        updated_at: new Date().toISOString(),
        analysis_transaction_id: analysisTransactionId,
      },
      {
        onConflict: "workspace_id,package_name,lang_code,country",
        ignoreDuplicates: false,
      },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(`[${ROUTE}] upsert failed:`, error.message);
    return null;
  }

  return (data?.id as string | undefined) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth wrapper
// ─────────────────────────────────────────────────────────────────────────────

async function withAuth(
  workspaceId: string,
  fn: (
    userId: string,
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => Promise<NextResponse>,
): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { success: false, error: { code: "forbidden", message: "Workspace not found or inaccessible." } },
      { status: 403 },
    );
  }

  return fn(user.id, supabase);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST core handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleAnalyze(
  workspaceId: string,
  input: AnalyzeBody,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<NextResponse> {
  const { packageName, langCode, country, force } = input;
  const COST = AI_CREDIT_COSTS.reviews_issue_analysis;

  // ── Step 1: Serve fresh cache (no credits charged) ────────────────────────
  //
  // getCachedInsights returns null for rows with null/non-array insights, so
  // only real Gemini results can produce hasBeenAnalyzed=true from the cache.
  const cached = await getCachedInsights(workspaceId, packageName, langCode, country);
  if (cached && isCacheFresh(cached.updated_at) && !force) {
    const insights = cached.insights as IssueItem[];
    return successJson(
      { success: true, hasBeenAnalyzed: true, insights, updatedAt: cached.updated_at },
      { route: ROUTE, source: "cache", count: insights.length },
    );
  }

  // ── Step 2: Zero-review short-circuit ────────────────────────────────────
  //
  // No credits charged. No DB row written. hasBeenAnalyzed=false so the
  // paywall stays visible — the user can try again once reviews have loaded.
  const reviewTexts = input.reviewTexts
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_REVIEWS_PER_ANALYSIS);

  if (reviewTexts.length === 0) {
    return successJson(
      { success: true, hasBeenAnalyzed: false, insights: [] },
      { route: ROUTE, source: "short_circuit", emptyReason: "no_reviews" },
    );
  }

  // ── Step 3: ActionGuard — credits + monthly usage ────────────────────────
  const guard = await guardReviewAnalysisAction(supabase, workspaceId);
  if (!guard.allowed) {
    if (guard.reason === "insufficient_credits" && guard.payload) {
      return NextResponse.json(guard.payload, { status: 402 });
    }
    return NextResponse.json(
      {
        success: false,
        error: {
          code: guard.reason,
          message:
            guard.reason === "monthly_limit_reached"
              ? `Monthly review analysis limit reached (${guard.monthlyUsed}/${guard.monthlyLimit}).`
              : "Insufficient AI credits.",
          topUpRequired: guard.topUpRequired,
          monthlyUsed: guard.monthlyUsed,
          monthlyLimit: guard.monthlyLimit,
          monthlyRemaining: Math.max(0, guard.monthlyLimit - guard.monthlyUsed),
          resetsAt: nextReviewAnalysisResetIso(),
          remaining: guard.creditsRemaining,
        },
      },
      { status: guard.reason === "monthly_limit_reached" ? 429 : 402 },
    );
  }

  // ── Step 4: Deduct credits before calling Gemini ─────────────────────────
  //
  // Consume-first pattern: credits are deducted now and refunded if Gemini
  // fails. This prevents double-charges on retries and eliminates credit leaks.
  const consume = await consumeWorkspaceAiCredits(supabase, {
    workspaceId,
    userId,
    amount: COST,
    description: `Common Issues analysis: ${packageName} (${langCode}, ${country})`,
    sourceType: "generation",
    meta: { packageName, langCode, country, feature: "reviews_issue_analysis" },
  });

  if (!consume.ok) {
    if (consume.code === "insufficient_credits") {
      return NextResponse.json(
        buildInsufficientAiCreditsPayload(COST, consume.remaining ?? guard.creditsRemaining),
        { status: 402 },
      );
    }
    return NextResponse.json(
      { success: false, error: { code: consume.code, message: "Credit debit failed." } },
      { status: 500 },
    );
  }

  const ledgerId = consume.ledgerId;

  // ── Step 5: Call Gemini ───────────────────────────────────────────────────
  //
  // generateReviewAnalysis returns { issues: IssueItem[], usage }.
  // An empty issues array is a valid result (Gemini found no clusters) —
  // this is distinct from the zero-review short-circuit above. Credits are
  // charged, the result is cached, and hasBeenAnalyzed=true is returned.
  let issues: IssueItem[];
  let usage = null;

  try {
    const result = await generateReviewAnalysis({
      reviewTexts,
      langCode,
      appName: packageName,
    });
    issues = result.issues;
    usage = result.usage;
  } catch (err) {
    // Refund on model failure — user is not charged for a failed call.
    await refundWorkspaceAiCredits(supabase, {
      ledgerId,
      userId,
      reason: `Gemini error during reviews_issue_analysis: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    const message = err instanceof Error ? err.message : "Gemini call failed";
    return NextResponse.json(
      { success: false, error: { code: "gemini_error", message } },
      { status: 502 },
    );
  }

  // ── Step 6: Upsert result into competitor_insights ────────────────────────
  //
  // Written regardless of issues.length — even an empty Gemini result proves
  // the analysis ran. getCachedInsights checks Array.isArray(insights) so an
  // empty array here will correctly return hasBeenAnalyzed=true on subsequent
  // GET requests (no paywall, show "No Pain-Point Clusters Found").
  const competitorInsightsId = await upsertInsights(
    workspaceId,
    packageName,
    langCode,
    country,
    issues,
    ledgerId,
  );

  const vaultLocale = langCode.startsWith("ar") ? "ar" : "en";
  const pending =
    competitorInsightsId != null
      ? await savePendingReviewInsights(supabase, {
          workspaceId,
          packageName,
          country,
          langCode,
          competitorInsightsId,
          analysisTransactionId: ledgerId,
          issues,
          locale: vaultLocale,
          userId,
        })
      : { savedCount: 0 };

  // ── Step 7: COGS tracking (fire-and-forget) ───────────────────────────────
  void logAdminAiTransaction({
    userId,
    workspaceId,
    featureSlug: "reviews_issue_analysis",
    providerService: "gemini",
    usage,
    creditsCharged: COST,
  });

  const nowIso = new Date().toISOString();
  return successJson(
    {
      success: true,
      hasBeenAnalyzed: true,
      insights: issues,
      updatedAt: nowIso,
      analysisStatus: "SUCCESS_PAID",
      transactionId: ledgerId,
      bridge: {
        savedCount: pending.savedCount,
      },
      usage: {
        monthlyUsed: guard.monthlyUsed + 1,
        monthlyLimit: guard.monthlyLimit,
      },
    },
    { route: ROUTE, source: "gemini", count: issues.length, reviewsAnalysed: reviewTexts.length, pending },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/workspaces/[workspaceId]/reviews/analyze
 *
 * Query params:
 *   packageName  (required) — Android package identifier
 *   langCode     (optional, default "en") — BCP-47 language tag
 *   country      (optional, default "us") — ISO 3166-1 alpha-2 market code
 *
 * Lightweight cache probe implementing a Lazy Eviction strategy.
 * Never calls Gemini. Never charges credits. No background cron required —
 * staleness is evaluated on demand at read time.
 *
 * ── Lazy Eviction flow ────────────────────────────────────────────────────────
 *
 *   1. Query the competitor_insights row for (workspaceId, packageName, country).
 *   2. If no row exists → cache miss → hasBeenAnalyzed=false.
 *   3. If a row exists, extract updated_at and compute age in hours:
 *        totalHoursAge = (Date.now() - updated_at) / (1000 * 60 * 60)
 *   4. If totalHoursAge > CACHE_TTL_HOURS (168h / 7 days) → expired miss → hasBeenAnalyzed=false.
 *      The stale row is left in the DB untouched; the next POST call will overwrite it.
 *   5. If totalHoursAge ≤ 168 → valid hit → hasBeenAnalyzed=true, return cached insights.
 *
 * ── Response contract ─────────────────────────────────────────────────────────
 *
 *   hasBeenAnalyzed=false  →  Cache miss or expired row. Client shows paywall.
 *                              Covers: no row | row older than 7 days |
 *                                      row with null insights (pre-paywall artifact)
 *
 *   hasBeenAnalyzed=true   →  Fresh row (≤7 days old) from a real Gemini run.
 *                              Client skips paywall; branch on insights.length:
 *                                insights=[]  → "No Pain-Point Clusters Found"
 *                                insights>0   → IssueCard grid
 */
export async function GET(request: NextRequest, context: Ctx) {
  const { workspaceId } = await context.params;
  const sp = request.nextUrl.searchParams;

  const packageName = sp.get("packageName") ?? "";
  const langCode    = (sp.get("langCode") ?? "en").toLowerCase();
  const country     = (sp.get("country")  ?? "us").toLowerCase();

  let input: AnalyzeBody;
  try {
    input = analyzeBodySchema.parse({
      packageName,
      langCode,
      country,
      reviewTexts: [],
      force: false,
    });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "validation_error", message: "Invalid query", details: e.flatten() } },
        { status: 400 },
      );
    }
    throw e;
  }

  return withAuth(workspaceId, async () => {
    // ── Step 1: Query cached row ───────────────────────────────────────────
    // getCachedInsights returns null when no row exists OR when the row's
    // insights column is null/non-array (written by pre-paywall code).
    const cached = await getCachedInsights(
      workspaceId,
      input.packageName,
      input.langCode,
      input.country,
    );

    // ── Step 2: Cache miss — no row or null insights ───────────────────────
    if (!cached) {
      return successJson(
        { success: true, hasBeenAnalyzed: false, insights: [] },
        { route: ROUTE, reason: "no_row" },
      );
    }

    // ── Step 3: Lazy eviction — explicit age calculation ──────────────────
    // Compute the row's age in hours and compare against the 7-day TTL.
    // The stale row is NOT deleted here — it is left in place and overwritten
    // by the next POST call. This is the Lazy Eviction pattern: staleness is
    // detected at read time with zero background worker overhead.
    const lastUpdated   = new Date(cached.updated_at);
    const totalHoursAge = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);

    if (totalHoursAge > CACHE_TTL_HOURS) {
      // ── Step 4: Expired cache miss ───────────────────────────────────────
      // Row is older than CACHE_TTL_HOURS (168h / 7 days). Treat as a miss.
      // Client will show the paywall; next POST will overwrite the stale row.
      console.info(
        `[${ROUTE}] lazy eviction: row age ${totalHoursAge.toFixed(1)}h > ${CACHE_TTL_HOURS}h TTL`,
        { workspaceId, packageName: input.packageName, country: input.country },
      );
      return successJson(
        { success: true, hasBeenAnalyzed: false, insights: [] },
        { route: ROUTE, reason: "expired", ageHours: Math.round(totalHoursAge) },
      );
    }

    // ── Step 5: Valid cache hit ────────────────────────────────────────────
    // Row is within the 7-day window. Return cached insights directly.
    // getCachedInsights already verified Array.isArray(data.insights) so cast is safe.
    const insights = cached.insights as IssueItem[];
    return successJson(
      { success: true, hasBeenAnalyzed: true, insights, updatedAt: cached.updated_at },
      { route: ROUTE, reason: "hit", ageHours: Math.round(totalHoursAge), count: insights.length },
    );
  });
}

/**
 * POST /api/workspaces/[workspaceId]/reviews/analyze
 *
 * Body (JSON):
 *   packageName   string    — Android package identifier
 *   langCode?     string    — BCP-47 lang tag, default "en"
 *   country?      string    — ISO 3166-1 alpha-2, default "us"
 *   reviewTexts?  string[]  — ≤2★ review bodies from the client's sync
 *   force?        boolean   — bypass cache, default false
 *
 * Execution path:
 *   1. Fresh cache hit (force=false) → return cache, hasBeenAnalyzed=true, no charge
 *   2. reviewTexts=[] → return hasBeenAnalyzed=false, no charge, no DB write
 *   3. Credits < 3   → 402
 *   4. Deduct credits → call Gemini → upsert DB → return hasBeenAnalyzed=true
 *   5. Gemini failure → refund credits → 502
 */
export async function POST(request: NextRequest, context: Ctx) {
  const { workspaceId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "bad_request", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  let input: AnalyzeBody;
  try {
    input = analyzeBodySchema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "validation_error", message: "Invalid input", details: e.flatten() } },
        { status: 400 },
      );
    }
    throw e;
  }

  return withAuth(workspaceId, (userId, supabase) =>
    handleAnalyze(workspaceId, input, userId, supabase),
  );
}
