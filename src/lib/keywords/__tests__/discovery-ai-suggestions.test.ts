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

  it("does not surface saltsugar health AI keywords under snap Social", () => {
    const items = buildContextualDiscoverySuggestions({
      app: { appId: "snap-id", appName: "snap", category: "Social" },
      aiListingKeywords: [
        "blood pressure",
        "blood pressure tracker",
        "diet goals app",
        "fitness tracker",
        "glucose monitor app",
        "health data tracker",
      ],
      trackedTerms: ["snapchat", "snap app"],
    });

    const keywords = items.map((i) => i.keyword.toLowerCase());
    expect(keywords.some((k) => k.includes("blood pressure"))).toBe(false);
    expect(keywords.some((k) => k.includes("glucose"))).toBe(false);
    expect(keywords.some((k) => k.includes("snap"))).toBe(true);
    expect(keywords.some((k) => k.includes("photo") || k.includes("stories"))).toBe(
      true,
    );
  });

  it("expands discovery from this app's tracked keywords after manual add", () => {
    const items = buildContextualDiscoverySuggestions({
      app: { appId: "snap-id", appName: "snap", category: "Social" },
      aiListingKeywords: [],
      trackedTerms: ["snapchat"],
      excludeNormalized: new Set(["snapchat"]),
    });

    const keywords = items.map((i) => i.keyword.toLowerCase());
    expect(keywords).not.toContain("snapchat");
    expect(keywords.some((k) => k.includes("snapchat"))).toBe(true);
  });
});
