/**
 * DELETE /api/workspaces/[workspaceId]/optimization-queue/[itemId]
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { removeFromOptimizationQueue } from "@/lib/optimization-queue";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue";

type Ctx = { params: Promise<{ workspaceId: string; itemId: string }> };

const querySchema = z.object({
  locale: z.enum(["en", "ar"]).default("en"),
  appId: z.string().uuid().optional(),
});

export async function DELETE(request: Request, context: Ctx) {
  try {
    const { workspaceId, itemId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getWorkspaceRole(supabase, workspaceId, user.id);
    if (!role) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const query = querySchema.parse({
      locale: url.searchParams.get("locale") ?? "en",
      appId: url.searchParams.get("appId") ?? undefined,
    });

    const removed = await removeFromOptimizationQueue(
      supabase,
      workspaceId,
      query.locale as OptimizationQueueLocale,
      itemId,
      { appId: query.appId, userId: user.id },
    );

    if (!removed) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.flatten() },
        { status: 422 },
      );
    }
    console.error("[optimization-queue] DELETE error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
