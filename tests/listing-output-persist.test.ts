import { describe, expect, it } from "vitest";
import { parsePersistedListingOutput } from "@/lib/validation/listing-output";

describe("parsePersistedListingOutput", () => {
  it("restores premium ASO fields when strict schema fails on optional blocks", () => {
    const parsed = parsePersistedListingOutput({
      title: "Salt Sugar Tracker",
      shortDescription: "Track salt and sugar daily with ease.",
      fullDescription: "Full description body for the health tracker app.",
      keywordSuggestions: ["salt tracker", "sugar app", "health log"],
      ctaSuggestions: [
        "WHY THIS RANKS: Strong keyword density in title.",
        "Download now and take control.",
      ],
      screenshotCaptions: ["Track daily", "See trends", "Stay healthy"],
      abTestVariant: {
        titleB: "Daily Salt Sugar Log",
        hypothesis: "Benefit-led title may lift installs.",
      },
      strategySummary: "Fixed review pain points and captured market keywords.",
      ctaSuggestion: "Start tracking today — free trial.",
    });

    expect(parsed?.screenshotCaptions).toHaveLength(3);
    expect(parsed?.abTestVariant?.titleB).toBe("Daily Salt Sugar Log");
    expect(parsed?.strategySummary).toContain("market keywords");
    expect(parsed?.ctaSuggestion).toContain("Start tracking");
  });
});
