/**
 * In-process workspace-scoped idempotency lock for credit-consuming generation endpoints.
 *
 * If a second POST for the same `(workspaceId, action)` pair arrives within
 * LOCK_TTL_MS of the first accepted request, the endpoint should return 429
 * immediately — before any credit deduction — to prevent double-charging on
 * double-clicks, network retries, or race conditions from the browser.
 *
 * The lock is stored in a module-level Map so it persists across requests within
 * the same Node.js process instance (one per Next.js worker / serverless container).
 * This is intentionally lightweight: it protects against the browser-layer race
 * that the frontend `isProcessingCredits` flag cannot cover (e.g. two tabs, a
 * hard refresh mid-flight, or a slow network retry).
 */

const LOCK_TTL_MS = 4_000; // 4-second exclusion window per the spec

type LockKey = string; // `${workspaceId}:${action}`
type LockEntry = { lockedAt: number };

// Module-level singleton — shared across all requests in this process.
const lockMap = new Map<LockKey, LockEntry>();

function buildKey(workspaceId: string, action: string): LockKey {
  return `${workspaceId}:${action}`;
}

/** Prune stale entries to prevent unbounded map growth in long-running workers. */
function pruneExpired(): void {
  const now = Date.now();
  for (const [key, entry] of lockMap) {
    if (now - entry.lockedAt >= LOCK_TTL_MS) {
      lockMap.delete(key);
    }
  }
}

/**
 * Attempt to acquire the idempotency lock for `(workspaceId, action)`.
 *
 * @returns `true`  — lock acquired; caller should proceed with the operation.
 * @returns `false` — lock already held within TTL; caller should return 429.
 */
export function acquireGenerationLock(
  workspaceId: string,
  action: string,
): boolean {
  pruneExpired();
  const key = buildKey(workspaceId, action);
  const existing = lockMap.get(key);
  const now = Date.now();
  if (existing && now - existing.lockedAt < LOCK_TTL_MS) {
    // A request for this workspace + action is still within the lock window.
    return false;
  }
  lockMap.set(key, { lockedAt: now });
  return true;
}

/**
 * Explicitly release the lock early (e.g. on error so the user can retry
 * immediately without waiting for the full TTL to expire).
 */
export function releaseGenerationLock(
  workspaceId: string,
  action: string,
): void {
  lockMap.delete(buildKey(workspaceId, action));
}

/** Remaining milliseconds on the active lock, or 0 if not locked / expired. */
export function lockRemainingMs(
  workspaceId: string,
  action: string,
): number {
  const entry = lockMap.get(buildKey(workspaceId, action));
  if (!entry) return 0;
  const remaining = LOCK_TTL_MS - (Date.now() - entry.lockedAt);
  return remaining > 0 ? remaining : 0;
}
