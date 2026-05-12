import { NextResponse } from "next/server";
import { mergeFeatureFlags, type FeatureFlagMap } from "@/lib/features/flags/resolve";
import { createPublicSupabaseClient } from "@/lib/supabase/public-server-client";
import type { FeatureFlagKey } from "@/lib/features/flags/keys";
import { DEFAULT_FEATURE_FLAGS } from "@/lib/features/flags/defaults";

export const dynamic = "force-dynamic";

export async function GET() {
  let map: FeatureFlagMap = mergeFeatureFlags({});
  try {
    const supabase = createPublicSupabaseClient();
    const { data, error } = await supabase.from("feature_flags").select("key,enabled");
    if (!error && data) {
      const partial: Partial<Record<FeatureFlagKey, boolean>> = {};
      for (const row of data as { key: string; enabled: boolean }[]) {
        if (row.key in DEFAULT_FEATURE_FLAGS) {
          partial[row.key as FeatureFlagKey] = row.enabled;
        }
      }
      map = mergeFeatureFlags(partial);
    }
  } catch {
    map = mergeFeatureFlags({});
  }

  return NextResponse.json(map, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
