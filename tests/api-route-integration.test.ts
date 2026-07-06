/**
 * Route-level integration tests for:
 *   - POST /api/listings/generate  (producer)
 *   - POST /api/listings/worker    (QStash consumer)
 *
 * Strategy: all I/O modules (Supabase, QStash, Redis, Gemini orchestrator) are
 * mocked with vi.mock() so tests run without any real network calls.  Each test
 * sets up the mocks that correspond to the specific code path under examination
 * and then calls the exported POST handler directly with a synthetic NextRequest.
 *
 * Test matrix — /api/listings/generate:
 *   1. WAITING_FOR_PHASES  — producer receives a 202 when the orchestrator's
 *      read-mode check detects that prerequisite pipeline phases are not yet
 *      persisted in workspace_listing_drafts.
 *   2. Queued (happy path) — producer successfully enqueues a job with QStash
 *      and returns 202 { ok: true, accepted: true, jobId, status: "pending" }.
 *
 * Test matrix — /api/listings/worker:
 *   3. Stale vault context — worker returns 409 when the queueHash in the job
 *      payload does not match the live Staging Vault hash, and marks the job
 *      failed in workspace_listing_drafts without invoking Gemini.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ──────────────────────────────────────────────────────────────────────────────
// Module mocks
// All mocks are hoisted by vitest before any imports are resolved.
// ──────────────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }) }));
vi.mock("next/dist/server/request/cookies", () => ({}));

// Supabase — @supabase/ssr path used by src/lib/supabase/server.ts
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

// Workspace auth helpers
vi.mock("@/lib/workspace/workspace-handshake", () => ({
  assertWorkspaceHandshake: vi.fn().mockResolvedValue(undefined),
  WorkspaceHandshakeError: class WorkspaceHandshakeError extends Error {
    code = "workspace_mismatch";
    refreshWorkspace = false;
    details = undefined;
  },
}));
vi.mock("@/lib/workspace/membership", () => ({
  getWorkspaceRole: vi.fn().mockResolvedValue("owner"),
}));

// Context gateway + queue hash validation
vi.mock("@/lib/listing/context-gateway", () => ({
  stampAndCompileListingContext: vi.fn(),
  applyCompiledContextToListingInput: vi.fn((input: unknown) => input),
  ContextGatewayError: class ContextGatewayError extends Error {
    code = "context_gateway_error";
  },
  KeywordContextRequiredError: class KeywordContextRequiredError extends Error {
    code = "KEYWORD_CONTEXT_REQUIRED";
  },
  KEYWORD_CONTEXT_REQUIRED_MESSAGE: "ASO optimization requires staged keyword signals.",
}));
vi.mock("@/lib/optimization-queue/validate-active-context-queue-hash", () => ({
  validateActiveContextQueueHash: vi.fn(),
}));

// Orchestrator — the primary code path under test
vi.mock("@/lib/listing/listing-generation-orchestrator", () => ({
  runListingGenerationOrchestrator: vi.fn(),
  ModularPhaseOrderError: class ModularPhaseOrderError extends Error {
    code: string;
    missingPhases: string[];
    constructor(missingPhases: string[], code = "modular_phase_order_conflict") {
      super(code === "WAITING_FOR_PHASES" ? "Pipeline phases are still processing" : "Phase order conflict");
      this.code = code;
      this.missingPhases = missingPhases;
      this.name = "ModularPhaseOrderError";
    }
  },
  MissingKeywordContextError: class MissingKeywordContextError extends Error { code = "missing_keyword_context"; },
  orchestratorPromptVersion: vi.fn().mockReturnValue("listing-optimizer-v12.0"),
}));

// Executor — covers both the sync draft path and the async worker execution
vi.mock("@/lib/listing/listing-generation-executor", () => ({
  executeListingGenerationSync: vi.fn(),
  runListingGenerationWorkerJob: vi.fn().mockResolvedValue(undefined),
}));

// Job persistence + QStash publishing
vi.mock("@/lib/db/listing-generation-job", () => ({
  createListingGenerationJob: vi.fn(),
  findActiveJobByQueueHash: vi.fn(),
  loadListingGenerationJob: vi.fn(),
  updateListingGenerationJob: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/qstash/publish-listing-generation", () => ({
  publishListingGenerationWorker: vi.fn().mockResolvedValue(undefined),
}));

// Pipeline entry guard (state-machine helpers — no DB calls needed in read mode)
vi.mock("@/lib/listing/modular-pipeline-state-machine", () => ({
  assertModularPipelineEntry: vi.fn(),
  ModularPipelineEntryError: class ModularPipelineEntryError extends Error { code = "modular_pipeline_required"; },
  GenerationInProgressError: class GenerationInProgressError extends Error { code = "generation_in_progress"; },
  checkPipelineStateForStep: vi.fn(),
  assertPipelineStateForStep: vi.fn(),
  assertDraftPhasesPersisted: vi.fn(),
}));
vi.mock("@/lib/listing/generation-queue-hash-lock", () => ({
  acquireGenerationQueueHashLock: vi.fn().mockResolvedValue({ acquired: true }),
  releaseGenerationQueueHashLock: vi.fn().mockResolvedValue(undefined),
  generationQueueLockKey: vi.fn().mockImplementation(
    (workspaceId: string, queueHash: string) => `lock:${workspaceId}:${queueHash}`,
  ),
  GENERATION_QUEUE_LOCK_TTL_SECONDS: 300,
}));
vi.mock("@/lib/redis/redis-client", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    setNx: vi.fn().mockResolvedValue(true),
    del: vi.fn().mockResolvedValue(undefined),
    expire: vi.fn().mockResolvedValue(undefined),
  },
  isRedisConfigured: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/observability/pipeline-health", () => ({
  logPipelineEvent: vi.fn(),
}));

// In-process idempotency lock — let it run; Map is process-local and safe in test
vi.mock("@/lib/server/generation-idempotency-lock", () => ({
  acquireGenerationLock: vi.fn().mockReturnValue(true),
  releaseGenerationLock: vi.fn(),
}));

// Rate limiting
vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true, count: 1 }),
}));

// Gemini
vi.mock("@/lib/gemini/gemini-defaults", () => ({
  resolveGeminiModel: vi.fn().mockReturnValue("gemini-1.5-pro"),
}));
vi.mock("@/lib/gemini/log-gemini-env", () => ({
  logGeminiApiKeyDiagnostics: vi.fn(),
  shouldLogGeminiDebug: vi.fn().mockReturnValue(false),
}));

// Feature / billing helpers
vi.mock("@/lib/features", () => ({
  AI_CREDIT_COSTS: { listing_generation: 5, modular_listing_regenerate: 1 },
  buildInsufficientAiCreditsPayload: vi.fn((required: number, remaining: number) => ({
    ok: false,
    error: { code: "insufficient_credits", required, remaining },
  })),
  billsModularListingPhase: vi.fn().mockReturnValue(false),
  readWorkspaceAiCreditsRemaining: vi.fn().mockResolvedValue({ ok: true, remaining: 100 }),
  isModularPhaseBilledStep: vi.fn().mockReturnValue(false),
  consumeWorkspaceAiCredits: vi.fn().mockResolvedValue({ ok: true, ledgerId: "ledger-1", balanceAfter: 95 }),
  refundWorkspaceAiCredits: vi.fn().mockResolvedValue(undefined),
  consumeModularListingRegenerate: vi.fn(),
}));
vi.mock("@/lib/features/billing/modular-regenerate-billing", () => ({
  MODULAR_TRIAL_REGENERATIONS_LIMIT: 3,
}));

// Context / signal resolution
vi.mock("@/lib/listing/resolve-generation-context", () => ({
  resolvePrecomputedGenerationContext: vi.fn(),
  ContextPackageUnavailableError: class ContextPackageUnavailableError extends Error { code = "context_package_unavailable"; },
}));
vi.mock("@/lib/listing/listing-generation-adapter", () => ({
  useOptimizedPipeline: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/optimizer/fetch-optimized-context", () => ({
  fetchOptimizedContext: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/listing/merge-request-keyword-signals", () => ({
  enrichListingInputWithRequestKeywords: vi.fn((input: unknown) => input),
  resolveEffectiveVaultItemCount: vi.fn().mockReturnValue(2),
}));
vi.mock("@/lib/listing/listing-pre-generation-guard", () => ({
  hasPreGenerationKeywordContext: vi.fn().mockReturnValue(false),
  logTrackedKeywordSignalsPreflight: vi.fn(),
}));
vi.mock("@/lib/optimization-queue/build-active-context-synthesis", () => ({
  activeContextHasSignals: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/optimization-queue/context-audit-log", () => ({
  buildContextAuditSnapshot: vi.fn().mockReturnValue({}),
  logActiveContextAudit: vi.fn(),
}));

// Warnings
vi.mock("@/lib/listing/listing-generation-heuristics", () => ({
  assessListingInputWarnings: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/listing/listing-generation-warnings", () => ({
  dedupeWarnings: vi.fn((ws: unknown[]) => ws),
}));

// Misc
vi.mock("@/lib/listing/listing-context-serialization-error", () => ({
  assertListingRequestSerializable: vi.fn(),
  ListingContextSerializationError: class ListingContextSerializationError extends Error { code = "serialization_error"; },
}));
vi.mock("@/lib/db/listing-generations", () => ({
  patchListingGenerationInputs: vi.fn((input: unknown) => input),
}));
vi.mock("@/lib/client-ip", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/usage-log", () => ({
  logUsage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/listing/listing-generation-unavailable-error", () => ({
  ListingGenerationUnavailableError: class ListingGenerationUnavailableError extends Error { code = "listing_generation_unavailable"; },
}));

// Additional mocks required by the worker route only
vi.mock("@/lib/qstash/verify-qstash-request", () => ({
  verifyQStashRequest: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/listing/generation-queue-hash-lock", () => ({
  acquireGenerationQueueHashLock: vi.fn().mockResolvedValue({ acquired: true }),
  releaseGenerationQueueHashLock: vi.fn().mockResolvedValue(undefined),
  generationQueueLockKey: vi.fn().mockImplementation(
    (workspaceId: string, queueHash: string) => `lock:${workspaceId}:${queueHash}`,
  ),
  GENERATION_QUEUE_LOCK_TTL_SECONDS: 300,
}));
vi.mock("@/lib/redis/redis-client", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    setNx: vi.fn().mockResolvedValue(true),
    del: vi.fn().mockResolvedValue(undefined),
    expire: vi.fn().mockResolvedValue(undefined),
  },
  isRedisConfigured: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/observability/pipeline-health", () => ({
  logPipelineEvent: vi.fn(),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Import test subjects AFTER vi.mock declarations
// ──────────────────────────────────────────────────────────────────────────────

import { POST } from "../app/api/listings/generate/route";
import { POST as workerPOST } from "../app/api/listings/worker/route";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runListingGenerationOrchestrator, ModularPhaseOrderError } from "@/lib/listing/listing-generation-orchestrator";
import {
  findActiveJobByQueueHash,
  createListingGenerationJob,
  loadListingGenerationJob,
  updateListingGenerationJob,
} from "@/lib/db/listing-generation-job";
import { stampAndCompileListingContext } from "@/lib/listing/context-gateway";
import { validateActiveContextQueueHash } from "@/lib/optimization-queue/validate-active-context-queue-hash";
import { verifyQStashRequest } from "@/lib/qstash/verify-qstash-request";
import { resolvePrecomputedGenerationContext } from "@/lib/listing/resolve-generation-context";
import { runListingGenerationWorkerJob } from "@/lib/listing/listing-generation-executor";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { consumeRateLimit } from "@/lib/rate-limit";
import { acquireGenerationLock } from "@/lib/server/generation-idempotency-lock";
import {
  readWorkspaceAiCreditsRemaining,
  consumeWorkspaceAiCredits,
} from "@/lib/features";
import { buildContextAuditSnapshot } from "@/lib/optimization-queue/context-audit-log";
import { enrichListingInputWithRequestKeywords } from "@/lib/listing/merge-request-keyword-signals";
import { applyCompiledContextToListingInput } from "@/lib/listing/context-gateway";
import { dedupeWarnings } from "@/lib/listing/listing-generation-warnings";
import { patchListingGenerationInputs } from "@/lib/db/listing-generations";

// ──────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ──────────────────────────────────────────────────────────────────────────────

const WORKSPACE_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const USER_ID = "user-0000-0000-0000-000000000001";
const TEST_JOB_ID = "00000000-0000-4000-8000-000000000099";
/** A syntactically valid SHA-256 queue hash (64 lowercase hex chars). */
const QUEUE_HASH = "b".repeat(64);

/**
 * Minimum request body that satisfies listingModularGenerateBodySchema for
 * generationStep: "pipeline" (no contextTitle or modularListing required).
 */
const BASE_BODY = {
  appName: "TestApp",
  category: "Productivity",
  targetKeywords: ["focus", "habit"],
  appFeatures: "Track habits and stay focused",
  toneStyle: "professional",
  workspaceId: WORKSPACE_ID,
  vaultLocale: "en",
  queueHash: QUEUE_HASH,
  generationStep: "pipeline",
  lockedKeywords: [],
  includeOptimizerContext: false,
} as const;

/** Compiled context stub returned by stampAndCompileListingContext. */
const STUB_COMPILED_CONTEXT = {
  workspaceId: WORKSPACE_ID,
  appId: null,
  queueHash: QUEUE_HASH,
  vaultLocale: "en" as const,
  signals: [],
  keywords: [],
};

/** Resolved context returned by resolvePrecomputedGenerationContext. */
const STUB_CONTEXT_RESOLUTION = {
  gatedListingInput: {
    appName: "TestApp",
    category: "Productivity",
    targetKeywords: ["focus", "habit"],
    appFeatures: "Track habits and stay focused",
    toneStyle: "professional",
    lockedKeywords: [],
    trackedKeywordSignals: [],
  },
  pipeline: "optimized" as const,
  contextPackage: null,
};

/** Queue hash validation result — hashes match, pipeline can proceed. */
const STUB_VAULT_VALID = {
  ok: true as const,
  clientQueueHash: QUEUE_HASH,
  serverQueueHash: QUEUE_HASH,
  itemCount: 3,
  signalBreakdown: { keywordCount: 2, competitorCount: 1, reviewCount: 0, marketCount: 0 },
  hashFullyPopulated: true,
};

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a Supabase client mock suitable for the route.
 * The mock returns the test user from auth, passes workspace membership checks,
 * and returns an empty row for billing queries (.maybeSingle() → null data).
 */
function buildMockSupabaseClient() {
  const chainable: Record<string, unknown> = {};
  const selectResult = {
    eq: () => selectResult,
    in: () => selectResult,
    order: () => selectResult,
    limit: () => selectResult,
    range: () => selectResult,
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    select: () => selectResult,
  };
  Object.assign(chainable, {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
    },
    from: vi.fn().mockReturnValue(selectResult),
  });
  return chainable;
}

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/listings/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-workspace-id": WORKSPACE_ID,
      ...headers,
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared setup
// ──────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Re-establish all mocks cleared by mockReset:true + vi.clearAllMocks()
  vi.mocked(verifyQStashRequest).mockResolvedValue(true);
  vi.mocked(getWorkspaceRole).mockResolvedValue("owner" as never);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, count: 1 } as never);
  vi.mocked(acquireGenerationLock).mockReturnValue(true);
  vi.mocked(readWorkspaceAiCreditsRemaining).mockResolvedValue({ ok: true, remaining: 100 } as never);
  vi.mocked(consumeWorkspaceAiCredits).mockResolvedValue({ ok: true, ledgerId: "ledger-1", balanceAfter: 95 } as never);
  vi.mocked(buildContextAuditSnapshot).mockReturnValue({} as never);
  // Pass-through functions must preserve their input after mock reset
  vi.mocked(enrichListingInputWithRequestKeywords).mockImplementation((input) => input as never);
  vi.mocked(applyCompiledContextToListingInput).mockImplementation((input) => input as never);
  vi.mocked(dedupeWarnings).mockImplementation((ws) => ws as never);
  vi.mocked(patchListingGenerationInputs).mockImplementation((input) => input as never);

  const mockClient = buildMockSupabaseClient();
  vi.mocked(createClient).mockResolvedValue(mockClient as never);
  vi.mocked(getSupabaseAdmin).mockReturnValue(mockClient as never);

  vi.mocked(stampAndCompileListingContext).mockResolvedValue(STUB_COMPILED_CONTEXT as never);
  vi.mocked(validateActiveContextQueueHash).mockResolvedValue(STUB_VAULT_VALID);
  vi.mocked(resolvePrecomputedGenerationContext).mockResolvedValue(STUB_CONTEXT_RESOLUTION as never);
  vi.mocked(findActiveJobByQueueHash).mockResolvedValue(null);
  vi.mocked(createListingGenerationJob).mockResolvedValue({ jobId: TEST_JOB_ID, status: "pending" });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("POST /api/listings/generate", () => {

  /**
   * Test 1 — WAITING_FOR_PHASES
   *
   * Simulates calling `generationStep: "short"` when the `title` phase has not
   * yet been persisted in `workspace_listing_drafts`.  The orchestrator runs
   * in `executionMode: "read"` and throws ModularPhaseOrderError with code
   * "WAITING_FOR_PHASES".  The route must catch this and return 202 (not 500).
   */
  it("returns 202 with WAITING_FOR_PHASES when orchestrator read-check detects missing phases", async () => {
    // Arrange: request a "short" step without prior "title" phase
    const body = {
      ...BASE_BODY,
      generationStep: "pipeline",
      // Even on a pipeline step the read-check can detect missing phases
      // if there is an active job blocking re-run.
    };

    // Mock orchestrator to throw the phase-order sentinel from read mode
    vi.mocked(runListingGenerationOrchestrator).mockRejectedValueOnce(
      new ModularPhaseOrderError(["title", "short"], "WAITING_FOR_PHASES"),
    );

    // No active job in DB — producer will not include a jobId in the response
    vi.mocked(findActiveJobByQueueHash).mockResolvedValueOnce(null);

    // Act
    const response = await POST(makeRequest(body));
    const json = await response.json();

    // Assert — HTTP status
    expect(response.status).toBe(202);

    // Assert — body shape matches waitingForPhasesResponse()
    expect(json.status).toBe("pending");
    expect(json.code).toBe("WAITING_FOR_PHASES");
    expect(json.workspaceId).toBe(WORKSPACE_ID);
    expect(json.queueHash).toBe(QUEUE_HASH);

    // Assert — orchestrator was invoked in read mode (producer must never execute)
    const calls = vi.mocked(runListingGenerationOrchestrator).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0]).toMatchObject({ executionMode: "read" });

    // Assert — job was NOT created and QStash was NOT published
    expect(createListingGenerationJob).not.toHaveBeenCalled();
  });

  it("returns 202 with WAITING_FOR_PHASES and includes jobId when an active job is already running", async () => {
    // Arrange: orchestrator throws WAITING_FOR_PHASES and an active job exists
    vi.mocked(runListingGenerationOrchestrator).mockRejectedValueOnce(
      new ModularPhaseOrderError(["title"], "WAITING_FOR_PHASES"),
    );

    vi.mocked(findActiveJobByQueueHash).mockResolvedValueOnce({
      jobId: TEST_JOB_ID,
      status: "processing",
    });

    // Act
    const response = await POST(makeRequest(BASE_BODY));
    const json = await response.json();

    // Assert
    expect(response.status).toBe(202);
    expect(json.code).toBe("WAITING_FOR_PHASES");
    expect(json.jobId).toBe(TEST_JOB_ID);
    expect(json.accepted).toBe(true);
    expect(json.ok).toBe(true);
  });

  /**
   * Test 2 — Successful enqueue (queued)
   *
   * Simulates a clean pipeline generation request.  The orchestrator read-check
   * passes (returns a read-only result with phasesReady: true), no existing job
   * is found, the draft is created, and QStash delivery succeeds.
   * The route must return 202 with { ok: true, accepted: true, jobId, status: "pending" }.
   */
  it("returns 202 with jobId when generation is successfully enqueued", async () => {
    // Arrange: orchestrator read-check passes — phases are ready
    vi.mocked(runListingGenerationOrchestrator).mockResolvedValueOnce({
      step: "pipeline" as const,
      readOnly: true as const,
      phasesReady: true,
      persistedPhases: { title: false, short: false, long: false },
    } as never);

    // No active job; job creation and QStash publish succeed (defaults from beforeEach)

    // Act
    const response = await POST(makeRequest(BASE_BODY));
    const json = await response.json();

    // Assert — HTTP status
    expect(response.status).toBe(202);

    // Assert — body shape matches the async-accepted branch
    expect(json.ok).toBe(true);
    expect(json.accepted).toBe(true);
    expect(json.jobId).toBe(TEST_JOB_ID);
    expect(json.status).toBe("pending");
    expect(json.queueHash).toBe(QUEUE_HASH);
    expect(json.workspaceId).toBe(WORKSPACE_ID);

    // Assert — orchestrator was invoked in read mode
    expect(runListingGenerationOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({ executionMode: "read" }),
    );

    // Assert — a job was persisted and published to QStash
    expect(createListingGenerationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        queueHash: QUEUE_HASH,
      }),
    );
  });

  it("returns 202 immediately (skips job creation) when an existing pending job is found", async () => {
    // Arrange: read-check passes but a job for this queueHash is already pending
    vi.mocked(runListingGenerationOrchestrator).mockResolvedValueOnce({
      step: "pipeline" as const,
      readOnly: true as const,
      phasesReady: true,
      persistedPhases: { title: false, short: false, long: false },
    } as never);

    vi.mocked(findActiveJobByQueueHash).mockResolvedValueOnce({
      jobId: TEST_JOB_ID,
      status: "pending",
    });

    // Act
    const response = await POST(makeRequest(BASE_BODY));
    const json = await response.json();

    // Assert
    expect(response.status).toBe(202);
    expect(json.ok).toBe(true);
    expect(json.accepted).toBe(true);
    expect(json.jobId).toBe(TEST_JOB_ID);
    expect(json.status).toBe("pending");

    // Assert — no duplicate job was created
    expect(createListingGenerationJob).not.toHaveBeenCalled();
  });

});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/listings/worker
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Stub job row returned by loadListingGenerationJob.
 * Reflects the shape expected by the worker vault-hash check.
 */
const STUB_JOB_ROW = {
  id: TEST_JOB_ID,
  generation_status: "pending" as const,
  vault_locale: "en",
  generation_payload: {
    version: 1,
    workspaceId: WORKSPACE_ID,
    userId: USER_ID,
    clientIp: "127.0.0.1",
    headerWorkspaceId: WORKSPACE_ID,
    step: "pipeline",
    body: {
      appName: "TestApp",
      category: "Productivity",
      targetKeywords: ["focus", "habit"],
      appFeatures: "Track habits and stay focused",
      toneStyle: "professional",
      workspaceId: WORKSPACE_ID,
      vaultLocale: "en",
      queueHash: QUEUE_HASH,
      generationStep: "pipeline",
      lockedKeywords: [],
      includeOptimizerContext: false,
      appId: null,
    },
    listingInputForGeneration: {} as never,
    model: "gemini-1.5-pro",
    creditCost: 5,
    billsCredits: false,
    billsModularPhase: false,
    isRegenerate: false,
  },
};

/** Mismatched hash — simulates queue being mutated after enqueue. */
const STALE_SERVER_HASH = "c".repeat(64);

function makeWorkerRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/listings/worker", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // QStash signature header — verified by the mocked verifyQStashRequest
      "upstash-signature": "test-sig",
      ...headers,
    },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/listings/worker", () => {

  /**
   * Test 3 — Stale vault context
   *
   * The job was enqueued with QUEUE_HASH but the user mutated the optimization
   * queue before the worker ran. validateActiveContextQueueHash returns
   * { ok: false, serverQueueHash: STALE_SERVER_HASH }.
   *
   * The worker must:
   *   - Return 409 with code: "stale_vault_context"
   *   - Mark the job as "failed" in workspace_listing_drafts
   *   - NOT invoke runListingGenerationWorkerJob (Gemini)
   */
  it("returns 409 and marks job failed when the queueHash does not match the live vault", async () => {
    // Arrange: job loads successfully
    vi.mocked(loadListingGenerationJob).mockResolvedValueOnce(STUB_JOB_ROW as never);

    // Arrange: vault hash mismatch
    vi.mocked(validateActiveContextQueueHash).mockResolvedValueOnce({
      ok: false,
      clientQueueHash: QUEUE_HASH,
      serverQueueHash: STALE_SERVER_HASH,
      itemCount: 3,
      signalBreakdown: { keywordCount: 2, competitorCount: 1, reviewCount: 0, marketCount: 0 },
      hashFullyPopulated: false,
    });

    // Act
    const response = await workerPOST(makeWorkerRequest({ jobId: TEST_JOB_ID }));
    const json = await response.json();

    // Assert — HTTP status
    expect(response.status).toBe(409);

    // Assert — error body
    expect(json.ok).toBe(false);
    expect(json.jobId).toBe(TEST_JOB_ID);
    expect(json.error.code).toBe("stale_vault_context");
    expect(json.error.clientQueueHash).toBe(QUEUE_HASH);
    expect(json.error.serverQueueHash).toBe(STALE_SERVER_HASH);

    // Assert — job was marked failed (not left as pending)
    expect(updateListingGenerationJob).toHaveBeenCalledWith(
      TEST_JOB_ID,
      expect.objectContaining({ status: "failed" }),
    );

    // Assert — Gemini was NOT invoked
    expect(runListingGenerationWorkerJob).not.toHaveBeenCalled();
  });

  it("returns 200 and processes the job when the vault hash matches", async () => {
    // Arrange: job loads successfully with matching hash
    vi.mocked(loadListingGenerationJob).mockResolvedValueOnce(STUB_JOB_ROW as never);

    // Arrange: vault hash matches (default from beforeEach is STUB_VAULT_VALID which is ok: true)
    // validateActiveContextQueueHash is already mocked to STUB_VAULT_VALID

    // Act
    const response = await workerPOST(makeWorkerRequest({ jobId: TEST_JOB_ID }));
    const json = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.jobId).toBe(TEST_JOB_ID);

    // Assert — Gemini execution was triggered with the job id (second arg carries
    // optional freshCompiledContext from the worker route)
    expect(vi.mocked(runListingGenerationWorkerJob).mock.calls[0][0]).toBe(TEST_JOB_ID);
  });

  it("returns 404 when the job is not found in the database", async () => {
    vi.mocked(loadListingGenerationJob).mockResolvedValueOnce(null);

    const response = await workerPOST(makeWorkerRequest({ jobId: TEST_JOB_ID }));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("job_not_found");
    expect(runListingGenerationWorkerJob).not.toHaveBeenCalled();
  });

  it("idempotently skips already-completed jobs", async () => {
    vi.mocked(loadListingGenerationJob).mockResolvedValueOnce({
      ...STUB_JOB_ROW,
      generation_status: "completed",
    } as never);

    const response = await workerPOST(makeWorkerRequest({ jobId: TEST_JOB_ID }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.skipped).toBe(true);
    expect(runListingGenerationWorkerJob).not.toHaveBeenCalled();
  });

});
