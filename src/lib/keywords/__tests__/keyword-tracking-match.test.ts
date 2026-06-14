import { describe, expect, it } from "vitest";
import {
  buildTrackedKeywordKeySet,
  isKeywordTrackedOnApp,
  keywordTrackingMatchKeys,
} from "@/lib/keywords/keyword-tracking-match";

describe("keywordTrackingMatchKeys", () => {
  it("includes raw and stripped forms for bracket-prefixed AI suggestions", () => {
    const keys = keywordTrackingMatchKeys("[competitive] diet goals app");
    expect(keys).toContain("[competitive] diet goals app");
    expect(keys).toContain("diet goals app");
  });
});

describe("isKeywordTrackedOnApp", () => {
  it("matches suggestion prefix when watchlist stores stripped term", () => {
    const tracked = buildTrackedKeywordKeySet(["diet goals app"]);
    expect(isKeywordTrackedOnApp("[competitive] diet goals app", tracked)).toBe(true);
  });

  it("matches when watchlist stores full prefixed term", () => {
    const tracked = buildTrackedKeywordKeySet(["[competitive] diet goals app"]);
    expect(isKeywordTrackedOnApp("[competitive] diet goals app", tracked)).toBe(true);
  });
});
