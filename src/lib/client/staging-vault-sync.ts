import type { StagingVaultDeltaPayload } from "@/lib/client/active-context-delta";

/** Cross-page vault → Active Context event bus (browser CustomEvent). */
export const STAGING_VAULT_CHANGED_EVENT = "playstore:staging-vault-changed" as const;

export type StagingVaultChangedDetail = {
  workspaceId: string;
  appId?: string;
  locale?: "en" | "ar";
  keyword?: string;
  /** When set, subscribers apply a delta patch instead of full context pull. */
  delta?: StagingVaultDeltaPayload;
};

export function dispatchStagingVaultChanged(detail: StagingVaultChangedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STAGING_VAULT_CHANGED_EVENT, { detail }));
}

/** Emit after a producer writes to workspace_staging_vault / optimization queue. */
export function dispatchStagingVaultDelta(delta: StagingVaultDeltaPayload): void {
  dispatchStagingVaultChanged({
    workspaceId: delta.workspaceId,
    appId: delta.appId,
    locale: delta.locale,
    delta,
  });
}
