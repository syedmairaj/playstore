import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  fetchPlayReviews,
  fetchedPlayReviewToRow,
} from "@/lib/play-store/fetch-play-reviews";
import { createClient } from "@/lib/supabase/server";
import { reviewSyncBodySchema } from "@/lib/validation/review-sync-body";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "POST /api/workspaces/[workspaceId]/reviews/sync";

type Ctx = { params: Promise<{ workspaceId: string }> };

function primaryCountryFromApp(targetCountries: string[] | null | undefined): string {
  const first = targetCountries?.[0];
  if (typeof first === "string" && first.trim().length === 2) {
    return first.trim().toLowerCase();
  }
  return "us";
}

async function handleSync(
  workspaceId: string,
  input: { appId: string; num?: number; country?: string; lang?: string },
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
      { ok: false, error: { code: "forbidden", message: "Workspace not found or inaccessible" } },
      { status: 403 },
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

  const country =
    input.country ??
    primaryCountryFromApp(
      Array.isArray(app.target_countries) ? (app.target_countries as string[]) : null,
    );

  const fetched = await fetchPlayReviews({
    appId: packageName,
    country,
    lang: input.lang,
    num: input.num,
  });

  const reviews = fetched.map((r) => fetchedPlayReviewToRow(r));

  // No `reviews` table in live schema yet — return payload for client-side demo replacement.
  return NextResponse.json({
    ok: true,
    data: {
      reviews,
      appId: app.id,
      packageName,
      country,
      persisted: false,
    },
    meta: { route: ROUTE, count: reviews.length },
  });
}

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
          error: {
            code: "validation_error",
            message: "Invalid input",
            details: e.flatten(),
          },
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
  const appId = request.nextUrl.searchParams.get("appId");
  const numRaw = request.nextUrl.searchParams.get("num");
  const country = request.nextUrl.searchParams.get("country") ?? undefined;
  const lang = request.nextUrl.searchParams.get("lang") ?? undefined;

  let input;
  try {
    input = reviewSyncBodySchema.parse({
      appId,
      num: numRaw != null ? Number(numRaw) : undefined,
      country,
      lang,
    });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "validation_error",
            message: "Invalid query",
            details: e.flatten(),
          },
        },
        { status: 400 },
      );
    }
    throw e;
  }

  return handleSync(workspaceId, input);
}
