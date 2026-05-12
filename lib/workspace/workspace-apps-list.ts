import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkspaceAppListRow = {
  id: string;
  name: string;
  metadata?: Record<string, unknown> | null;
};

function looksLikeMissingColumn(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("metadata") ||
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

  const first = await base("id,name,metadata");
  if (!first.error) {
    const raw = (first.data ?? []) as unknown as Array<Record<string, unknown>>;
    const rows = raw.map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      metadata:
        (r.metadata as Record<string, unknown> | null | undefined) ?? null,
    }));
    return { rows, error: null };
  }

  if (looksLikeMissingColumn(first.error.message ?? "")) {
    const second = await base("id,name");
    if (second.error) {
      return { rows: [], error: { message: second.error.message } };
    }
    const raw = (second.data ?? []) as unknown as Array<Record<string, unknown>>;
    const rows = raw.map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      metadata: null as null,
    }));
    return { rows, error: null };
  }

  return { rows: [], error: { message: first.error.message } };
}
