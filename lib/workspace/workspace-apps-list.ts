import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkspaceAppListRow = {
  id: string;
  name: string;
  /** Android application id when set — required for Serper rank save/refresh. */
  package_name?: string | null;
  /** Play Store target markets (e.g. `US`) when column exists. */
  target_countries?: string[] | null;
  metadata?: Record<string, unknown> | null;
  /** HTTPS app icon when `apps.icon_url` column exists (preferred over metadata). */
  icon_url?: string | null;
  /** Play Store category — used for AI icon/banner generation. */
  category?: string | null;
  /** Play Store short description — used for AI generation context. */
  short_description?: string | null;
};

function looksLikeMissingColumn(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("metadata") ||
    m.includes("icon_url") ||
    m.includes("package_name") ||
    m.includes("target_countries") ||
    m.includes("does not exist") ||
    m.includes("42703") ||
    m.includes("undefined_column")
  );
}

/**
 * Lists workspace apps for pickers and the listing optimizer.
 * If `apps.metadata` is missing in the DB, falls back to `id,name` without failing the page.
 */
export async function queryWorkspaceAppsList(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<{ rows: WorkspaceAppListRow[]; error: { message: string } | null }> {
  const base = (columns: string) =>
    supabase
      .from("apps")
      .select(columns)
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true });

  // Helper to extract category/short_description safely from a raw row
  function extractAppFields(r: Record<string, unknown>): WorkspaceAppListRow {
    return {
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      package_name:
        typeof r.package_name === "string" && r.package_name.trim()
          ? r.package_name.trim()
          : null,
      target_countries: Array.isArray(r.target_countries)
        ? (r.target_countries as string[])
        : null,
      metadata:
        (r.metadata as Record<string, unknown> | null | undefined) ?? null,
      icon_url:
        typeof r.icon_url === "string" && r.icon_url.trim()
          ? r.icon_url.trim()
          : null,
      category:
        typeof r.category === "string" && r.category.trim()
          ? r.category.trim()
          : null,
      short_description:
        typeof r.short_description === "string" && r.short_description.trim()
          ? r.short_description.trim()
          : null,
    };
  }

  const withIcon = await base("id,name,package_name,target_countries,metadata,icon_url,category,short_description");
  if (!withIcon.error) {
    const raw = (withIcon.data ?? []) as unknown as Array<Record<string, unknown>>;
    return { rows: raw.map(extractAppFields), error: null };
  }

  if (looksLikeMissingColumn(withIcon.error.message ?? "")) {
    const metaOnly = await base("id,name,package_name,target_countries,metadata,category,short_description");
    if (!metaOnly.error) {
      const raw = (metaOnly.data ?? []) as unknown as Array<Record<string, unknown>>;
      return {
        rows: raw.map((r) => ({ ...extractAppFields(r), icon_url: null })),
        error: null,
      };
    }

    if (looksLikeMissingColumn(metaOnly.error.message ?? "")) {
      const names = await base("id,name,package_name,target_countries,category,short_description");
      if (names.error) {
        return { rows: [], error: { message: names.error.message } };
      }
      const raw = (names.data ?? []) as unknown as Array<Record<string, unknown>>;
      return {
        rows: raw.map((r) => ({ ...extractAppFields(r), metadata: null, icon_url: null })),
        error: null,
      };
    }

    return { rows: [], error: { message: metaOnly.error.message } };
  }

  return { rows: [], error: { message: withIcon.error.message } };
}
