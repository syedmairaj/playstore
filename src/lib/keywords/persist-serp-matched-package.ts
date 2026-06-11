import type { SupabaseClient } from "@supabase/supabase-js";
import { normPkgForSerperSnapshot } from "@/lib/keywords/serper-snapshot-rank-resolve";

/** Persist a Serper-learned package id on the workspace app row. */
export async function persistAppSerpMatchedPackageId(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
  matchedPackageId: string,
): Promise<void> {
  const pkg = normPkgForSerperSnapshot(matchedPackageId);
  if (!pkg) return;

  const { error } = await supabase
    .from("apps")
    .update({ serp_matched_package_id: pkg })
    .eq("id", appId)
    .eq("workspace_id", workspaceId);

  if (error && !(error.message ?? "").includes("serp_matched_package_id")) {
    console.warn("[persistAppSerpMatchedPackageId] update failed", error.message);
  }
}

/** Persist a Serper-learned package id on a competitor analysis row. */
export async function persistCompetitorSerpMatchedPackageId(
  supabase: SupabaseClient,
  workspaceId: string,
  competitorPackageId: string,
  matchedPackageId: string,
): Promise<void> {
  const pkg = normPkgForSerperSnapshot(matchedPackageId);
  const internal = normPkgForSerperSnapshot(competitorPackageId);
  if (!pkg || !internal) return;

  const { error } = await supabase
    .from("workspace_competitor_analyses")
    .update({ serp_matched_package_id: pkg })
    .eq("workspace_id", workspaceId)
    .eq("competitor_package_id", internal);

  if (error && !(error.message ?? "").includes("serp_matched_package_id")) {
    console.warn("[persistCompetitorSerpMatchedPackageId] update failed", error.message);
  }
}
