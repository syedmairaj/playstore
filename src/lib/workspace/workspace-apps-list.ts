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
  /**
   * Play Store category — extracted from metadata.category.
   * Used for AI icon/banner generation in Brand Assets.
   */
  category?: string | null;
  /**
   * Play Store short description — extracted from metadata.short_description.
   * Used for AI generation context in Brand Assets.
   */
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

/** Extract category and short_description from a metadata JSON blob. */
function metaStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function extractMeta(r: Record<string, unknown>): { category: string | null; short_description: string | null } {
  const meta = (r.metadata as Record<string, unknown> | null | undefined) ?? {};
  return {
    category: metaStr(meta.category),
    short_description:
      metaStr(meta.short_description) ??
      metaStr((meta as Record<string, unknown>).shortDescription),
  };
}

/**
 * Lists workspace apps for pickers and the listing optimizer.
 * If `apps.metadata` is missing in the DB, falls back to `id,name` without failing the page.
 * category and short_description are extracted from the metadata JSON blob —
 * they are NOT separate DB columns.
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

  const withIcon = await base("id,name,package_name,target_countries,metadata,icon_url");
  if (!withIcon.error) {
    const raw = (withIcon.data ?? []) as unknown as Array<Record<string, unknown>>;
    const rows = raw.map((r) => {
      const { category, short_description } = extractMeta(r);
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
        metadata: (r.metadata as Record<string, unknown> | null | undefined) ?? null,
        icon_url:
          typeof r.icon_url === "string" && r.icon_url.trim()
            ? r.icon_url.trim()
            : null,
        category,
        short_description,
      };
    });
    return { rows, error: null };
  }

  if (looksLikeMissingColumn(withIcon.error.message ?? "")) {
    const metaOnly = await base("id,name,package_name,target_countries,metadata");
    if (!metaOnly.error) {
      const raw = (metaOnly.data ?? []) as unknown as Array<Record<string, unknown>>;
      const rows = raw.map((r) => {
        const { category, short_description } = extractMeta(r);
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
          metadata: (r.metadata as Record<string, unknown> | null | undefined) ?? null,
          icon_url: null as null,
          category,
          short_description,
        };
      });
      return { rows, error: null };
    }

    if (looksLikeMissingColumn(metaOnly.error.message ?? "")) {
      const names = await base("id,name,package_name,target_countries");
      if (names.error) {
        return { rows: [], error: { message: names.error.message } };
      }
      const raw = (names.data ?? []) as unknown as Array<Record<string, unknown>>;
      const rows = raw.map((r) => ({
        id: String(r.id ?? ""),
        name: String(r.name ?? ""),
        package_name:
          typeof r.package_name === "string" && r.package_name.trim()
            ? r.package_name.trim()
            : null,
        target_countries: Array.isArray(r.target_countries)
          ? (r.target_countries as string[])
          : null,
        metadata: null as null,
        icon_url: null as null,
        category: null as null,
        short_description: null as null,
      }));
      return { rows, error: null };
    }

    return { rows: [], error: { message: metaOnly.error.message } };
  }

  return { rows: [], error: { message: withIcon.error.message } };
}
