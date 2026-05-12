import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createWorkspaceSchema } from "@/lib/validation/api";

export async function GET() {
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

  const { data, error } = await supabase
    .from("workspaces")
    .select("id,name,created_at,plan,onboarding_state")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, workspaces: data ?? [] });
}

export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  try {
    const { name } = createWorkspaceSchema.parse(body);
    const { data: workspaceId, error: rpcError } = await supabase.rpc("create_new_workspace", {
      p_name: name,
    });

    if (rpcError || !workspaceId) {
      const raw = rpcError?.message ?? "";
      const missingRpc =
        !!rpcError &&
        (/could not find.*function/i.test(raw) ||
          /schema cache/i.test(raw));
      const message = missingRpc
        ? "Workspace RPC is missing on the database. Apply migrations (e.g. supabase db push) so public.create_new_workspace(text) exists."
        : raw || "Could not create workspace";
      if (rpcError) {
        console.error("[api/workspaces] create_new_workspace:", rpcError);
      }
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: missingRpc ? "workspace_rpc_missing" : "workspace_create_failed",
            message,
          },
        },
        { status: missingRpc ? 503 : 500 },
      );
    }

    const { data: ws, error: fetchError } = await supabase
      .from("workspaces")
      .select("id,name,created_at,onboarding_state")
      .eq("id", workspaceId as string)
      .single();

    if (fetchError || !ws) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "workspace_fetch_failed",
            message: fetchError?.message ?? "Workspace created but could not be loaded",
          },
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, workspace: ws });
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
}
