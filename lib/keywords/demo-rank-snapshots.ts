/**
 * Deterministic demo rank snapshots until a live Play Store ranking integration exists.
 * Lower rank integer = better listing position on Google Play.
 */

function hashUuid(uuid: string): number {
  let h = 2166136261;
  for (let i = 0; i < uuid.length; i += 1) {
    h ^= uuid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export type DemoRankPoint = { rank: number; capturedAtIso: string };

const DEMO_SOURCE = "demo" as const;

/** Seven daily points over the last week; last snapshot is "now" with the resolved current rank. */
export function buildDemoRankSnapshots(keywordId: string, term: string): DemoRankPoint[] {
  const seed = hashUuid(keywordId) ^ hashUuid(term);
  const current = 6 + (seed % 118);
  let walk = current + ((seed >> 4) % 40) - 15;

  const out: DemoRankPoint[] = [];

  for (let dayOffset = 6; dayOffset >= 1; dayOffset -= 1) {
    const jitter = ((seed >> (dayOffset + 3)) % 25) - 12;
    walk = Math.max(1, Math.min(200, walk + jitter));
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - dayOffset);
    d.setUTCHours(14, (seed + dayOffset * 11) % 56, 0, 0);
    out.push({ rank: walk, capturedAtIso: d.toISOString() });
  }

  out.push({ rank: current, capturedAtIso: new Date().toISOString() });

  return out.sort(
    (a, b) => new Date(a.capturedAtIso).getTime() - new Date(b.capturedAtIso).getTime(),
  );
}

export function demoRankRowsForInsert(keywordId: string, term: string) {
  return buildDemoRankSnapshots(keywordId, term).map((p) => ({
    keyword_id: keywordId,
    rank: p.rank,
    snapshot_at: p.capturedAtIso,
    source: DEMO_SOURCE,
  }));
}

export { DEMO_SOURCE };
