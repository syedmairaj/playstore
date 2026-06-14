const STORAGE_PREFIX = "discovery-ignored-keywords";

function storageKey(workspaceId: string, appId: string, generationId: string): string {
  return `${STORAGE_PREFIX}:${workspaceId}:${appId}:${generationId}`;
}

export function readIgnoredDiscoveryKeywords(
  workspaceId: string,
  appId: string,
  generationId: string,
): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId, appId, generationId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase()),
    );
  } catch {
    return new Set();
  }
}

export function writeIgnoredDiscoveryKeywords(
  workspaceId: string,
  appId: string,
  generationId: string,
  ignored: Set<string>,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(workspaceId, appId, generationId),
      JSON.stringify([...ignored]),
    );
  } catch {
    /* ignore quota errors */
  }
}

export function addIgnoredDiscoveryKeyword(
  workspaceId: string,
  appId: string,
  generationId: string,
  keyword: string,
  current: Set<string>,
): Set<string> {
  const next = new Set(current);
  for (const key of [keyword.trim().toLowerCase(), keyword.trim()]) {
    if (key) next.add(key);
  }
  writeIgnoredDiscoveryKeywords(workspaceId, appId, generationId, next);
  return next;
}
