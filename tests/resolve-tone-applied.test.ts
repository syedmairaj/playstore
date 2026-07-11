import { describe, expect, it } from "vitest";
import { resolveToneAppliedForVersion } from "@/lib/listing/resolve-tone-applied";
import type { ToneExperiment } from "@/lib/validation/listing-output";

describe("resolveToneAppliedForVersion", () => {
  const toneExperiment: ToneExperiment = {
    experimentId: "friendly_vs_minimal",
    selectedTone: "friendly",
    alternativeTone: "minimal",
    armA: {
      tone: "friendly",
      metadataVariant: "aggressive",
      label: "Friendly · 50%",
      trafficShare: 50,
    },
    armB: {
      tone: "minimal",
      metadataVariant: "growth",
      label: "Minimal · 50%",
      trafficShare: 50,
    },
  };

  const output = {
    listingVariants: {
      aggressive: {
        title: "Friendly Title Here",
        shortDescription: "Warm short copy for friendly users.",
        fullDescription: "Friendly long description.",
      },
      growth: {
        title: "Minimal Title Here",
        shortDescription: "Precise short copy.",
        fullDescription: "Minimal long description.",
      },
    },
    toneExperiment,
  };

  it("matches aggressive variant title to friendly tone", () => {
    expect(
      resolveToneAppliedForVersion(
        { title: "Friendly Title Here", shortDescription: null },
        output,
        "professional",
      ),
    ).toBe("friendly");
  });

  it("matches growth variant title to minimal tone", () => {
    expect(
      resolveToneAppliedForVersion(
        { title: "Minimal Title Here", shortDescription: null },
        output,
        "professional",
      ),
    ).toBe("minimal");
  });

  it("falls back to generation tone_style without experiment metadata", () => {
    expect(
      resolveToneAppliedForVersion(
        { title: "Unknown", shortDescription: null },
        null,
        "friendly",
      ),
    ).toBe("friendly");
  });
});
