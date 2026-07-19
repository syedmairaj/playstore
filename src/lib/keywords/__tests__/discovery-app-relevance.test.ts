import { describe, expect, it } from "vitest";
import {
  filterAiListingKeywordsForApp,
  isAiListingPackTrustedForApp,
  keywordConflictsWithAppVertical,
} from "@/lib/keywords/discovery-app-relevance";

describe("keywordConflictsWithAppVertical", () => {
  it("rejects health terms under a Social snap app", () => {
    const snap = { appName: "snap", category: "Social" };
    expect(keywordConflictsWithAppVertical("blood pressure", snap)).toBe(true);
    expect(keywordConflictsWithAppVertical("glucose monitor app", snap)).toBe(true);
    expect(keywordConflictsWithAppVertical("diet goals app", snap)).toBe(true);
  });

  it("keeps social/brand terms for snap", () => {
    const snap = { appName: "snap", category: "Social" };
    expect(keywordConflictsWithAppVertical("snap app", snap)).toBe(false);
    expect(keywordConflictsWithAppVertical("photo sharing app", snap)).toBe(false);
    expect(keywordConflictsWithAppVertical("stories camera app", snap)).toBe(false);
  });

  it("keeps health terms for salt sugar", () => {
    const salt = { appName: "salt sugar", category: "Health & Fitness" };
    expect(keywordConflictsWithAppVertical("blood pressure", salt)).toBe(false);
    expect(keywordConflictsWithAppVertical("glucose monitor app", salt)).toBe(false);
  });
});

describe("isAiListingPackTrustedForApp", () => {
  it("rejects a saltsugar health pack under snap", () => {
    const pack = [
      "blood pressure",
      "blood pressure tracker",
      "diet goals app",
      "fitness tracker",
      "glucose monitor app",
      "health data tracker",
    ];
    expect(
      isAiListingPackTrustedForApp(pack, { appName: "snap", category: "Social" }),
    ).toBe(false);
    expect(
      filterAiListingKeywordsForApp(pack, { appName: "snap", category: "Social" }),
    ).toEqual([]);
  });

  it("accepts a social pack for snap", () => {
    const pack = ["snap stories", "photo sharing app", "friends chat app"];
    expect(
      isAiListingPackTrustedForApp(pack, { appName: "snap", category: "Social" }),
    ).toBe(true);
  });
});
