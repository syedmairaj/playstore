import { afterEach, describe, expect, test, vi } from "vitest";
import { callGeminiLocalizeListing } from "@/lib/gemini/localize-listing-schema";

describe("callGeminiLocalizeListing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("returns parse failure instead of throwing when Gemini body is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 200 })),
    );

    const result = await callGeminiLocalizeListing({
      geminiUrl: "https://example.test/gemini",
      prompt: "localize this listing",
      sourceLongChars: 120,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("empty");
    }
  });

  test("returns parse failure instead of throwing when Gemini body is invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{not-json", { status: 200 })),
    );

    const result = await callGeminiLocalizeListing({
      geminiUrl: "https://example.test/gemini",
      prompt: "localize this listing",
      sourceLongChars: 120,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("parse");
    }
  });
});
