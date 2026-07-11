import { describe, it, expect } from "vitest";
import {
  buildAsoPrompt,
  buildAsoSystemInstructionsXml,
  buildListingCaptionsAsoPrompt,
  buildListingCaptionsFewShotXml,
  ASO_PLAY_STORE_LIMITS,
} from "../prompt-builder";

describe("prompt-builder", () => {
  describe("buildAsoSystemInstructionsXml", () => {
    it("includes XML-delimited system instructions with constraints", () => {
      const xml = buildAsoSystemInstructionsXml();
      expect(xml).toContain("<SystemInstructions>");
      expect(xml).toContain("<ConstraintChecklist>");
      expect(xml).toContain(`Max ${ASO_PLAY_STORE_LIMITS.title} characters`);
      expect(xml).toContain('name="Bold"');
      expect(xml).toContain('name="Professional"');
      expect(xml).toContain("JSON_ONLY");
    });
  });

  describe("buildListingCaptionsFewShotXml", () => {
    it("includes LISTING_CAPTIONS_SCHEMA-compatible few-shot shape", () => {
      const fewShot = buildListingCaptionsFewShotXml();
      expect(fewShot).toContain("<FewShotExamples>");
      expect(fewShot).toContain('"order": 1');
      expect(fewShot).toContain('"theme": "hook"');
      expect(fewShot).toContain('"uiFocus"');
    });
  });

  describe("buildListingCaptionsAsoPrompt", () => {
    it("builds modular prompt with brandifier and title verification", () => {
      const prompt = buildListingCaptionsAsoPrompt({
        appName: "Salt Sugar",
        category: "Health",
        longDescription: "Track blood pressure and diabetes metrics daily.",
        listingTitle: "Salt Sugar: BP & Glucose Tracker",
        toneStyle: "bold",
        appFeatures: "Scan labels, log BP and glucose",
        locale: "en",
        lockedKeywords: ["blood pressure", "diabetes"],
        brandKit: { primaryColor: "#1A73E8", style: "Minimal" },
      });

      expect(prompt).toContain("Brandifier");
      expect(prompt).toContain("Title verification");
      expect(prompt).toContain("Screenshot alignment");
      expect(prompt).toContain("PlayStoreTitle");
      expect(prompt).toContain("Salt Sugar: BP & Glucose Tracker");
      expect(prompt).toContain("Scan labels");
      expect(prompt).toContain("bold");
    });

    it("builds modular prompt with input data and output format", () => {
      const prompt = buildListingCaptionsAsoPrompt({
        appName: "Salt Sugar",
        category: "Health",
        longDescription: "Track blood pressure and diabetes metrics daily.",
        locale: "en",
        lockedKeywords: ["blood pressure", "diabetes"],
        brandKit: { primaryColor: "#1A73E8", style: "Minimal" },
      });

      expect(prompt).toContain("<SystemInstructions>");
      expect(prompt).toContain("<InputData>");
      expect(prompt).toContain("<Task>");
      expect(prompt).toContain("<OutputFormat>");
      expect(prompt).toContain("LISTING_CAPTIONS_SCHEMA");
      expect(prompt).toContain("Salt Sugar");
      expect(prompt).toContain("blood pressure");
      expect(prompt).toContain("#1A73E8");
      expect(prompt).toContain("exactly 7");
    });

    it("includes Arabic locale instruction when locale is ar", () => {
      const prompt = buildListingCaptionsAsoPrompt({
        appName: "Test",
        category: "Health",
        longDescription: "وصف طويل",
        locale: "ar",
      });

      expect(prompt).toContain("Modern Standard Arabic");
      expect(prompt).toContain("<Locale>ar</Locale>");
    });
  });

  describe("buildAsoPrompt", () => {
    it("wraps tone, keywords, and features in XML blocks", () => {
      const prompt = buildAsoPrompt({
        tone: "bold",
        keywords: ["fitness", "health"],
        features: "Streak tracking, reminders",
        task: "Generate listing for tone: bold",
        outputFormat: "Return JSON conforming to LISTING_CAPTIONS_SCHEMA",
      });

      expect(prompt).toContain("<Tone>bold</Tone>");
      expect(prompt).toContain("fitness, health");
      expect(prompt).toContain("Streak tracking");
      expect(prompt).toContain("Generate listing for tone: bold");
    });
  });
});
