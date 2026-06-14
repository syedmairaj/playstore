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
