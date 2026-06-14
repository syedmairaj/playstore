/** Cross-page Keyword Tracker ↔ Listing Optimizer staging sync. */
export const STAGING_VAULT_CHANGED_EVENT = "playstore:staging-vault-changed" as const;

export type StagingVaultChangedDetail = {
  workspaceId: string;
  appId?: string;
  locale?: "en" | "ar";
  keyword?: string;
};

export function dispatchStagingVaultChanged(detail: StagingVaultChangedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STAGING_VAULT_CHANGED_EVENT, { detail }));
}
