import { describe, expect, it } from "vitest";
import { buildToneAbDeployPlan } from "@/lib/listing/tone-ab-deploy-plan";

describe("buildToneAbDeployPlan", () => {
  const gapKeywords = [
    "[competitive] salt tracker",
    "[competitive] sugar app",
    "[competitive] health log",
    "[competitive] diet app",
    "[competitive] nutrition",
    "[intent] daily sodium log",
    "[intent] glucose monitor",
    "[gap] no ads tracker",
    "[gap] ad free health",
    "[gap] simple sugar log",
    "[gap] privacy health app",
    "[gap] offline tracker",
  ];

  it("returns null without listing variants", () => {
    expect(
      buildToneAbDeployPlan({
        keywordSuggestions: gapKeywords,
        hasListingVariants: false,
        selectedToneStyle: "friendly",
      }),
    ).toBeNull();
  });

  it("returns tone-aware 50/50 plan when user selects friendly", () => {
    const plan = buildToneAbDeployPlan({
      keywordSuggestions: gapKeywords,
      hasListingVariants: true,
      selectedToneStyle: "friendly",
    });
    expect(plan).not.toBeNull();
    expect(plan!.experimentId).toBe("friendly_vs_minimal");
    expect(plan!.arms[0].tone).toBe("friendly");
    expect(plan!.arms[0].metadataVariant).toBe("aggressive");
    expect(plan!.arms[0].label).toBe("Friendly · 50%");
    expect(plan!.arms[1].tone).toBe("minimal");
    expect(plan!.arms[1].metadataVariant).toBe("growth");
    expect(plan!.arms[1].label).toBe("Minimal · 50%");
    expect(plan!.gapKeywordCount).toBeGreaterThanOrEqual(3);
  });

  it("returns bold vs professional when user selects bold", () => {
    const plan = buildToneAbDeployPlan({
      keywordSuggestions: gapKeywords,
      hasListingVariants: true,
      selectedToneStyle: "bold",
    });
    expect(plan!.arms[0].tone).toBe("bold");
    expect(plan!.arms[1].tone).toBe("professional");
  });

  it("playConsoleGuide references user-visible tab labels not internal slots", () => {
    const plan = buildToneAbDeployPlan({
      keywordSuggestions: gapKeywords,
      hasListingVariants: true,
      selectedToneStyle: "bold",
    });
    expect(plan!.playConsoleGuide).toHaveLength(5);
    expect(plan!.playConsoleGuide[0].callouts?.some((c) => c.kind === "warning")).toBe(true);
    expect(plan!.playConsoleGuide[0].callouts?.some((c) => c.text.includes("100 installs"))).toBe(true);
    expect(plan!.playConsoleGuide[1].title).toContain("control");
    expect(plan!.playConsoleGuide[1].callouts?.some((c) => c.kind === "control")).toBe(true);
    expect(plan!.playConsoleGuide[2].title).toContain("Bold");
    expect(plan!.playConsoleGuide[2].body).toContain("Metadata version");
    expect(plan!.playConsoleGuide[2].playConsoleHint).toContain("Variant A");
    expect(plan!.playConsoleGuide[3].title).toContain("Professional");
    expect(plan!.playConsoleGuide[3].playConsoleHint).toContain("Variant B");
    expect(plan!.playConsoleGuide[4].callouts?.some((c) => c.text.includes("95%"))).toBe(true);
    expect(plan!.playConsoleSteps[1]).not.toContain("Aggressive slot");
  });
});
