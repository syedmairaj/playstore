import { describe, expect, it, beforeEach, vi } from "vitest";
import { readModularDraftSavedAtMs } from "@/hooks/useDraftPersistence";

describe("per-app modular draft storage", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    const storage = {
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
    vi.stubGlobal("window", { localStorage: storage, sessionStorage: storage });
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
  });

  it("isolates draft timestamps per app id", () => {
    store["listing-modular-draft:ws-1:salt-sugar:modular-listing"] = JSON.stringify({
      version: 1,
      savedAt: "2026-07-08T10:00:00.000Z",
      payload: { appId: "salt-sugar" },
    });
    store["listing-modular-draft:ws-1:snap:modular-listing"] = JSON.stringify({
      version: 1,
      savedAt: "2026-07-08T11:00:00.000Z",
      payload: { appId: "snap" },
    });

    expect(readModularDraftSavedAtMs("ws-1", "modular-listing", "snap")).toBeGreaterThan(0);
    expect(readModularDraftSavedAtMs("ws-1", "modular-listing", "salt-sugar")).toBeGreaterThan(0);
    expect(readModularDraftSavedAtMs("ws-1", "modular-listing", "new-app")).toBe(0);
  });

  it("does not read legacy workspace-wide draft when app id is set", () => {
    store["listing-modular-draft:ws-1:modular-listing"] = JSON.stringify({
      version: 1,
      savedAt: "2026-07-08T10:00:00.000Z",
      payload: { appId: "salt-sugar" },
    });

    expect(readModularDraftSavedAtMs("ws-1", "modular-listing", "snap")).toBe(0);
  });
});
