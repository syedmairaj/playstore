import { describe, expect, it } from "vitest";
import { mergeModularDisplayState } from "@/lib/listing/assemble-modular-listing";
import type { ModularListingState } from "@/lib/listing/modular-listing.types";

describe("mergeModularDisplayState", () => {
  it("preserves short variations and selectedIndex when state has short content", () => {
    const state: ModularListingState = {
      title: { value: "Salt Sugar", locked: true },
      shortDescription: {
        variations: [
          { type: "growth", text: "Growth line for Health & Fitness" },
          { type: "conversion", text: "Trusted Health & Fitness app — salt sugar" },
          { type: "utility", text: "Essential Health & Fitness features in one place" },
        ],
        selectedIndex: 0,
      },
      longDescription: { hook: "Long hook", features: "", closing: "" },
    };

    const merged = mergeModularDisplayState(state, {
      shortDescription: "Edited short from parent",
    });

    expect(merged.shortDescription.variations).toEqual(state.shortDescription.variations);
    expect(merged.shortDescription.selectedIndex).toBe(0);
  });
});
