import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  listingOptimizerSessionKey,
  readListingOptimizerSession,
  writeListingOptimizerSession,
  clearListingOptimizerSession,
} from "@/lib/client/listing-optimizer-keywords-prefill";

describe("per-app listing optimizer session", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    const sessionStorage = {
      getItem(key: string) {
        return store[key] ?? null;
      },
      setItem(key: string, value: string) {
        store[key] = value;
      },
      removeItem(key: string) {
        delete store[key];
      },
    };
    vi.stubGlobal("window", { sessionStorage });
    vi.stubGlobal("sessionStorage", sessionStorage);
  });

  it("stores and reads discovery context per app id", () => {
    writeListingOptimizerSession({
      appId: "snap",
      keywords: "photo editor, snap filter",
      appName: "snap",
      category: "Social",
      features: "Share moments instantly",
      toneStyle: "professional",
      previewShortDesc: "",
      previewIconUrl: "",
    });
    writeListingOptimizerSession({
      appId: "salt-sugar",
      keywords: "blood pressure tracker",
      appName: "Salt Sugar",
      category: "Health",
      features: "Clinical-grade accuracy",
      toneStyle: "professional",
      previewShortDesc: "",
      previewIconUrl: "",
    });

    const snap = readListingOptimizerSession("snap");
    const salt = readListingOptimizerSession("salt-sugar");

    expect(snap?.keywords).toContain("photo editor");
    expect(salt?.keywords).toContain("blood pressure");
    expect(snap?.features).not.toContain("Clinical-grade");
  });

  it("does not return another app's legacy session blob", () => {
    store["playstore:optimizer:session"] = JSON.stringify({
        appId: "salt-sugar",
        keywords: "glucose monitor",
        appName: "Salt Sugar",
        category: "Health",
        features: "salt sugar tracker",
        toneStyle: "professional",
        previewShortDesc: "",
        previewIconUrl: "",
    });

    expect(readListingOptimizerSession("snap")).toBeNull();
    expect(readListingOptimizerSession("salt-sugar")?.keywords).toContain("glucose");
  });

  it("clears per-app session on demand", () => {
    writeListingOptimizerSession({
      appId: "snap",
      keywords: "snap keyword",
      appName: "snap",
      category: "Social",
      features: "",
      toneStyle: "professional",
      previewShortDesc: "",
      previewIconUrl: "",
    });
    clearListingOptimizerSession("snap");
    expect(store[listingOptimizerSessionKey("snap")]).toBeUndefined();
  });
});
