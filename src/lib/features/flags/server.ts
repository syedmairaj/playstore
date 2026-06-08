import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeFeatureFlags, type FeatureFlagMap } from "./resolve";
import type { FeatureFlagKey } from "./keys";
import { DEFAULT_FEATURE_FLAGS } from "./defaults";

type FlagRow = { key: string; enabled: boolean };

/**
 * Load flags from Supabase then merge env overrides (NEXT_PUBLIC_FF_*).
 * Safe on failure: returns defaults + env only.
 */
export async function getFeatureFlags(supabase: SupabaseClient): Promise<FeatureFlagMap> {
  try {
    const { data, error } = await supabase.from("feature_flags").select("key,enabled");
    if (error) {
      return mergeFeatureFlags({});
    }
    const partial: Partial<Record<FeatureFlagKey, boolean>> = {};
    for (const row of (data ?? []) as FlagRow[]) {
      if (isFlagKey(row.key)) {
        partial[row.key] = row.enabled;
      }
    }
    return mergeFeatureFlags(partial);
  } catch {
    return mergeFeatureFlags({});
  }
}

function isFlagKey(k: string): k is FeatureFlagKey {
  return k in DEFAULT_FEATURE_FLAGS;
}
