/**
 * Staging Vault — public API surface.
 * All features should import VaultCore from here for writes.
 */

export { VaultCore } from "@/lib/staging-vault/vault-core";
export type {
  VaultLocale,
  VaultSignalType,
  VaultSignalSource,
  VaultLegacySignalPayload,
  VaultUniversalStatePayload,
  VaultUniversalKeywordPayload,
  VaultUpsertPayload,
  VaultUpdatePayload,
  VaultUpsertResult,
  VaultUpdateResult,
  VaultWritePath,
} from "@/lib/staging-vault/vault-core.types";

export {
  addSignalToVault,
  getStagingVaultItems,
  listVaultSignals,
  archiveStagingItem,
  restoreStagingItem,
} from "@/lib/staging-vault/staging-vault-service";

export type {
  VaultSignalRow,
  VaultSignalsGrouped,
  VaultListSignalType,
} from "@/lib/staging-vault/staging-vault-service";

export { stageSignal } from "@/lib/staging-vault/stageSignal";
export { syncKeywordToUniversalVault } from "@/lib/staging-vault/sync-keyword-universal-vault";
