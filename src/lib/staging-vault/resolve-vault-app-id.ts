import type { SupabaseClient } from "@supabase/supabase-js";

const WORKSPACE_APP_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve app_id for universal vault rows (required by schema). */
export async function resolveVaultAppId(
  supabase: SupabaseClient,
  workspaceId: string,
  preferredAppId?: string | null,
): Promise<string | null> {
  const trimmed = preferredAppId?.trim();
  if (trimmed) {
    if (WORKSPACE_APP_UUID_RE.test(trimmed)) {
      return trimmed;
    }

    const { data: byPackage, error: packageError } = await supabase
      .from("apps")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("package_name", trimmed)
      .maybeSingle();

    if (packageError) {
      console.warn("[VaultCore] resolveVaultAppId package lookup failed:", packageError.message);
    } else if (byPackage?.id) {
      return byPackage.id as string;
    }
  }

  const { data, error } = await supabase
    .from("apps")
    .select("id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[VaultCore] resolveVaultAppId failed:", error.message);
    return null;
  }

  return (data?.id as string | undefined) ?? null;
}
