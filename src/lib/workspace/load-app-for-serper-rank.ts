import type { SupabaseClient } from "@supabase/supabase-js";
import { isPostgrestColumnMissing } from "@/lib/supabase/postgrest-errors";

const APP_SELECT_FULL =
  "id,package_name,canonical_package_id,serp_matched_package_id,name,target_countries" as const;
const APP_SELECT_WITH_CANONICAL =
  "id,package_name,canonical_package_id,name,target_countries" as const;
const APP_SELECT_BASE = "id,package_name,name,target_countries" as const;

const COMPETITOR_SELECT_FULL =
  "competitor_package_id,canonical_package_id,serp_matched_package_id,competitor_name,icon_url" as const;
const COMPETITOR_SELECT_WITH_CANONICAL =
  "competitor_package_id,canonical_package_id,competitor_name,icon_url" as const;
const COMPETITOR_SELECT_BASE =
  "competitor_package_id,competitor_name,icon_url" as const;

function isOptionalSerperColumnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  return (
    isPostgrestColumnMissing(error, "apps") ||
    isPostgrestColumnMissing(error, "workspace_competitor_analyses") ||
    msg.includes("canonical_package_id") ||
    msg.includes("serp_matched_package_id")
  );
}

export type AppForSerperRankRow = {
  id: string;
  package_name: string | null;
  canonical_package_id: string | null;
  serp_matched_package_id: string | null;
  name: string | null;
  target_countries: string[] | null;
};

export type CompetitorForSerperRankRow = {
  competitor_package_id: string;
  canonical_package_id: string | null;
  serp_matched_package_id: string | null;
  competitor_name: string | null;
  icon_url: string | null;
};

function parseAppRow(raw: Record<string, unknown>): AppForSerperRankRow {
  return {
    id: String(raw.id ?? ""),
    package_name:
      typeof raw.package_name === "string" && raw.package_name.trim()
        ? raw.package_name.trim()
        : null,
    canonical_package_id:
      typeof raw.canonical_package_id === "string" && raw.canonical_package_id.trim()
        ? raw.canonical_package_id.trim()
        : null,
    serp_matched_package_id:
      typeof raw.serp_matched_package_id === "string" && raw.serp_matched_package_id.trim()
        ? raw.serp_matched_package_id.trim()
        : null,
    name:
      typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null,
    target_countries: Array.isArray(raw.target_countries)
      ? (raw.target_countries as string[])
      : null,
  };
}

function parseCompetitorRow(raw: Record<string, unknown>): CompetitorForSerperRankRow | null {
  const pkg =
    typeof raw.competitor_package_id === "string" ? raw.competitor_package_id.trim() : "";
  if (!pkg) return null;
  return {
    competitor_package_id: pkg,
    canonical_package_id:
      typeof raw.canonical_package_id === "string" && raw.canonical_package_id.trim()
        ? raw.canonical_package_id.trim()
        : null,
    serp_matched_package_id:
      typeof raw.serp_matched_package_id === "string" && raw.serp_matched_package_id.trim()
        ? raw.serp_matched_package_id.trim()
        : null,
    competitor_name:
      typeof raw.competitor_name === "string" ? raw.competitor_name : null,
    icon_url: typeof raw.icon_url === "string" ? raw.icon_url : null,
  };
}

/** Load workspace app for Serper rank resolution; falls back when canonical column is missing. */
export async function loadAppForSerperRank(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
): Promise<{ data: AppForSerperRankRow | null; error: { message: string } | null }> {
  let result = await supabase
    .from("apps")
    .select(APP_SELECT_FULL)
    .eq("id", appId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (result.error && isOptionalSerperColumnMissing(result.error)) {
    result = await supabase
      .from("apps")
      .select(APP_SELECT_WITH_CANONICAL)
      .eq("id", appId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
  }
  if (result.error && isOptionalSerperColumnMissing(result.error)) {
    result = await supabase
      .from("apps")
      .select(APP_SELECT_BASE)
      .eq("id", appId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
  }

  if (result.error) {
    return { data: null, error: { message: result.error.message } };
  }
  if (!result.data) {
    return { data: null, error: null };
  }

  return {
    data: parseAppRow(result.data as Record<string, unknown>),
    error: null,
  };
}

/** Top-N competitor slots for Serper rank resolution; falls back when canonical column is missing. */
export async function loadCompetitorsForSerperRank(
  supabase: SupabaseClient,
  workspaceId: string,
  limit = 2,
): Promise<{ data: CompetitorForSerperRankRow[]; error: { message: string } | null }> {
  let result = await supabase
    .from("workspace_competitor_analyses")
    .select(COMPETITOR_SELECT_FULL)
    .eq("workspace_id", workspaceId)
    .order("analyzed_at", { ascending: false })
    .limit(limit);

  if (result.error && isOptionalSerperColumnMissing(result.error)) {
    result = await supabase
      .from("workspace_competitor_analyses")
      .select(COMPETITOR_SELECT_WITH_CANONICAL)
      .eq("workspace_id", workspaceId)
      .order("analyzed_at", { ascending: false })
      .limit(limit);
  }
  if (result.error && isOptionalSerperColumnMissing(result.error)) {
    result = await supabase
      .from("workspace_competitor_analyses")
      .select(COMPETITOR_SELECT_BASE)
      .eq("workspace_id", workspaceId)
      .order("analyzed_at", { ascending: false })
      .limit(limit);
  }

  if (result.error) {
    return { data: [], error: { message: result.error.message } };
  }

  const data = (result.data ?? [])
    .map((row) => parseCompetitorRow(row as Record<string, unknown>))
    .filter((row): row is CompetitorForSerperRankRow => row != null);

  return { data, error: null };
}
