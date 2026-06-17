import { describe, expect, test } from "vitest";
import {
  isTruncatedFinishReason,
  parseGeminiJsonText,
  prepareGeminiJsonText,
} from "../gemini-json-parse-utils";

describe("parse-gemini-json-response", () => {
  test("isTruncatedFinishReason detects MAX_TOKENS and LENGTH", () => {
    expect(isTruncatedFinishReason("MAX_TOKENS")).toBe(true);
    expect(isTruncatedFinishReason("LENGTH")).toBe(true);
    expect(isTruncatedFinishReason("STOP")).toBe(false);
  });

  test("prepareGeminiJsonText heals missing closing brace", () => {
    const raw = '{"title":"Track Health","shortDescription":"A complete fitness app"';
    const { text, recovered } = prepareGeminiJsonText(raw);
    expect(recovered).toBe(true);
    expect(() => JSON.parse(text)).not.toThrow();
    expect(JSON.parse(text)).toMatchObject({ title: "Track Health" });
  });

  test("parseGeminiJsonText parses complete JSON", () => {
    const result = parseGeminiJsonText('{"title":"Hello"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ title: "Hello" });
      expect(result.recovered).toBe(false);
    }
  });

  test("parseGeminiJsonText flags truncated parse failures", () => {
    const result = parseGeminiJsonText('{"title":"مرحبا","incomplete":"عرب', {
      truncated: true,
      finishReason: "MAX_TOKENS",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("truncated");
      expect(result.finishReason).toBe("MAX_TOKENS");
    }
  });

  test("parseGeminiJsonText recovers partial nested JSON", () => {
    const truncated =
      '{"title":"Diet App","listingVariants":{"aggressive":{"title":"Beat rivals"';
    const result = parseGeminiJsonText(truncated, { truncated: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recovered).toBe(true);
      expect((result.value as { title: string }).title).toBe("Diet App");
    }
  });
});
