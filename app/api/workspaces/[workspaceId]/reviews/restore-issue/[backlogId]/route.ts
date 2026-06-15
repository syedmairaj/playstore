import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { restoreStagedReviewIssue } from "@/lib/review-insights/restore-staged-review-issue";
import { removeFromOptimizationQueue } from "@/lib/optimization-queue/optimization-queue.service";

type Ctx = { params: Promise<{ workspaceId: string }> };

const bodySchema = z.object({
  locale: z.enum(["en", "ar"]).default("en"),
  appId: z.string().uuid().optional(),
});

/**
 * POST /api/workspaces/[workspaceId]/reviews/restore-issue/[backlogId]
 * Restore archived insight to Active Context.
 */
export async function POST(request: NextRequest, context: Ctx & { params: Promise<{ workspaceId: string; backlogId: string }> }) {
  try {
    const { workspaceId, backlogId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const role = await getWorkspaceRole(supabase, workspaceId, user.id);
    if (!role) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const result = await restoreStagedReviewIssue(supabase, workspaceId, backlogId, {
      locale: body.locale,
      appId: body.appId ?? null,
      userId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.message, code: result.code },
        { status: result.code === "not_found" ? 404 : 500 },
      );
    }

    return NextResponse.json({ ok: true, queueItemId: result.queueItemId, title: result.title });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ ok: false, error: "Validation error" }, { status: 422 });
    }
    console.error("[reviews/restore-issue] POST error:", error);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE — remove from archive and optimization queue.
 */
export async function DELETE(_request: NextRequest, context: Ctx & { params: Promise<{ workspaceId: string; backlogId: string }> }) {
  try {
    const { workspaceId, backlogId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const role = await getWorkspaceRole(supabase, workspaceId, user.id);
    if (!role) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { data: row } = await supabase
      .from("workspace_listing_backlog")
      .select("metadata")
      .eq("workspace_id", workspaceId)
      .eq("id", backlogId)
      .maybeSingle();

    const meta = (row?.metadata ?? {}) as Record<string, unknown>;
    const queueItemId = typeof meta.queue_item_id === "string" ? meta.queue_item_id : null;

    if (queueItemId) {
      for (const locale of ["en", "ar"] as const) {
        try {
          await removeFromOptimizationQueue(supabase, workspaceId, locale, queueItemId, {
            userId: user.id,
          });
        } catch {
          /* best effort */
        }
      }
    }

    const { error } = await supabase
      .from("workspace_listing_backlog")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", backlogId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[reviews/restore-issue] DELETE error:", error);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
