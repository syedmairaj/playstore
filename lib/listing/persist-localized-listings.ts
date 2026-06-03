import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalizedMarketRecord } from "@/lib/listing/localized-markets";

export const WORKSPACE_LOCALIZED_LISTINGS_TABLE = "workspace_localized_listings";

type UpsertRow = {
  workspace_id: string;
  app_id: string;
  market: string;
  title: string;
  short_description: string;
  long_description: string;
  keywords: string[];
  updated_at: string;
};

/** Upserts localized listing rows for one workspace app (caller verifies membership + app). */
export async function upsertWorkspaceLocalizedListings(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
  markets: LocalizedMarketRecord[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (markets.length === 0) return { ok: true };

  const now = new Date().toISOString();
  const rows: UpsertRow[] = markets.map((m) => ({
    workspace_id: workspaceId,
    app_id: appId,
    market: m.market,
    title: m.title,
    short_description: m.shortDescription,
    long_description: m.longDescription,
    keywords: m.keywords,
    updated_at: now,
  }));

  const { error } = await supabase
    .from(WORKSPACE_LOCALIZED_LISTINGS_TABLE)
    .upsert(rows, { onConflict: "workspace_id,app_id,market" });

  if (error) {
    return { ok: false, message: error.message ?? "Upsert failed" };
  }
  return { ok: true };
}

/** Removes one persisted localized listing row for a workspace app. */
export async function deleteWorkspaceLocalizedListing(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
  market: string,
): Promise<
  | { ok: true }
  | { ok: false; message: string; notFound?: boolean; pgError?: { code?: string; message?: string } }
> {
  const { data, error } = await supabase
    .from(WORKSPACE_LOCALIZED_LISTINGS_TABLE)
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId)
    .eq("market", market)
    .select("market")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      message: error.message ?? "Delete failed",
      pgError: { code: error.code, message: error.message },
    };
  }
  if (!data) {
    return { ok: false, message: "Localized listing not found", notFound: true };
  }
  return { ok: true };
}
