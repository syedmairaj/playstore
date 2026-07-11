import { describe, expect, it } from "vitest";
import {
  buildToneExperimentMeta,
  formatToneStyleLabel,
  resolveAlternativeTone,
} from "@/lib/listing/tone-ab-pairs";

describe("tone-ab-pairs", () => {
  it("pairs friendly with minimal for contrast", () => {
    expect(resolveAlternativeTone("friendly")).toBe("minimal");
    expect(resolveAlternativeTone("minimal")).toBe("friendly");
  });

  it("pairs bold with professional for contrast", () => {
    expect(resolveAlternativeTone("bold")).toBe("professional");
    expect(resolveAlternativeTone("professional")).toBe("bold");
  });

  it("builds experiment metadata with dynamic labels", () => {
    const meta = buildToneExperimentMeta("friendly");
    expect(meta.experimentId).toBe("friendly_vs_minimal");
    expect(meta.armA.tone).toBe("friendly");
    expect(meta.armA.metadataVariant).toBe("aggressive");
    expect(meta.armA.label).toBe(`${formatToneStyleLabel("friendly")} · 50%`);
    expect(meta.armB.tone).toBe("minimal");
    expect(meta.armB.metadataVariant).toBe("growth");
  });

  it("respects explicit alternative tone when provided", () => {
    const meta = buildToneExperimentMeta("friendly", "bold");
    expect(meta.alternativeTone).toBe("bold");
    expect(meta.experimentId).toBe("friendly_vs_bold");
  });
});
