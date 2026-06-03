import { NextResponse } from "next/server";
import { fetchPlanMarginRows } from "@/lib/admin/ai-analytics";
import { requireAdminApiAuth } from "@/lib/admin/require-admin-api";

export async function GET() {
  const auth = await requireAdminApiAuth();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: { code: auth.status === 401 ? "unauthorized" : "forbidden" } },
      { status: auth.status },
    );
  }

  const result = await fetchPlanMarginRows();
  if (!result.ok) {
    const status = result.code === "schema_unavailable" ? 503 : 500;
    return NextResponse.json(
      { ok: false, error: { code: result.code, message: result.message } },
      { status },
    );
  }

  return NextResponse.json({ ok: true, rows: result.rows });
}
