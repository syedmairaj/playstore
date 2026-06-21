export type {
  OptimizationQueueLocale,
  OptimizationQueueCategory,
  OptimizationQueueItem,
  OptimizationQueueItemType,
  OptimizationQueueSource,
  OptimizationQueueState,
  OptimizationQueueStats,
  AddOptimizationQueueInput,
  OptimizationQueueSynthesisPayload,
  ActiveContextSignalType,
  TypedActiveContextSignal,
} from "@/lib/optimization-queue/optimization-queue.types";

export {
  readOptimizationQueue,
  addSignalToQueue,
  addToOptimizationQueue,
  removeFromOptimizationQueue,
  buildOptimizationQueueStats,
} from "@/lib/optimization-queue/optimization-queue.service";

export {
  ACTIVE_CONTEXT_SECTION_LABELS,
  CATEGORY_TO_WIDGET,
  diffQueueInputs,
  routeQueueItemToSection,
  resolveQueueItemCategory,
  sectionDedupeKey,
  sectionDedupeKeyForInput,
} from "@/lib/optimization-queue/queue-routing";
export type { QueueInputDiffResult } from "@/lib/optimization-queue/queue-routing";

export { buildSynthesisFromOptimizationQueue } from "@/lib/optimization-queue/optimization-queue-synthesis";
export {
  buildActiveContextQueueHashCanonical,
  filterItemsForActiveContextQueueHash,
  queueItemFingerprint,
} from "@/lib/optimization-queue/optimization-queue-hash-canonical";
export { computeActiveContextQueueHashClient } from "@/lib/optimization-queue/optimization-queue-hash-client";
export {
  buildActiveContextSynthesis,
  activeContextHasSignals,
} from "@/lib/optimization-queue/build-active-context-synthesis";
export type {
  ClusterSynthesisPayload,
  ActiveContextSynthesisPayload,
  ActiveContextSynthesisSignal,
} from "@/lib/optimization-queue/build-active-context-synthesis";
export {
  SIGNAL_CLUSTERS,
  inferSignalCluster,
  resolveSignalCluster,
  validateManualQueueInput,
  withResolvedSignalCluster,
  ManualClusterRequiredError,
} from "@/lib/optimization-queue/signal-cluster";
export type { SignalCluster } from "@/lib/optimization-queue/signal-cluster";
export {
  resolveActiveContextStrategyMode,
  topStagedIssuesByImpact,
} from "@/lib/optimization-queue/resolve-strategy-mode";
export type {
  ActiveContextStrategyMode,
  PrioritizedStagedIssue,
} from "@/lib/optimization-queue/resolve-strategy-mode";
export {
  assessVaultSynthesisReadiness,
  buildVaultSynthesisWarnings,
  EMPTY_SYNTHESIS_VAULT_MESSAGE,
  logStagingVaultPreSynthesis,
  validateSynthesisPayloadAfterVault,
  verifyQueueHashSignalPopulation,
} from "@/lib/optimization-queue/vault-synthesis-preflight";
export type {
  QueueHashSignalPopulation,
  VaultSynthesisReadiness,
} from "@/lib/optimization-queue/vault-synthesis-preflight";
