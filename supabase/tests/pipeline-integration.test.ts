import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assertModularPhaseOrder,
  checkModularPhaseOrder,
  ModularPhaseOrderError,
} from "../../src/lib/listing/modular-phase-guard";

const QUEUE_HASH = "a".repeat(64);

describe("Async Listing Pipeline Integration Tests", () => {
  describe("Read Mode (Producer Guard)", () => {
    it("should return WAITING_FOR_PHASES when title is missing", () => {
      const result = checkModularPhaseOrder({
        step: "short",
        persistedPhases: { title: false, short: false, long: false },
        queueHash: QUEUE_HASH,
      });
      expect(result).toMatchObject({
        ok: false,
        code: "WAITING_FOR_PHASES",
        missingPhases: ["title"],
      });
    });

    it("should return ok: true when all prerequisites are met", () => {
      const result = checkModularPhaseOrder({
        step: "long",
        persistedPhases: { title: true, short: true, long: false },
        queueHash: QUEUE_HASH,
      });
      expect(result.ok).toBe(true);
    });

    it("should not block legacy full step when modular phases are empty", () => {
      const result = checkModularPhaseOrder({
        step: "full",
        persistedPhases: { title: false, short: false, long: false },
        queueHash: QUEUE_HASH,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("Execute Mode (Worker Assertion)", () => {
    it("should throw modular_phase_order_conflict if worker runs out of order", () => {
      expect(() => {
        assertModularPhaseOrder({
          step: "finalize",
          persistedPhases: { title: true, short: false, long: false },
          queueHash: QUEUE_HASH,
        });
      }).toThrow(ModularPhaseOrderError);

      try {
        assertModularPhaseOrder({
          step: "finalize",
          persistedPhases: { title: true, short: false, long: false },
          queueHash: QUEUE_HASH,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ModularPhaseOrderError);
        expect((error as ModularPhaseOrderError).code).toBe("modular_phase_order_conflict");
        expect((error as ModularPhaseOrderError).missingPhases).toEqual(
          expect.arrayContaining(["short", "long"]),
        );
      }
    });

    it("should execute successfully when state matches requirements", () => {
      expect(() => {
        assertModularPhaseOrder({
          step: "short",
          persistedPhases: { title: true, short: false, long: false },
          queueHash: QUEUE_HASH,
        });
      }).not.toThrow();
    });
  });
});
