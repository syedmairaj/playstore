import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveTrackedKeywordsForWins } from "@/lib/market/resolve-tracked-keywords";

vi.mock("@/lib/keywords/load-workspace-keywords", () => ({
  loadWorkspaceKeywords: vi.fn(),
}));

import { loadWorkspaceKeywords } from "@/lib/keywords/load-workspace-keywords";

const mockLoad = vi.mocked(loadWorkspaceKeywords);

const keyword = (id: string, term: string) => ({
  id,
  term,
  market: "us",
  locale: "en",
  created_at: "2026-01-01T00:00:00.000Z",
  app_id: "app-1",
  ranks: [],
  latest: null,
});

describe("resolveTrackedKeywordsForWins", () => {
  beforeEach(() => {
    mockLoad.mockReset();
  });

  it("returns app-scoped keywords when present", async () => {
    mockLoad.mockResolvedValueOnce({
      ok: true,
      keywords: [keyword("kw-1", "daily sodium log")],
    });

    const result = await resolveTrackedKeywordsForWins(
      {} as never,
      "ws-1",
      "app-1",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope).toBe("app");
      expect(result.keywords).toHaveLength(1);
    }
    expect(mockLoad).toHaveBeenCalledWith({} as never, "ws-1", {
      appId: "app-1",
      includeWorkspaceWideKeywords: true,
    });
  });

  it("falls back to workspace keywords when app-scoped query is empty", async () => {
    mockLoad
      .mockResolvedValueOnce({ ok: true, keywords: [] })
      .mockResolvedValueOnce({
        ok: true,
        keywords: [keyword("kw-2", "salt sugar")],
      });

    const result = await resolveTrackedKeywordsForWins(
      {} as never,
      "ws-1",
      "app-1",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope).toBe("workspace");
      expect(result.keywords[0]?.term).toBe("salt sugar");
    }
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });
});
