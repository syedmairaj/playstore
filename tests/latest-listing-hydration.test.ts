import { describe, expect, it } from "vitest";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import {
  applyDraftOverlayIfPreferred,
  listingGenerationRowToHydrationPayload,
  type ListingOptimizerHydrationPayload,
} from "@/lib/listing/latest-listing-hydration";

describe("listingGenerationRowToHydrationPayload", () => {
  const paidOutput: ListingGenerationOutput = {
    title: "Paid Title",
    shortDescription: "Paid short copy",
    fullDescription: "Paid long copy",
    keywordSuggestions: ["kw1", "kw2", "kw3"],
    ctaSuggestions: ["Why this ranks", "Download now"],
    asoScore: 92,
  };

  it("marks publication unlocked when credits_ledger_id is set", () => {
    const payload = listingGenerationRowToHydrationPayload({
      id: "gen-1",
      created_at: "2026-07-01T10:00:00.000Z",
      updated_at: "2026-07-01T10:00:00.000Z",
      app_name: "App",
      category: "Tools",
      target_keywords: ["kw1"],
      app_features: "Features",
      tone_style: "professional",
      output_json: paidOutput,
      credits_ledger_id: "ledger-abc",
      prompt_version: "listing-full-v2",
    });

    expect(payload.publicationUnlocked).toBe(true);
    expect(payload.output?.asoScore).toBe(92);
  });
});

/** Regression: paid unlock must not be replaced by newer modular draft on hydrate. */
describe("paid unlock hydration regression", () => {
  it("documents expected paid row shape after full unlock", () => {
    const payload: ListingOptimizerHydrationPayload =
      listingGenerationRowToHydrationPayload({
        id: "gen-paid",
        created_at: "2026-07-05T10:00:00.000Z",
        updated_at: "2026-07-05T10:00:01.000Z",
        app_name: "Salt Sugar",
        category: "Health",
        target_keywords: ["salt"],
        app_features: "Track intake",
        tone_style: "professional",
        output_json: {
          title: "Salt Sugar Tracker",
          shortDescription: "Track salt and sugar daily.",
          fullDescription: "Full paid description.",
          keywordSuggestions: ["salt tracker", "sugar app", "health log"],
          ctaSuggestions: ["Why this ranks", "Download now"],
          asoScore: 88,
        },
        credits_ledger_id: "ledger-paid",
        prompt_version: "listing-full-v2",
      });

    expect(payload.publicationUnlocked).toBe(true);
    expect(payload.output?.title).toBe("Salt Sugar Tracker");
    expect(payload.output?.asoScore).toBe(88);
  });
});

describe("per-app draft overlay isolation", () => {
  const genRow = {
    id: "gen-snap",
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: "2026-07-01T10:00:00.000Z",
    credits_ledger_id: null,
    prompt_version: "listing-modular-v1",
  };

  it("does not overlay listing output when draft row is null (no cross-app leak)", () => {
    const payload = listingGenerationRowToHydrationPayload({
      ...genRow,
      app_name: "Snap",
      category: "Social",
      target_keywords: ["snap"],
      app_features: "Share moments",
      tone_style: "friendly",
      output_json: null,
    });

    applyDraftOverlayIfPreferred(payload, genRow, null);

    expect(payload.output).toBeNull();
    expect(payload.appName).toBe("Snap");
  });

  it("overlays only when a draft row is provided for that app", () => {
    const payload = listingGenerationRowToHydrationPayload({
      ...genRow,
      app_name: "Snap",
      category: "Social",
      target_keywords: ["snap"],
      app_features: "Share moments",
      tone_style: "friendly",
      output_json: null,
    });

    applyDraftOverlayIfPreferred(payload, genRow, {
      id: "draft-snap",
      updated_at: "2026-07-02T10:00:00.000Z",
      app_id: "snap-id",
      app_name: "Snap",
      modular_listing: {
        title: { value: "Snap Social", variations: [] },
        shortDescription: {
          variations: [{ text: "Share your day.", rationale: "" }],
          selectedIndex: 0,
        },
        longDescription: {
          hook: "Connect instantly.",
          features: "Stories and chat.",
          closing: "Download Snap.",
        },
      },
    });

    expect(payload.output?.title).toBe("Snap Social");
    expect(payload.output?.shortDescription).toBe("Share your day.");
    expect(payload.publicationUnlocked).toBe(false);
  });
});
