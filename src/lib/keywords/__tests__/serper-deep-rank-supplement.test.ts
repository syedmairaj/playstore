import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { supplementDeepRankSerperWithPlaySearch } from "@/lib/keywords/serper-deep-rank-supplement";
import type { SerperPreviewItem } from "@/lib/keywords/serper-preview-types";

function item(
  packageId: string,
  position: number,
): SerperPreviewItem {
  return {
    title: packageId,
    link: `https://play.google.com/store/apps/details?id=${packageId}`,
    packageId,
    position,
    snippet: null,
  };
}

describe("supplementDeepRankSerperWithPlaySearch", () => {
  it("prefers Play Store positions when the same package appears in both lists", () => {
    const serper = [item("com.mapmyrun.android2", 1), item("com.fitness22.running", 2)];
    const play = [
      item("com.mapmyrun.android2", 1),
      item("com.myfitnesspal.android", 2),
      item("com.strava", 3),
    ];
    const merged = supplementDeepRankSerperWithPlaySearch(serper, play);
    assert.equal(merged.length, 4);
    assert.deepEqual(
      merged.map((row) => row.packageId),
      [
        "com.mapmyrun.android2",
        "com.myfitnesspal.android",
        "com.strava",
        "com.fitness22.running",
      ],
    );
    assert.equal(merged.find((row) => row.packageId === "com.mapmyrun.android2")!.position, 1);
    assert.equal(merged.find((row) => row.packageId === "com.fitness22.running")!.position, 4);
  });

  it("returns serper items unchanged when play search is empty", () => {
    const serper = [item("com.mapmyrun.android2", 1)];
    const merged = supplementDeepRankSerperWithPlaySearch(serper, []);
    assert.deepEqual(merged, serper);
  });
});
