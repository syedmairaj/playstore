import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import {
  listListingVersions,
  createListingVersion,
} from "@/lib/db/listing-versions";
import { z } from "zod";

const createBodySchema = z.object({
  appId: z.string().uuid().optional().nullable(),
  vaultLocale: z.enum(["en", "ar"]).default("en"),
  title: z.string().min(1).max(30).optional().nullable(),
  shortDescription: z.string().max(80).optional().nullable(),
  longDescription: z.string().max(4000).optional().nullable(),
  keywordSuggestions: z.array(z.string()).max(30).optional(),
  ctaSuggestions: z.array(z.string()).max(10).optional(),
  sourceQueueHash: z.string().optional().nullable(),
  sourceJobId: z.string().optional().nullable(),
});

/**
 * GET /api/workspaces/[workspaceId]/listing-versions
 * List all listing versions for a workspace.
 *
 * Query params:
 *   appId?      — filter by app
 *   locale?     — "en" | "ar"
 *   limit?      — default 20
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) return NextResponse.json({ ok: false, error: { message: "Forbidden" } }, { status: 403 });

  const url = new URL(_req.url);
  const appId = url.searchParams.get("appId") ?? undefined;
  const locale = url.searchParams.get("locale") as "en" | "ar" | undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 50);

  const versions = await listListingVersions({
    workspaceId,
    appId: appId ?? undefined,
    vaultLocale: locale,
    limit,
  });

  return NextResponse.json({ ok: true, versions });
}

/**
 * POST /api/workspaces/[workspaceId]/listing-versions
 * Manually promote the current draft to a new ListingVersion.
 *
 * Body: { appId?, vaultLocale?, title?, shortDescription?, longDescription?,
 *         keywordSuggestions?, ctaSuggestions?, sourceQueueHash?, sourceJobId? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) return NextResponse.json({ ok: false, error: { message: "Forbidden" } }, { status: 403 });

  const raw = await req.json().catch(() => null);
  const parsed = createBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "validation_error", message: parsed.error.message } },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const version = await createListingVersion({
    workspaceId,
    appId: body.appId ?? null,
    vaultLocale: body.vaultLocale,
    createdBy: user.id,
    title: body.title,
    shortDescription: body.shortDescription,
    longDescription: body.longDescription,
    keywordSuggestions: body.keywordSuggestions,
    ctaSuggestions: body.ctaSuggestions,
    sourceQueueHash: body.sourceQueueHash,
    sourceJobId: body.sourceJobId,
  });

  return NextResponse.json({ ok: true, version }, { status: 201 });
}
