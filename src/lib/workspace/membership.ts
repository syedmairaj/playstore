import type { SupabaseClient } from "@supabase/supabase-js";

const IS_DEV = process.env.NODE_ENV !== "production";

export type WorkspaceRole = "owner" | "admin" | "member";

function normalizeRole(value: unknown): WorkspaceRole | null {
  if (value == null) return null;
  const r = String(value);
  if (r === "owner" || r === "admin" || r === "member") return r;
  return null;
}

/**
 * Resolves the caller's role in a workspace. Prefer `workspace_role` RPC (SECURITY DEFINER,
 * see `docs/database.md`) so membership checks are not blocked by recursive RLS on
 * `workspace_members`. Falls back to a direct row read only if the RPC is unavailable.
 */
export async function getWorkspaceRole(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const { data: rpcRole, error: rpcError } = await supabase.rpc("workspace_role", {
    p_workspace_id: workspaceId,
  });

  if (!rpcError) {
    return normalizeRole(rpcRole);
  }

  if (IS_DEV) {
    console.warn(
      "[getWorkspaceRole] workspace_role RPC failed; falling back to workspace_members",
      rpcError,
    );
  }

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.role) return null;
  return normalizeRole(data.role);
}
