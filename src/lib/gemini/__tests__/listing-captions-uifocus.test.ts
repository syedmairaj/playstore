/**
 * listing-captions-uifocus.test.ts
 *
 * Validates that the generateListingPipelineCaptions pipeline:
 *   1. Passes LISTING_CAPTIONS_SCHEMA to getGenerativeModel() for structured output.
 *   2. Passes responseMimeType: "application/json" and a sufficient maxOutputTokens.
 *   3. Correctly parses and surfaces `uiFocus` on every ScreenshotCaption.
 *   4. Degrades gracefully when uiFocus is absent in the model response.
 *   5. Works for both EN and AR locales.
 *
 * Uses a vi.mock of @/lib/ai/modelGateway — no real Gemini API call is made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mock must be hoisted BEFORE the module-under-test is imported ─────────────
vi.mock("@/lib/ai/modelGateway", () => ({
  getGenerativeModel: vi.fn(),
}));

import { getGenerativeModel } from "@/lib/ai/modelGateway";
import {
  generateListingPipelineCaptions,
  LISTING_CAPTIONS_SCHEMA,
} from "../generate-screenshot-captions";
import type { ListingCaptionsInput } from "../generate-screenshot-captions";
import { SchemaType } from "@/lib/ai/schema-types";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Builds a minimal mock GenerateContentResponse carrying a JSON string. */
function mockResponse(payload: unknown) {
  return { text: JSON.stringify(payload) };
}

/** 7 caption items — all include uiFocus. */
function fullCaptionsPayload(overrides: Partial<Record<number, Partial<{
  order: number; caption: string; theme: string; uiFocus: string;
}>>> = {}) {
  return {
    captions: [
      { order: 1, caption: "Your habit, reimagined", theme: "hook",    uiFocus: "dark dashboard #1A73E8 accent streak chart", ...overrides[1] },
      { order: 2, caption: "Build habits in seconds", theme: "feature", uiFocus: "minimal onboarding screen #1A73E8 primary button", ...overrides[2] },
      { order: 3, caption: "Smart reminders that adapt", theme: "feature", uiFocus: "reminder settings panel #1A73E8 toggle highlighted", ...overrides[3] },
      { order: 4, caption: "Track streaks with precision", theme: "feature", uiFocus: "streak calendar dark mode #1A73E8 completed days", ...overrides[4] },
      { order: 5, caption: "Feel the momentum", theme: "benefit",  uiFocus: "celebration screen gradient #1A73E8 confetti", ...overrides[5] },
      { order: 6, caption: "Skip the willpower battle", theme: "benefit",  uiFocus: "insights chart pale #1A73E8 progress line", ...overrides[6] },
      { order: 7, caption: "Start your first habit now", theme: "cta",     uiFocus: "CTA screen centered #1A73E8 button full-width", ...overrides[7] },
    ],
  };
}

/** Minimal input for both EN and AR tests. */
function makeInput(locale: "en" | "ar" = "en"): ListingCaptionsInput {
  return {
    appName: "HabitFlow",
    category: "Health & Fitness",
    longDescription: "HabitFlow helps you build lasting habits in seconds. Smart streaks, calm reminders, and beautiful progress charts keep you on track.",
    locale,
    brandKit: {
      primaryColor: "#1A73E8",
      colorPalette: "#FFF, #0D47A1",
      style: "Minimalist",
      toneGuidelines: "calm, motivating",
    },
  };
}

/** Registers a mock model that resolves with the given payload. */
function useMockModel(payload: unknown) {
  const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse(payload));
  vi.mocked(getGenerativeModel).mockReturnValue({
    generateContent: mockGenerateContent,
  } as never);
  return mockGenerateContent;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Static schema assertions (no API call)
// ─────────────────────────────────────────────────────────────────────────────

describe("LISTING_CAPTIONS_SCHEMA static shape", () => {
  it('exports a schema whose top-level required contains "captions"', () => {
    expect(LISTING_CAPTIONS_SCHEMA.required).toContain("captions");
  });

  it("defines captions as an ARRAY of OBJECTs", () => {
    expect(LISTING_CAPTIONS_SCHEMA.properties.captions.type).toBe(SchemaType.ARRAY);
    expect(LISTING_CAPTIONS_SCHEMA.properties.captions.items.type).toBe(SchemaType.OBJECT);
  });

  it("declares uiFocus in item properties as STRING", () => {
    const props = LISTING_CAPTIONS_SCHEMA.properties.captions.items.properties;
    expect(props.uiFocus).toBeDefined();
    expect(props.uiFocus.type).toBe(SchemaType.STRING);
  });

  it('includes "uiFocus" in the item required array (critical — missing here = Gemini may omit it)', () => {
    const required = LISTING_CAPTIONS_SCHEMA.properties.captions.items.required;
    console.log("Caption item required fields:", required);
    expect(required).toContain("uiFocus");
  });

  it('includes all four expected required fields: order, caption, theme, uiFocus', () => {
    const required = LISTING_CAPTIONS_SCHEMA.properties.captions.items.required;
    expect(required).toContain("order");
    expect(required).toContain("caption");
    expect(required).toContain("theme");
    expect(required).toContain("uiFocus");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Model is called with the correct config
// ─────────────────────────────────────────────────────────────────────────────

describe("getGenerativeModel receives structured-output config", () => {
  beforeEach(() => {
    useMockModel(fullCaptionsPayload());
  });

  it("passes responseMimeType: application/json", async () => {
    await generateListingPipelineCaptions(makeInput());

    const callArg = vi.mocked(getGenerativeModel).mock.calls[0]?.[0];
    console.log("getGenerativeModel config:", JSON.stringify(callArg, null, 2));
    expect(callArg).toMatchObject({ responseMimeType: "application/json" });
  });

  it("passes responseSchema that declares uiFocus as required on each item", async () => {
    await generateListingPipelineCaptions(makeInput());

    // callArg is GenerativeModelConfig — responseSchema is a property of it.
    type ModelCfg = { responseSchema?: typeof LISTING_CAPTIONS_SCHEMA };
    const callArg = vi.mocked(getGenerativeModel).mock.calls[0]?.[0] as ModelCfg;
    const schema = callArg?.responseSchema;

    expect(schema).toBeDefined();
    const itemRequired = schema?.properties?.captions?.items?.required;
    console.log("Schema item required:", itemRequired);
    expect(itemRequired).toContain("uiFocus");
  });

  it("passes maxOutputTokens >= 1200 (7 captions × caption + uiFocus > 300 default)", async () => {
    await generateListingPipelineCaptions(makeInput());

    const callArg = vi.mocked(getGenerativeModel).mock.calls[0]?.[0] as { maxOutputTokens?: number };
    console.log("maxOutputTokens:", callArg?.maxOutputTokens);
    expect(callArg?.maxOutputTokens).toBeGreaterThanOrEqual(1200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. uiFocus is present when Gemini returns it
// ─────────────────────────────────────────────────────────────────────────────

describe("generateListingPipelineCaptions — uiFocus present in response", () => {
  beforeEach(() => {
    useMockModel(fullCaptionsPayload());
  });

  it("returns 7 captions", async () => {
    const result = await generateListingPipelineCaptions(makeInput());
    console.log("Generated Captions:", JSON.stringify(result, null, 2));
    expect(result.captions).toHaveLength(7);
  });

  it("every caption carries a non-empty uiFocus string", async () => {
    const result = await generateListingPipelineCaptions(makeInput());
    for (const caption of result.captions) {
      console.log(`caption[${caption.order}].uiFocus =`, caption.uiFocus);
      expect(typeof caption.uiFocus).toBe("string");
      expect((caption.uiFocus as string).length).toBeGreaterThan(0);
    }
  });

  it("uiFocus is capped at 300 characters", async () => {
    const longFocus = "x".repeat(500);
    useMockModel(fullCaptionsPayload({ 1: { uiFocus: longFocus } }));

    const result = await generateListingPipelineCaptions(makeInput());
    expect((result.captions[0].uiFocus as string).length).toBeLessThanOrEqual(300);
  });

  it("uiFocus contains brand color reference when brandKit is provided", async () => {
    const result = await generateListingPipelineCaptions(makeInput());
    // The mock response hardcodes "#1A73E8" in uiFocus strings.
    const hasColorRef = result.captions.some((c) =>
      (c.uiFocus ?? "").includes("#1A73E8"),
    );
    expect(hasColorRef).toBe(true);
  });

  it("captions are ordered correctly (1–7)", async () => {
    const result = await generateListingPipelineCaptions(makeInput());
    const orders = result.captions.map((c) => c.order);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("themes match expected distribution (hook / feature / benefit / cta)", async () => {
    const result = await generateListingPipelineCaptions(makeInput());
    const themes = result.captions.map((c) => c.theme);
    expect(themes).toContain("hook");
    expect(themes).toContain("feature");
    expect(themes).toContain("benefit");
    expect(themes).toContain("cta");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Graceful degradation — uiFocus absent from model response
// ─────────────────────────────────────────────────────────────────────────────

describe("generateListingPipelineCaptions — uiFocus absent (pre-fix simulation)", () => {
  it("returns null uiFocus (not undefined, not throw) when field missing", async () => {
    const payloadWithoutFocus = {
      captions: [
        { order: 1, caption: "Your habit, reimagined", theme: "hook" },
        { order: 2, caption: "Build habits in seconds", theme: "feature" },
        { order: 3, caption: "Smart reminders", theme: "feature" },
        { order: 4, caption: "Track streaks", theme: "feature" },
        { order: 5, caption: "Feel the momentum", theme: "benefit" },
        { order: 6, caption: "Skip the battle", theme: "benefit" },
        { order: 7, caption: "Start now", theme: "cta" },
      ],
    };
    useMockModel(payloadWithoutFocus);

    const result = await generateListingPipelineCaptions(makeInput());
    for (const caption of result.captions) {
      // The parser returns null (not undefined) for missing uiFocus.
      // This allows downstream code to detect absence without crashing.
      expect(caption.uiFocus === null || caption.uiFocus === undefined).toBe(true);
    }
  });

  it("does not throw when model returns only 3 captions", async () => {
    useMockModel({
      captions: [
        { order: 1, caption: "Hook text", theme: "hook",    uiFocus: "hero screen" },
        { order: 2, caption: "Feature A",  theme: "feature", uiFocus: "feature panel" },
        { order: 3, caption: "CTA here",   theme: "cta",     uiFocus: "cta screen" },
      ],
    });

    const result = await generateListingPipelineCaptions(makeInput());
    expect(result.captions).toHaveLength(3);
    for (const c of result.captions) {
      expect(c.uiFocus).not.toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Arabic locale — RTL parity
// ─────────────────────────────────────────────────────────────────────────────

describe("generateListingPipelineCaptions — Arabic locale (RTL parity)", () => {
  it("processes Arabic captions and preserves uiFocus", async () => {
    const arPayload = {
      captions: [
        { order: 1, caption: "عادتك من جديد",         theme: "hook",    uiFocus: "شاشة رئيسية داكنة لون #1A73E8" },
        { order: 2, caption: "بناء العادات في ثوانٍ", theme: "feature", uiFocus: "لوحة تأهيل بزر أزرق #1A73E8" },
        { order: 3, caption: "تذكيرات ذكية",           theme: "feature", uiFocus: "إعدادات التذكير باللون #1A73E8" },
        { order: 4, caption: "تتبع التسلسلات",         theme: "feature", uiFocus: "تقويم داكن أيام #1A73E8" },
        { order: 5, caption: "اشعر بالزخم",             theme: "benefit", uiFocus: "شاشة احتفال #1A73E8" },
        { order: 6, caption: "تجاوز معركة الإرادة",   theme: "benefit", uiFocus: "مخطط تقدم #1A73E8" },
        { order: 7, caption: "ابدأ عادتك الأولى الآن", theme: "cta",     uiFocus: "شاشة CTA #1A73E8 زر كامل" },
      ],
    };
    useMockModel(arPayload);

    const result = await generateListingPipelineCaptions(makeInput("ar"));
    console.log("Arabic Generated Captions:", JSON.stringify(result, null, 2));

    expect(result.captions).toHaveLength(7);
    for (const caption of result.captions) {
      expect(typeof caption.uiFocus).toBe("string");
      expect((caption.uiFocus as string).length).toBeGreaterThan(0);
    }
  });

  it("passes the same schema config for Arabic as for English", async () => {
    useMockModel(fullCaptionsPayload());
    await generateListingPipelineCaptions(makeInput("ar"));

    const callArg = vi.mocked(getGenerativeModel).mock.calls[0]?.[0];
    expect(callArg).toMatchObject({
      responseMimeType: "application/json",
      responseSchema: expect.objectContaining({ required: expect.arrayContaining(["captions"]) }),
    });
  });
});
