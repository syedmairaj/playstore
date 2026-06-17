import "server-only";

import { createHash } from "node:crypto";
import type {
  OptimizationQueueItem,
  OptimizationQueueLocale,
} from "@/lib/optimization-queue/optimization-queue.types";
import { buildActiveContextQueueHashCanonical } from "@/lib/optimization-queue/optimization-queue-hash-canonical";

export function digestActiveContextQueueCanonical(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** SHA-256 hex digest — server vault validation only. */
export function computeActiveContextQueueHash(
  items: OptimizationQueueItem[],
  locale: OptimizationQueueLocale,
): string {
  return digestActiveContextQueueCanonical(
    buildActiveContextQueueHashCanonical(items, locale),
  );
}
