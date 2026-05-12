import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkspaceRole = "owner" | "admin" | "member";

export async function getWorkspaceRole(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.role) return null;
  const r = data.role as string;
  if (r === "owner" || r === "admin" || r === "member") return r;
  return null;
}
