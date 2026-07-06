import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { fetchListingGenerationUsageBreakdown } from "@/lib/db/listing-generation-costs";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const querySchema = z.object({
  workspaceId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    workspaceId: request.nextUrl.searchParams.get("workspaceId"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation_error",
          message: "workspaceId query parameter is required",
        },
      },
      { status: 400 },
    );
  }

  const { workspaceId } = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
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

  const breakdown = await fetchListingGenerationUsageBreakdown(workspaceId);

  return NextResponse.json({
    ok: true,
    workspaceId,
    breakdown,
  });
}
