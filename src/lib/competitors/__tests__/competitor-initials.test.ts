import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCompetitorInitials,
  getCompetitorInitialsFromPackageId,
  resolveCompetitorInitials,
} from "@/lib/competitors/competitor-initials";

describe("getCompetitorInitials", () => {
  it("returns MF for MyFitnessPal", () => {
    assert.equal(
      getCompetitorInitials("MyFitnessPal: Calorie Counter - Apps on Google Play"),
      "MF",
    );
  });

  it("returns S for Strava", () => {
    assert.equal(getCompetitorInitials("Strava: Run, Bike, Walk"), "S");
  });

  it("returns NR for multi-word brands", () => {
    assert.equal(getCompetitorInitials("Nike Run Club"), "NR");
  });

  it("returns null for empty names", () => {
    assert.equal(getCompetitorInitials(null), null);
    assert.equal(getCompetitorInitials(""), null);
  });
});

describe("getCompetitorInitialsFromPackageId", () => {
  it("does not return C from com.* prefix", () => {
    assert.equal(getCompetitorInitialsFromPackageId("com.myfitnesspal.android"), "M");
    assert.equal(getCompetitorInitialsFromPackageId("com.strava"), "S");
  });
});

describe("resolveCompetitorInitials", () => {
  it("prefers display name over package id", () => {
    assert.equal(
      resolveCompetitorInitials("MyFitnessPal", "com.runtastic.android"),
      "MF",
    );
  });
});
