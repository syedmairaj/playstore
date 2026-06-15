import type { SupabaseClient } from "@supabase/supabase-js";

export type StagingVaultSchemaMode = "legacy_signals" | "universal_vault";

export class StagingVaultSchemaError extends Error {
  readonly code = "staging_vault_schema_mismatch";

  constructor(message: string) {
    super(message);
    this.name = "StagingVaultSchemaError";
  }
}

let cachedMode: StagingVaultSchemaMode | null = null;

/**
 * Detect which workspace_staging_vault shape is deployed.
 * Legacy: signal_type + content (text). Universal: state_en/state_ar + app_id.
 */
export async function detectStagingVaultSchemaMode(
  supabase: SupabaseClient,
): Promise<StagingVaultSchemaMode> {
  if (cachedMode) return cachedMode;

  const { error: legacyError } = await supabase
    .from("workspace_staging_vault")
    .select("signal_type, content")
    .limit(0);

  if (!legacyError) {
    cachedMode = "legacy_signals";
    return cachedMode;
  }

  const { error: universalError } = await supabase
    .from("workspace_staging_vault")
    .select("state_en, app_id")
    .limit(0);

  if (!universalError) {
    cachedMode = "universal_vault";
    return cachedMode;
  }

  throw new StagingVaultSchemaError(
    "Staging vault schema mismatch: expected `content` (legacy) or `state_en`/`app_id` (universal). " +
      "Refresh your API schema or apply the latest Supabase migrations, then reload the app.",
  );
}

export async function assertLegacyContentColumnReady(
  supabase: SupabaseClient,
): Promise<void> {
  const mode = await detectStagingVaultSchemaMode(supabase);
  if (mode !== "legacy_signals") {
    throw new StagingVaultSchemaError(
      "Legacy signal insert unavailable: this database uses the universal vault schema (state_en/state_ar). " +
        "Keyword staging will use the universal vault path instead.",
    );
  }

  const { error } = await supabase
    .from("workspace_staging_vault")
    .select("content")
    .limit(0);

  if (error) {
    throw new StagingVaultSchemaError(
      `Staging vault pre-flight failed: content column is not readable (${error.message}). ` +
        "Apply migrations or refresh the API schema.",
    );
  }
}

export function resetStagingVaultSchemaCache(): void {
  cachedMode = null;
}

/** Probe whether universal vault columns (state_en / state_ar / app_id) are deployed. */
export async function hasUniversalVaultColumns(
  supabase: SupabaseClient,
): Promise<boolean> {
  const mode = await detectStagingVaultSchemaMode(supabase);
  return mode === "universal_vault";
}

/** Probe whether legacy signal-log columns (signal_type / content) are deployed. */
export async function hasLegacySignalColumns(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { error } = await supabase
    .from("workspace_staging_vault")
    .select("signal_type, content")
    .limit(0);

  return !error;
}
