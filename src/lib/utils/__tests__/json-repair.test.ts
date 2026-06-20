import { describe, expect, test } from "vitest";
import { padTruncatedModularLongJson, robustParseJson } from "../json-repair";

describe("robustParseJson", () => {
  test("parses complete JSON object", () => {
    expect(robustParseJson('{"title":"Hello"}')).toEqual({ title: "Hello" });
  });

  test("strips markdown fences", () => {
    expect(robustParseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test("extracts first { to last } from conversational filler", () => {
    const raw =
      'Here is the result:\n{"variations":[{"type":"growth","text":"Grow."}]}\nThanks!';
    expect(robustParseJson(raw)).toEqual({
      variations: [{ type: "growth", text: "Grow." }],
    });
  });

  test("balances missing closing brace", () => {
    const raw = '{"title":"Track Health","shortDescription":"A complete fitness app"';
    expect(robustParseJson(raw)).toMatchObject({ title: "Track Health" });
  });

  test("preserves Arabic UTF-8 content", () => {
    const raw = '{"text":"مرحبا بك في التطبيق."}';
    expect(robustParseJson(raw)).toEqual({ text: "مرحبا بك في التطبيق." });
  });

  test("returns null when parsing is impossible", () => {
    expect(robustParseJson("not json at all")).toBeNull();
    expect(robustParseJson("")).toBeNull();
  });

  test("pads truncated modular long JSON when features key is present", () => {
    const raw = '{"features":[{"label":"Feature","bullets":["Benefit one"';
    const padded = padTruncatedModularLongJson(raw);
    expect(padded).toMatch(/"hook"\s*:/);
    expect(padded).toMatch(/"closing"\s*:/);
    expect(padded.trim().endsWith("}")).toBe(true);

    const parsed = robustParseJson(raw);
    expect(parsed).toMatchObject({
      features: expect.arrayContaining([
        expect.objectContaining({ label: "Feature" }),
      ]),
    });
  });
});
