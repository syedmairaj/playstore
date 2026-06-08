import type { FeatureFlagKey } from "./keys";
import { DEFAULT_FEATURE_FLAGS } from "./defaults";

function parseEnvBool(raw: string | undefined): boolean | undefined {
  if (raw == null || raw === "") return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return undefined;
}

/** NEXT_PUBLIC_FF_<KEY> e.g. NEXT_PUBLIC_FF_KEYWORD_TRACKER=false */
function envOverrideForKey(key: FeatureFlagKey): boolean | undefined {
  const suffix = key.toUpperCase();
  return parseEnvBool(process.env[`NEXT_PUBLIC_FF_${suffix}`]);
}

export type FeatureFlagMap = Record<FeatureFlagKey, boolean>;

export function mergeFeatureFlags(dbPartial: Partial<Record<string, boolean>>): FeatureFlagMap {
  const out = { ...DEFAULT_FEATURE_FLAGS };

  for (const k of Object.keys(DEFAULT_FEATURE_FLAGS) as FeatureFlagKey[]) {
    const dbVal = dbPartial[k];
    if (typeof dbVal === "boolean") {
      out[k] = dbVal;
    }
    const envVal = envOverrideForKey(k);
    if (typeof envVal === "boolean") {
      out[k] = envVal;
    }
  }

  return out;
}
