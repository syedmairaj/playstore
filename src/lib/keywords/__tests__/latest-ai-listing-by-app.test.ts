import { describe, expect, it } from "vitest";
import { resolveTrustedAiListingKeywordsForApp } from "@/lib/keywords/latest-ai-listing-by-app";
import { INSTANT_DRAFT_PROMPT_VERSION } from "@/lib/listing/listing-export-unlock";

const snapApp = { id: "snap-id", name: "snap", category: "Social" };

describe("resolveTrustedAiListingKeywordsForApp", () => {
  it("rejects instant-draft rows", () => {
    const result = resolveTrustedAiListingKeywordsForApp(
      {
        app_name: "snap",
        category: "Social",
        prompt_version: INSTANT_DRAFT_PROMPT_VERSION,
        output_json: {
          keywordSuggestions: ["snap stories", "photo sharing"],
        },
        target_keywords: [],
      },
      snapApp,
    );
    expect(result).toBeNull();
  });

  it("rejects cross-app app_name mismatch", () => {
    const result = resolveTrustedAiListingKeywordsForApp(
      {
        app_name: "Salt Sugar",
        category: "Health & Fitness",
        prompt_version: "listing-full-v2",
        output_json: {
          keywordSuggestions: ["blood pressure", "glucose monitor app"],
        },
        target_keywords: [],
      },
      snapApp,
    );
    expect(result).toBeNull();
  });

  it("rejects snap-named rows that still carry saltsugar health keywords", () => {
    const result = resolveTrustedAiListingKeywordsForApp(
      {
        app_name: "snap",
        category: "Social",
        prompt_version: "listing-full-v2",
        output_json: {
          keywordSuggestions: [
            "blood pressure",
            "blood pressure tracker",
            "diet goals app",
            "fitness tracker",
            "glucose monitor app",
            "health data tracker",
          ],
        },
        target_keywords: [],
      },
      snapApp,
    );
    expect(result).toBeNull();
  });

  it("accepts on-vertical AI suggestions for snap", () => {
    const result = resolveTrustedAiListingKeywordsForApp(
      {
        app_name: "snap",
        category: "Social",
        prompt_version: "listing-full-v2",
        output_json: {
          keywordSuggestions: [
            "snap stories",
            "photo sharing app",
            "friends chat app",
          ],
        },
        target_keywords: [],
      },
      snapApp,
    );
    expect(result).toEqual([
      "snap stories",
      "photo sharing app",
      "friends chat app",
    ]);
  });
});
