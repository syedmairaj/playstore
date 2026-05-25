import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  fetchPlayReviewsMultiLang,
  fetchedPlayReviewToRow,
} from "@/lib/play-store/fetch-play-reviews";
import { getHlsForCountry } from "@/lib/play-store/country-lang-map";
import { createClient } from "@/lib/supabase/server";
import { reviewSyncBodySchema } from "@/lib/validation/review-sync-body";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "GET|POST /api/workspaces/[workspaceId]/reviews/sync";

type Ctx = { params: Promise<{ workspaceId: string }> };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads the first valid ISO-3166 alpha-2 country code from the app's
 * `target_countries` array.  Falls back to "us".
 */
function primaryCountryFromApp(
  targetCountries: string[] | null | undefined,
): string {
  const first = targetCountries?.[0];
  if (typeof first === "string" && first.trim().length === 2) {
    return first.trim().toLowerCase();
  }
  return "us";
}

// ─────────────────────────────────────────────────────────────────────────────
// Core handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleSync(
  workspaceId: string,
  input: {
    appId?: string;
    packageName?: string;
    num?: number;
    country?: string;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "forbidden", message: "Workspace not found or inaccessible" },
      },
      { status: 403 },
    );
  }

  // ── Competitor fast-path ──────────────────────────────────────────────────
  // When `packageName` is supplied directly the caller is a competitor tab.
  // We skip the `apps` DB lookup (competitors are NOT rows in the apps table)
  // and scrape the Play Store directly via the multi-lang fetcher.
  //
  // The multi-lang fetcher resolves the correct hl[] for the given gl (country)
  // automatically:
  //   - "ae" → concurrent hl=en + hl=ar passes, merged + deduplicated
  //   - "in" → single hl=en pass
  //   - default → single hl=en pass
  if (typeof input.packageName === "string" && input.packageName.trim()) {
    const packageName = input.packageName.trim();
    const country = input.country ?? "us";
    const langs = getHlsForCountry(country);

    const fetched = await fetchPlayReviewsMultiLang({
      appId: packageName,
      country,
      num: input.num,
    });

    const reviews = fetched.map((r) => fetchedPlayReviewToRow(r));

    return NextResponse.json({
      ok: true,
      data: {
        reviews,
        packageName,
        country,
        langs,       // which hl passes ran — useful for client-side debug/display
        persisted: false,
      },
      meta: { route: ROUTE, count: reviews.length, passes: langs.length },
    });
  }

  // ── Primary app path: DB lookup by appId (UUID) ───────────────────────────
  if (!input.appId) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "bad_request",
          message: "Provide either appId (UUID) or packageName (Android package ID)",
        },
      },
      { status: 400 },
    );
  }

  const { data: app, error: appError } = await supabase
    .from("apps")
    .select("id, name, package_name, target_countries")
    .eq("workspace_id", workspaceId)
    .eq("id", input.appId)
    .maybeSingle();

  if (appError || !app) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "App not found in workspace" } },
      { status: 404 },
    );
  }

  const packageName =
    typeof app.package_name === "string" && app.package_name.trim()
      ? app.package_name.trim()
      : null;

  if (!packageName) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "no_package_name",
          message: "Set the app's package name before syncing reviews.",
        },
      },
      { status: 400 },
    );
  }

  // Prefer the caller-supplied country (already validated to 2 chars).
  // Fall back to the app's configured target_countries, then "us".
  const country =
    input.country ??
    primaryCountryFromApp(
      Array.isArray(app.target_countries) ? (app.target_countries as string[]) : null,
    );

  const langs = getHlsForCountry(country);

  // ── Multi-language concurrent fetch + dedup ───────────────────────────────
  // fetchPlayReviewsMultiLang internally:
  //   1. Resolves hl[] for the given gl via country-lang-map.
  //   2. Fires one Promise per hl concurrently.
  //   3. Merges all results and deduplicates by review.id (first-pass wins).
  // Each returned item carries `lang` so the client can partition by language.
  const fetched = await fetchPlayReviewsMultiLang({
    appId: packageName,
    country,
    num: input.num,
  });

  const reviews = fetched.map((r) => fetchedPlayReviewToRow(r));

  return NextResponse.json({
    ok: true,
    data: {
      reviews,
      appId: app.id,
      packageName,
      country,
      langs,        // e.g. ["en"] for India, ["en", "ar"] for UAE
      persisted: false,
    },
    meta: { route: ROUTE, count: reviews.length, passes: langs.length },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, context: Ctx) {
  const { workspaceId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  let input;
  try {
    input = reviewSyncBodySchema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "validation_error", message: "Invalid input", details: e.flatten() },
        },
        { status: 400 },
      );
    }
    throw e;
  }

  return handleSync(workspaceId, input);
}

export async function GET(request: NextRequest, context: Ctx) {
  const { workspaceId } = await context.params;
  const sp = request.nextUrl.searchParams;

  const appId = sp.get("appId") ?? undefined;
  const packageName = sp.get("packageName") ?? undefined;
  const numRaw = sp.get("num");
  const country = sp.get("country") ?? undefined;
  // NOTE: "lang" query param is intentionally NOT read here.
  // Language selection is fully server-owned via country-lang-map.ts.

  let input;
  try {
    input = reviewSyncBodySchema.parse({
      appId,
      packageName,
      num: numRaw != null ? Number(numRaw) : undefined,
      country,
    });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "validation_error", message: "Invalid query", details: e.flatten() },
        },
        { status: 400 },
      );
    }
    throw e;
  }

  return handleSync(workspaceId, input);
}
