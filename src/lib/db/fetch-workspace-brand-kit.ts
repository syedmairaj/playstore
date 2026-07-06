import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandKitSignal } from "@/lib/listing/generation-signal-context.types";
import { EMPTY_BRAND_KIT_SIGNAL } from "@/lib/listing/generation-signal-context.types";

type BrandAssetMetaRaw = {
  style?: string;
  brandColor?: string;
  palette?: string | string[];
  customPrompt?: string;
  toneGuidelines?: string;
  [key: string]: unknown;
};

type BrandAssetRow = {
  meta: BrandAssetMetaRaw | null;
  asset_type: string;
  created_at: string;
};

function normalizePalette(raw: string | string[] | undefined): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.filter(Boolean).join(", ");
  return raw.trim() || null;
}

/**
 * Fetches the latest approved brand asset for a workspace and extracts the
 * `BrandKitSignal` (color, style, tone guidelines) from `brand_assets.meta`.
 *
 * Returns `EMPTY_BRAND_KIT_SIGNAL` when no brand assets exist — the pipeline
 * continues without brand guidance rather than throwing.
 */
export async function fetchWorkspaceBrandKit(
  supabase: SupabaseClient,
  workspaceId: string,
  appId?: string | null,
): Promise<BrandKitSignal> {
  try {
    let query = supabase
      .from("brand_assets")
      .select("meta, asset_type, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (appId) {
      query = query.eq("app_id", appId);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      return EMPTY_BRAND_KIT_SIGNAL;
    }

    const rows = data as BrandAssetRow[];
    const meta = rows[0]?.meta;

    if (!meta) return EMPTY_BRAND_KIT_SIGNAL;

    const style = typeof meta.style === "string" && meta.style.trim() ? meta.style.trim() : null;
    const primaryColor =
      typeof meta.brandColor === "string" && meta.brandColor.trim() ? meta.brandColor.trim() : null;
    const colorPalette = normalizePalette(meta.palette);
    const toneGuidelines =
      typeof meta.toneGuidelines === "string" && meta.toneGuidelines.trim()
        ? meta.toneGuidelines.trim()
        : style
          ? `${style} visual style`
          : null;

    return { primaryColor, style, colorPalette, toneGuidelines };
  } catch {
    // Non-blocking — brand kit is best-effort enrichment, not a hard dependency.
    return EMPTY_BRAND_KIT_SIGNAL;
  }
}
