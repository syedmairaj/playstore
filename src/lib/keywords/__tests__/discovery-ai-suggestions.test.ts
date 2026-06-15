import { describe, expect, it } from "vitest";
import { buildContextualDiscoverySuggestions } from "@/lib/keywords/discovery-ai-suggestions";

describe("buildContextualDiscoverySuggestions", () => {
  it("prioritizes brand keywords for salt sugar app", () => {
    const items = buildContextualDiscoverySuggestions({
      app: {
        appId: "app-1",
        appName: "salt sugar",
        category: "Health & Fitness",
      },
      aiListingKeywords: ["diet goals app", "[gap] nutrition tracking app"],
    });

    const keywords = items.map((i) => i.keyword);
    expect(keywords.some((k) => k.includes("salt sugar"))).toBe(true);
    expect(keywords.some((k) => k.includes("sodium"))).toBe(true);
    expect(items[0]?.category).toBe("brand");
  });

  it("dedupes ai listing and heuristics", () => {
    const items = buildContextualDiscoverySuggestions({
      app: { appId: "app-1", appName: "FocusFlow", category: "Productivity" },
      aiListingKeywords: ["focusflow app", "task manager app"],
    });

    const norms = new Set(items.map((i) => i.keyword.toLowerCase()));
    expect(norms.size).toBe(items.length);
  });
});
