import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { compressSignalsToContextPackage } from "@/lib/listing/signal-compressor";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue";

type Ctx = { params: Promise<{ workspaceId: string }> };

const ROUTE = "POST /api/workspaces/[workspaceId]/context-package/recompress";

export async function POST(request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: { code: "unauthorized" } }, { status: 401 });
    }

    const role = await getWorkspaceRole(supabase, workspaceId, user.id);
    if (!role) {
      return NextResponse.json({ ok: false, error: { code: "forbidden" } }, { status: 403 });
    }

    const body = (await request.json()) as {
      locale?: OptimizationQueueLocale;
      appId?: string;
    };
    const locale = body.locale === "ar" ? "ar" : "en";

    const pkg = await compressSignalsToContextPackage({
      supabase,
      workspaceId,
      locale,
      appId: body.appId,
    });

    return NextResponse.json({
      ok: true,
      compressedAt: pkg.compressedAt,
      signalPointCount: pkg.signalPoints.length,
      queueHash: pkg.queueHash,
    });
  } catch (error) {
    console.error(`[${ROUTE}]`, error);
    const message = error instanceof Error ? error.message : "Compression failed";
    return NextResponse.json(
      { ok: false, error: { code: "compression_failed", message } },
      { status: 500 },
    );
  }
}
