import type { SupabaseClient } from "@supabase/supabase-js";
import { VaultCore } from "@/lib/staging-vault/vault-core";

export type SyncKeywordUniversalVaultArgs = {
  workspaceId: string;
  appId: string;
  keyword: string;
  language: "en" | "ar";
  metadata?: Record<string, unknown>;
  userId?: string;
};

/**
 * Upsert keyword into universal vault state_en / state_ar (locale-isolated).
 * Delegates to VaultCore — falls back gracefully when universal columns are absent.
 */
export async function syncKeywordToUniversalVault(
  supabase: SupabaseClient,
  args: SyncKeywordUniversalVaultArgs,
): Promise<{ ok: true; vaultId: string } | { ok: false; error: string }> {
  const result = await VaultCore.safeUpsert(supabase, {
    type: "universal_keyword",
    workspaceId: args.workspaceId,
    appId: args.appId,
    keyword: args.keyword,
    locale: args.language,
    metadata: args.metadata,
    userId: args.userId,
  });

  if (!result.ok || !result.universalWritten) {
    return { ok: false, error: result.error ?? "universal_write_skipped" };
  }

  return { ok: true, vaultId: result.id! };
}
