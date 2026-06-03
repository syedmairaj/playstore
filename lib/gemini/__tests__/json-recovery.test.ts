/**
 * JSON Recovery Utility Tests
 *
 * Validates truncated JSON recovery with RTL/LTR parity
 */

import { recoverPartialJson, parseJsonWithRecovery, recoverSentimentJson } from "../json-recovery";

describe("json-recovery", () => {
  describe("recoverPartialJson", () => {
    test("recovers object truncated mid-string", () => {
      const truncated = '{"name":"John","description":"A very long descr';
      const recovered = recoverPartialJson(truncated);
      expect(recovered).toBe('{"name":"John","description":"A very long descr"}');
    });

    test("recovers array truncated mid-string", () => {
      const truncated = '["apple","banana","cher';
      const recovered = recoverPartialJson(truncated);
      expect(recovered).toBe('["apple","banana","cher"]');
    });

    test("recovers nested object with truncation", () => {
      const truncated = '{"user":{"name":"Jane","email":"jane@exam';
      const recovered = recoverPartialJson(truncated);
      expect(recovered).toBe('{"user":{"name":"Jane","email":"jane@exam"}}');
    });

    test("preserves Arabic text (RTL) without modification", () => {
      const truncated = '{"ar":"مرحبا بالعالم","status":"test","incomplete":"مرحبا';
      const recovered = recoverPartialJson(truncated);
      expect(recovered).toContain("مرحبا بالعالم");
      expect(recovered).toBe('{"ar":"مرحبا بالعالم","status":"test","incomplete":"مرحبا"}');
    });

    test("preserves mixed English and Arabic content", () => {
      const truncated = '{"en":"Hello World","ar":"مرحبا بالعالم","mixed":"Hello مرحبا';
      const recovered = recoverPartialJson(truncated);
      expect(recovered).toContain("Hello World");
      expect(recovered).toContain("مرحبا بالعالم");
      expect(recovered).toContain("Hello مرحبا");
    });

    test("handles escaped quotes correctly", () => {
      const truncated = '{"text":"He said \\"Hello\\" and then","incomplete":"tes';
      const recovered = recoverPartialJson(truncated);
      expect(recovered).toBe('{"text":"He said \\"Hello\\" and then","incomplete":"tes"}');
    });

    test("returns null for empty string", () => {
      expect(recoverPartialJson("")).toBeNull();
    });

    test("returns null for non-JSON", () => {
      expect(recoverPartialJson("not json at all")).toBeNull();
    });

    test("handles valid complete JSON (no truncation)", () => {
      const complete = '{"a":1,"b":2}';
      const recovered = recoverPartialJson(complete);
      expect(recovered).toBe(complete);
    });

    test("recovers deeply nested structure", () => {
      const truncated =
        '{"level1":{"level2":{"level3":{"data":"some value","tags":["tag1","tag2"],"incomplete":"trunc';
      const recovered = recoverPartialJson(truncated);
      expect(recovered).toBeTruthy();
      const parsed = JSON.parse(recovered!);
      expect(parsed.level1.level2.level3.data).toBe("some value");
    });
  });

  describe("parseJsonWithRecovery", () => {
    test("parses complete JSON directly", () => {
      const complete = '{"name":"Test","count":5}';
      const result = parseJsonWithRecovery(complete);
      expect(result).toEqual({ name: "Test", count: 5 });
    });

    test("parses truncated JSON via recovery", () => {
      const truncated = '{"name":"Test","incomplete":"val';
      const result = parseJsonWithRecovery<{ name: string; incomplete?: string }>(truncated);
      expect(result).toEqual({ name: "Test", incomplete: "val" });
    });

    test("returns null if recovery fails", () => {
      const invalid = "completely not json";
      const result = parseJsonWithRecovery(invalid);
      expect(result).toBeNull();
    });

    test("returns null for empty string", () => {
      expect(parseJsonWithRecovery("")).toBeNull();
    });
  });

  describe("recoverSentimentJson", () => {
    test("recovers complete sentiment JSON", () => {
      const json = JSON.stringify({
        topPraiseKeywords: ["fast", "reliable", "easy"],
        reportedBugsKeywords: ["crashes", "slow"],
        featureRequestsKeywords: ["dark mode", "offline mode"],
      });
      const result = recoverSentimentJson(json);
      expect(result?.topPraiseKeywords).toEqual(["fast", "reliable", "easy"]);
      expect(result?.reportedBugsKeywords).toEqual(["crashes", "slow"]);
      expect(result?.featureRequestsKeywords).toEqual(["dark mode", "offline mode"]);
    });

    test("recovers truncated sentiment JSON", () => {
      const truncated = JSON.stringify({
        topPraiseKeywords: ["fast", "reliable"],
        reportedBugsKeywords: ["crashes"],
        featureRequestsKeywords: ["dark mode"],
      }).slice(0, 100); // Truncate

      const result = recoverSentimentJson(truncated);
      expect(result).toBeTruthy();
      expect(Array.isArray(result?.topPraiseKeywords)).toBe(true);
    });

    test("fills missing fields with empty arrays", () => {
      const partial = '{"topPraiseKeywords":["good"]}';
      const result = recoverSentimentJson(partial);
      expect(result?.topPraiseKeywords).toEqual(["good"]);
      expect(result?.reportedBugsKeywords).toEqual([]);
      expect(result?.featureRequestsKeywords).toEqual([]);
    });

    test("preserves Arabic keywords", () => {
      const sentiment = {
        topPraiseKeywords: ["سريع", "موثوق"],
        reportedBugsKeywords: ["أعطال"],
        featureRequestsKeywords: ["الوضع الليلي"],
      };
      const json = JSON.stringify(sentiment);
      const result = recoverSentimentJson(json);
      expect(result?.topPraiseKeywords).toContain("سريع");
      expect(result?.reportedBugsKeywords).toContain("أعطال");
      expect(result?.featureRequestsKeywords).toContain("الوضع الليلي");
    });

    test("slices arrays to max 6 items", () => {
      const sentiment = {
        topPraiseKeywords: Array.from({ length: 10 }, (_, i) => `item${i}`),
        reportedBugsKeywords: [],
        featureRequestsKeywords: [],
      };
      const json = JSON.stringify(sentiment);
      const result = recoverSentimentJson(json);
      expect(result?.topPraiseKeywords.length).toBe(6);
    });

    test("returns null if recovery impossible", () => {
      const invalid = "not json";
      const result = recoverSentimentJson(invalid);
      expect(result).toBeNull();
    });

    test("coerces non-string array items to strings", () => {
      const json = '{"topPraiseKeywords":[1,2,3],"reportedBugsKeywords":[],"featureRequestsKeywords":[]}';
      const result = recoverSentimentJson(json);
      expect(result?.topPraiseKeywords).toEqual(["1", "2", "3"]);
    });

    test("handles mixed English and Arabic keywords", () => {
      const sentiment = {
        topPraiseKeywords: ["fast", "سريع", "reliable"],
        reportedBugsKeywords: ["crashes", "أعطال"],
        featureRequestsKeywords: ["dark mode", "الوضع الليلي"],
      };
      const json = JSON.stringify(sentiment);
      const result = recoverSentimentJson(json);
      expect(result?.topPraiseKeywords).toContain("fast");
      expect(result?.topPraiseKeywords).toContain("سريع");
      expect(result?.reportedBugsKeywords).toContain("crashes");
      expect(result?.reportedBugsKeywords).toContain("أعطال");
    });
  });
});
