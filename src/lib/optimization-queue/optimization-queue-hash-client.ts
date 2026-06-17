import type {
  OptimizationQueueItem,
  OptimizationQueueLocale,
} from "@/lib/optimization-queue/optimization-queue.types";
import { buildActiveContextQueueHashCanonical } from "@/lib/optimization-queue/optimization-queue-hash-canonical";

/** SHA-256 hex digest — browser (Listing Optimizer pre-POST). */
export async function computeActiveContextQueueHashClient(
  items: OptimizationQueueItem[],
  locale: OptimizationQueueLocale,
): Promise<string> {
  const canonical = buildActiveContextQueueHashCanonical(items, locale);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API is unavailable for queue hash");
  }
  const bytes = new TextEncoder().encode(canonical);
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
