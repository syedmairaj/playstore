import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  RANK_MONITORING_STATUS,
  stageKeyword,
} from "@/lib/keywords/stage-keyword";

type Row = Record<string, unknown>;

function createMockSupabase(initial: {
  apps?: Row[];
  keywords?: Row[];
  rankMonitoring?: Row[];
}) {
  const state = {
    apps: [...(initial.apps ?? [{ id: "app-1" }])],
    keywords: [...(initial.keywords ?? [])],
    rankMonitoring: [...(initial.rankMonitoring ?? [])],
  };

  const from = vi.fn((table: string) => {
    const api = {
      select: vi.fn(() => api),
      eq: vi.fn(() => api),
      ilike: vi.fn(() => api),
      maybeSingle: vi.fn(async () => {
        if (table === "apps") {
          return { data: state.apps[0] ?? null, error: null };
        }
        if (table === "keywords") {
          const row = state.keywords.find(
            (k) => String(k.term).toLowerCase() === "daily sodium log",
          );
          return { data: row ?? null, error: null };
        }
        if (table === "rank_monitoring") {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }),
      single: vi.fn(async () => {
        if (table === "keywords") {
          const row = {
            id: "kw-new",
            term: "daily sodium log",
            market: "us",
            app_id: "app-1",
          };
          state.keywords.push(row);
          return { data: { id: "kw-new" }, error: null };
        }
        return { data: null, error: null };
      }),
      insert: vi.fn((payload: Row | Row[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        if (table === "keywords") {
          state.keywords.push(...rows);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "kw-new" }, error: null })),
            })),
          };
        }
        if (table === "rank_monitoring") {
          state.rankMonitoring.push(...rows);
          return { error: null };
        }
        return { error: null };
      }),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      })),
    };
    return api;
  });

  return { from, state };
}

describe("stageKeyword", () => {
  it("creates keyword tracker row and rank monitoring queue entry", async () => {
    const supabase = createMockSupabase({ keywords: [] });

    const result = await stageKeyword({
      supabase: supabase as never,
      workspaceId: "ws-1",
      appId: "app-1",
      term: "daily sodium log",
      market: "US",
    });

    expect(result.keywordTracker.created).toBe(true);
    expect(result.market).toBe("us");
    expect(result.rankMonitoring.status).toBe(
      RANK_MONITORING_STATUS.trackingPending,
    );
    expect(supabase.state.rankMonitoring).toHaveLength(1);
  });
});
