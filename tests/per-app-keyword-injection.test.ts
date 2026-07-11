import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  consumePlaystoreKeywordContext,
  hasPlaystoreInjectedKeywordContext,
  injectedKeywordContextKey,
  setPlaystoreInjectedKeywordContext,
} from "@/lib/client/listing-optimizer-keywords-prefill";

describe("per-app keyword injection", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    const localStorage = {
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
    vi.stubGlobal("window", { localStorage, sessionStorage: localStorage });
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("sessionStorage", localStorage);
  });

  it("isolates injected keywords per app", () => {
    setPlaystoreInjectedKeywordContext("blood pressure tracker", "salt-sugar");
    setPlaystoreInjectedKeywordContext("photo editor", "snap");

    expect(hasPlaystoreInjectedKeywordContext("snap")).toBe(true);
    expect(hasPlaystoreInjectedKeywordContext("salt-sugar")).toBe(true);

    const snapTerms = consumePlaystoreKeywordContext("snap");
    expect(snapTerms).toContain("photo editor");
    expect(hasPlaystoreInjectedKeywordContext("snap")).toBe(false);
    expect(hasPlaystoreInjectedKeywordContext("salt-sugar")).toBe(true);

    const saltTerms = consumePlaystoreKeywordContext("salt-sugar");
    expect(saltTerms).toContain("blood pressure tracker");
    expect(store[injectedKeywordContextKey("snap")]).toBeUndefined();
  });
});
