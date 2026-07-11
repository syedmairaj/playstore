import { describe, it, expect } from "vitest";
import {
  applyBrandifier,
  alignCaptionUiFocus,
  captionMentionsBrand,
  enhanceListingCaptions,
  weaveBrandIntoCaption,
} from "../enhance-listing-captions";
import type { ScreenshotCaption } from "@/lib/listing/listing-version.types";

function caption(
  order: number,
  text: string,
  theme: ScreenshotCaption["theme"],
  uiFocus?: string,
): ScreenshotCaption {
  return { order, caption: text, theme, uiFocus: uiFocus ?? null };
}

describe("enhance-listing-captions", () => {
  describe("applyBrandifier", () => {
    it("weaves app name into CTA when no caption mentions brand", () => {
      const captions = [
        caption(1, "Own your health", "hook", "dashboard"),
        caption(7, "Install today!", "cta", "cta screen"),
      ];
      const result = applyBrandifier(captions, "salt sugar");
      expect(result.some((c) => captionMentionsBrand(c.caption, "salt sugar"))).toBe(true);
      const cta = result.find((c) => c.theme === "cta");
      expect(cta?.caption).toContain("salt sugar");
    });

    it("leaves captions unchanged when brand already present", () => {
      const captions = [caption(1, "Track health with salt sugar", "hook")];
      const result = applyBrandifier(captions, "salt sugar");
      expect(result[0].caption).toBe("Track health with salt sugar");
    });
  });

  describe("weaveBrandIntoCaption", () => {
    it("fits within 70 characters", () => {
      const woven = weaveBrandIntoCaption("Own your health. Install today!", "salt sugar");
      expect(woven.length).toBeLessThanOrEqual(70);
      expect(woven.toLowerCase()).toContain("salt sugar");
    });
  });

  describe("alignCaptionUiFocus", () => {
    it("adds scan UI when caption mentions scan", () => {
      const aligned = alignCaptionUiFocus(
        caption(2, "Scan labels in seconds", "feature", "generic dashboard"),
      );
      expect(aligned.uiFocus?.toLowerCase()).toMatch(/scan|camera|viewfinder/);
    });

    it("adds glucose chart UI when caption mentions glucose", () => {
      const aligned = alignCaptionUiFocus(
        caption(3, "Track glucose daily", "feature", "settings panel"),
      );
      expect(aligned.uiFocus?.toLowerCase()).toMatch(/glucose|chart|log/);
    });
  });

  describe("enhanceListingCaptions", () => {
    it("applies brandifier and uiFocus alignment together", () => {
      const input = [
        caption(2, "Scan nutrition labels fast", "feature", "dark theme UI"),
        caption(7, "Own your health. Install today!", "cta", "hero screen"),
      ];
      const result = enhanceListingCaptions(input, {
        appName: "salt sugar",
        listingTitle: "Salt Sugar: BP & Glucose",
      });
      expect(result.some((c) => captionMentionsBrand(c.caption, "salt sugar"))).toBe(true);
      expect(result[0].uiFocus?.toLowerCase()).toMatch(/scan/);
    });
  });
});
