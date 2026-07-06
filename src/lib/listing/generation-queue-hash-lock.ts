import "server-only";

import { redis } from "@/lib/redis/redis-client";

/** Matches platform `maxDuration` — auto-expires stale locks. */
export const GENERATION_QUEUE_LOCK_TTL_SECONDS = 300;

export function generationQueueLockKey(
  workspaceId: string,
  queueHash: string,
): string {
  return `listing-gen:processing:v1:${workspaceId.trim()}:${queueHash.trim()}`;
}

export type AcquireGenerationQueueLockResult =
  | { acquired: true }
  | { acquired: false; reason: "processing" };

/**
 * Short-lived Redis lock per `(workspaceId, queueHash)` — blocks duplicate in-flight pipelines.
 */
export async function acquireGenerationQueueHashLock(args: {
  workspaceId: string;
  queueHash: string;
  userId: string;
}): Promise<AcquireGenerationQueueLockResult> {
  const key = generationQueueLockKey(args.workspaceId, args.queueHash);
  const payload = JSON.stringify({
    userId: args.userId,
    startedAt: new Date().toISOString(),
  });
  const acquired = await redis.setNx(key, payload, {
    ex: GENERATION_QUEUE_LOCK_TTL_SECONDS,
  });
  return acquired ? { acquired: true } : { acquired: false, reason: "processing" };
}

export async function releaseGenerationQueueHashLock(
  workspaceId: string,
  queueHash: string,
): Promise<void> {
  await redis.del(generationQueueLockKey(workspaceId, queueHash));
}
