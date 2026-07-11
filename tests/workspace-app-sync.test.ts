import { describe, expect, it } from "vitest";
import { OPTIMIZER_CONTEXT_KEY } from "@/hooks/useOptimizerSync";
import { KEYWORD_SIGNALS_KEY } from "@/hooks/useOptimizerSync";
import { OPTIMIZATION_QUEUE_KEY } from "@/lib/client/optimization-queue-client";

describe("app-scoped query keys", () => {
  it("includes appId in optimizer context key", () => {
    expect(OPTIMIZER_CONTEXT_KEY("ws-1", "en", "app-a")).toEqual([
      "optimizer-context",
      "ws-1",
      "en",
      "app-a",
    ]);
    expect(OPTIMIZER_CONTEXT_KEY("ws-1", "ar")).toEqual([
      "optimizer-context",
      "ws-1",
      "ar",
      "",
    ]);
  });

  it("isolates keyword signals per app", () => {
    const appA = KEYWORD_SIGNALS_KEY("ws-1", "app-a", "en");
    const appB = KEYWORD_SIGNALS_KEY("ws-1", "app-b", "en");
    expect(appA).not.toEqual(appB);
  });

  it("isolates optimization queue per app", () => {
    const appA = OPTIMIZATION_QUEUE_KEY("ws-1", "en", "app-a");
    const appB = OPTIMIZATION_QUEUE_KEY("ws-1", "en", "app-b");
    expect(appA[3]).toBe("app-a");
    expect(appB[3]).toBe("app-b");
  });
});
