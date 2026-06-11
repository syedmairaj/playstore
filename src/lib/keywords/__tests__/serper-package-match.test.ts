import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { itemMatchesTrackedPackage } from "@/lib/keywords/serper-snapshot-rank-resolve";

describe("itemMatchesTrackedPackage", () => {
  it("does not match unrelated apps that only share the android suffix segment", () => {
    const item = {
      packageId: "com.runtastic.android",
      title: "adidas Running: Run tracker",
    };
    assert.equal(
      itemMatchesTrackedPackage("com.myfitnesspal.android", item),
      false,
    );
  });

  it("still matches strava family ids via prefix", () => {
    const item = { packageId: "com.strava", title: "Strava: Run, Bike, Walk" };
    assert.equal(itemMatchesTrackedPackage("com.strava.android", item), true);
  });

  it("matches exact package ids", () => {
    const item = { packageId: "com.strava", title: "Strava: Run, Bike, Walk" };
    assert.equal(itemMatchesTrackedPackage("com.strava", item), true);
  });
});
