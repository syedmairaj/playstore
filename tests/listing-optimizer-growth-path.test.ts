import { describe, expect, it } from "vitest";
import {
  readDiscoveryWorkflowMode,
  persistDiscoveryWorkflowMode,
} from "@/lib/client/listing-optimizer-growth-path";

describe("listing-optimizer-growth-path re-exports", () => {
  it("re-exports discovery workflow mode helpers", () => {
    expect(typeof readDiscoveryWorkflowMode).toBe("function");
    expect(typeof persistDiscoveryWorkflowMode).toBe("function");
  });
});
