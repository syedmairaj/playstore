import { describe, expect, it } from "vitest";
import {
  applyOrchestrationToListingOutput,
  assembleExpansionFullDescription,
  mergeOrchestrationModule,
} from "@/lib/listing/apply-orchestration-output";
import type { OrchestrationProtocol } from "@/lib/listing/orchestration-protocol.schema";

const sampleOrchestration: OrchestrationProtocol = {
  protocolVersion: "1.0",
  modules: {
    anchor: {
      moduleId: "anchor",
      title: "FocusFlow — Habits",
      lockedKeywords: ["FocusFlow"],
      aiSuggestedKeywords: ["habits"],
      keywordAnchor: "FocusFlow habits",
      hybridRationale: "Hybrid weave",
    },
    conversion: {
      moduleId: "conversion",
      activeStrategyProfile: "defensive",
      selectedVariationId: "primary",
      shortVariations: [
        {
          variationId: "defensive",
          profileLabel: "Defensive",
          shortDescription: "Defensive short copy here for trust and retention focus.",
          rationale: "Addresses pain",
        },
        {
          variationId: "offensive",
          profileLabel: "Offensive",
          shortDescription: "Offensive short copy here for market capture angle.",
          rationale: "Contrasts rivals",
        },
        {
          variationId: "primary",
          profileLabel: "Primary",
          shortDescription: "Primary short copy aligned with active strategy mode.",
          rationale: "Active profile",
        },
      ],
    },
    expansion: {
      moduleId: "expansion",
      keywordAnchor: "FocusFlow habits",
      blocks: {
        hook: {
          blockId: "hook",
          painPointLabel: "Forgotten reminders",
          content: "Tired of missing habits?",
        },
        features: {
          blockId: "features",
          categories: [
            {
              label: "Core",
              bullets: ["✅ Smart reminders", "✅ Streak tracking"],
            },
          ],
        },
        trustClosing: {
          blockId: "trustClosing",
          content: "Join thousands of focused users.",
          cta: "Download FocusFlow today.",
        },
      },
      assembledFullDescription: "Tired of missing habits?\n\nCore\n• ✅ Smart reminders",
    },
  },
};

describe("assembleExpansionFullDescription", () => {
  it("joins hook, features, trust, and cta", () => {
    const text = assembleExpansionFullDescription(sampleOrchestration.modules.expansion);
    expect(text).toContain("Tired of missing habits?");
    expect(text).toContain("✅ Smart reminders");
    expect(text).toContain("Download FocusFlow today.");
  });
});

describe("applyOrchestrationToListingOutput", () => {
  it("maps anchor and primary variation to root fields", () => {
    const base = {
      title: "Old",
      shortDescription: "Old short",
      fullDescription: "Old long",
      keywordSuggestions: [],
      ctaSuggestions: [],
    };
    const out = applyOrchestrationToListingOutput(base, sampleOrchestration, "defensive");
    expect(out.title).toBe("FocusFlow — Habits");
    expect(out.shortDescription).toBe(
      "Primary short copy aligned with active strategy mode.",
    );
    expect(out.orchestration).toEqual(sampleOrchestration);
  });
});

describe("mergeOrchestrationModule", () => {
  it("replaces only the requested module", () => {
    const fresh: OrchestrationProtocol = {
      ...sampleOrchestration,
      modules: {
        ...sampleOrchestration.modules,
        anchor: {
          ...sampleOrchestration.modules.anchor,
          title: "New Anchor Title",
        },
      },
    };
    const merged = mergeOrchestrationModule(sampleOrchestration, fresh, "anchor");
    expect(merged.modules.anchor.title).toBe("New Anchor Title");
    expect(merged.modules.conversion).toEqual(sampleOrchestration.modules.conversion);
    expect(merged.modules.expansion).toEqual(sampleOrchestration.modules.expansion);
  });
});
