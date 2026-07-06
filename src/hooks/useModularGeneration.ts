"use client";

import { useCallback, useEffect, useState } from "react";
import {
  finalizeModularListing,
  generateModularLong,
  generateModularPipeline,
  generateModularShort,
  generateModularTitle,
  regenerateModularLongBlock,
  type ModularGenerateBaseInput,
  type ModularGenerateClientHooks,
} from "@/lib/client/modular-listing-generate-client";
import { capLockedKeywords } from "@/lib/validation/listing-modular-generate-body";
import { fetchDraftState } from "@/lib/client/fetch-listing-draft-client";
import {
  checkPipelineReadiness,
  type PipelineDiscoveryBlocker,
} from "@/lib/client/pipeline-preflight";
import type { GenerateOptimizedListingSuccess } from "@/lib/listing/generate-optimized-listing";
import { coerceListingText } from "@/components/listing/optimizer/listing-field-limits";
import { listingCopyToModularState } from "@/lib/listing/assemble-modular-listing";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import {
  EMPTY_MODULAR_LISTING_STATE,
  modularListingFinalizeStateSchema,
  type ModularBlockSnapshotKey,
  type ModularListingBlockId,
  type ModularListingGenerationStep,
  type ModularListingState,
} from "@/lib/listing/modular-listing.types";
import { modularStateToListingCopy } from "@/lib/listing/assemble-modular-listing";
import { shortVariationText, shortVariationsFromFullOutput } from "@/lib/listing/modular-short-variations";
import { orchestrationToModularState } from "@/lib/listing/orchestration-to-modular-state";
import type { OrchestrationProtocol } from "@/lib/listing/orchestration-protocol.schema";
import {
  mergeWarningsPayload,
  type ListingGenerationWarningsPayload,
} from "@/lib/listing/listing-generation-warnings";
import type { LongDescriptionAiTool } from "@/components/listing/optimizer/long-description-aso-editor";

const LONG_AI_TOOL_INSTRUCTIONS: Record<LongDescriptionAiTool, string> = {
  rewrite:
    "Rewrite the full long description for stronger ASO clarity and install conversion. Preserve facts, app name, and all locked keywords.",
  expand:
    "Expand the full long description with richer feature detail and benefit-led copy. Follow Google Play ASO best practices and keep locked keywords.",
  "tone-professional":
    "Adjust the full long description to a polished professional tone suitable for Google Play while keeping locked keywords.",
  "tone-casual":
    "Adjust the full long description to a friendly casual tone while remaining credible on Google Play and keeping locked keywords.",
};

export type ModularLoadingState = Record<ModularListingBlockId | "finalize", boolean>;

const INITIAL_LOADING: ModularLoadingState = {
  title: false,
  short: false,
  hook: false,
  features: false,
  closing: false,
  finalize: false,
};

type DraftPersistedPhases = {
  title: boolean;
  short: boolean;
  long: boolean;
};

const EMPTY_DRAFT_PHASES: DraftPersistedPhases = {
  title: false,
  short: false,
  long: false,
};

function snapshotBlockValue(
  state: ModularListingState,
  blockId: ModularListingBlockId,
): string {
  if (blockId === "title") return state.title.value;
  if (blockId === "short") {
    return state.shortDescription.variations
      .map((v) => `${v.type}:${v.text}`)
      .join("\n---\n");
  }
  if (blockId === "hook") return state.longDescription.hook;
  if (blockId === "features") return state.longDescription.features;
  return state.longDescription.closing;
}

function isEmptyModularStep(
  blockId: ModularListingBlockId,
  state: ModularListingState,
): boolean {
  if (blockId === "title") return !state.title.value.trim();
  if (blockId === "short") {
    return !state.shortDescription.variations.some((v) => v.text.trim());
  }
  if (blockId === "hook") return !state.longDescription.hook.trim();
  if (blockId === "features") return !state.longDescription.features.trim();
  return !state.longDescription.closing.trim();
}

function isEmptyLongPayload(data: {
  hook: string;
  features: string;
  closing: string;
}): boolean {
  return !data.hook.trim() && !data.features.trim() && !data.closing.trim();
}

function titleFromStepResponse(data: { title?: string } | null | undefined): string {
  return data?.title?.trim() ?? "";
}

function shortVariationsFromStepResponse(
  data: { variations?: ModularListingState["shortDescription"]["variations"] } | null | undefined,
): ModularListingState["shortDescription"]["variations"] {
  return (data?.variations ?? []).filter((v) => v.text?.trim());
}

function longFromStepResponse(
  data: { hook?: string; features?: string; closing?: string } | null | undefined,
): { hook: string; features: string; closing: string } {
  return {
    hook: data?.hook?.trim() ?? "",
    features: data?.features?.trim() ?? "",
    closing: data?.closing?.trim() ?? "",
  };
}

export type UseModularGenerationOptions = {
  getBaseInput: () => ModularGenerateBaseInput | null;
  lockedKeywords?: string[];
  clientHooks?: ModularGenerateClientHooks;
  onFinalizeSuccess?: (result: GenerateOptimizedListingSuccess) => void;
  onError?: (message: string, code?: string) => void;
  onBillingMeta?: (meta: {
    trialRegenerationsUsed?: number;
    trialRegenerationsRemaining?: number;
    creditsRemaining?: number;
    creditsCharged?: number;
  }) => void;
  /**
   * Called when generation warnings are available.
   * `isDraft` is true for instant-draft / fast-draft responses where context is
   * intentionally limited — use this to suppress health-label toasts for drafts.
   */
  onWarnings?: (warnings: ListingGenerationWarningsPayload, isDraft?: boolean) => void;
  /**
   * Called immediately when the API returns 202 with a queued jobId, before
   * the internal polling loop begins.  Wire this to `useListingPipeline`'s
   * `startPolling` in the consuming component to drive a progress indicator
   * and surface a 30-second timeout warning.
   *
   * `versionId` is present when POST /api/listings/generate created a
   * placeholder ListingVersion row — pass it to the UI for the optimistic shell.
   */
  onJobQueued?: (jobId: string, versionId?: string) => void;
};

export function useModularGeneration({
  getBaseInput,
  lockedKeywords = [],
  clientHooks,
  onFinalizeSuccess,
  onError,
  onBillingMeta,
  onWarnings,
  onJobQueued,
}: UseModularGenerationOptions) {
  const [state, setState] = useState<ModularListingState>(EMPTY_MODULAR_LISTING_STATE);
  const [generationWarnings, setGenerationWarnings] =
    useState<ListingGenerationWarningsPayload | null>(null);
  const [loading, setLoading] = useState<ModularLoadingState>(INITIAL_LOADING);
  const [previousBlocks, setPreviousBlocks] = useState<
    Partial<Record<ModularBlockSnapshotKey, string>>
  >({});
  const [blockErrors, setBlockErrors] = useState<
    Partial<Record<ModularBlockSnapshotKey, boolean>>
  >({});
  const [draftPersistedPhases, setDraftPersistedPhases] =
    useState<DraftPersistedPhases>(EMPTY_DRAFT_PHASES);

  /**
   * Non-null when an intel module is blocking generation.
   * Set after a 423 API response or after `refreshDiscoveryCheck()`.
   */
  const [discoveryBlocker, setDiscoveryBlocker] =
    useState<PipelineDiscoveryBlocker | null>(null);

  /**
   * During the auto-chain fallback ("title" → "short" → "long" → retry),
   * this holds the current phase label for UI display:
   * "title" | "short" | "long" | "retrying" | null
   */
  const [phaseChainStep, setPhaseChainStep] = useState<
    "title" | "short" | "long" | "retrying" | null
  >(null);

  /**
   * True from mount until the first reconciliation with real data (via
   * syncFromOrchestration or markDraftRestoredFromPersistence).  Consumers
   * should render a skeleton while this is true to prevent an empty-state
   * flash before initial data lands.
   *
   * A 2 s safety-net effect resets it to false if neither hydration path
   * fires (e.g. the panel is shown but no orchestration / draft exists yet).
   */
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    if (!isHydrating) return;
    const id = setTimeout(() => setIsHydrating(false), 2000);
    return () => clearTimeout(id);
  }, [isHydrating]);

  const markBlockError = useCallback((key: ModularBlockSnapshotKey) => {
    setBlockErrors((prev) => ({ ...prev, [key]: true }));
  }, []);

  const clearBlockError = useCallback((key: ModularBlockSnapshotKey) => {
    setBlockErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const capturePrevious = useCallback(
    (blockId: ModularListingBlockId, current: ModularListingState) => {
      const value = snapshotBlockValue(current, blockId);
      if (!value.trim()) return;
      setPreviousBlocks((prev) => ({ ...prev, [blockId]: value }));
      if (blockId === "short") {
        current.shortDescription.variations.forEach((variation, index) => {
          if (variation.text.trim()) {
            setPreviousBlocks((prev) => ({
              ...prev,
              [`short-${index}`]: variation.text,
            }));
          }
        });
      }
    },
    [],
  );

  const setBlockLoading = useCallback(
    (block: keyof ModularLoadingState, busy: boolean) => {
      setLoading((prev) => ({ ...prev, [block]: busy }));
    },
    [],
  );

  const applyStepWarnings = useCallback(
    (warnings?: ListingGenerationWarningsPayload, isDraft?: boolean) => {
      if (!warnings?.items.length) return;
      setGenerationWarnings((prev) => mergeWarningsPayload(prev, warnings));
      onWarnings?.(warnings, isDraft);
    },
    [onWarnings],
  );

  const applyBillingMeta = useCallback(
    (meta?: {
      trialRegenerationsUsed?: number;
      trialRegenerationsRemaining?: number;
      creditsRemaining?: number;
      creditsCharged?: number;
      draftPersisted?: boolean;
    }) => {
      if (!meta) return;
      onBillingMeta?.({
        trialRegenerationsUsed: meta.trialRegenerationsUsed,
        trialRegenerationsRemaining: meta.trialRegenerationsRemaining,
        creditsRemaining: meta.creditsRemaining,
        creditsCharged: meta.creditsCharged,
      });
    },
    [onBillingMeta],
  );

  const recordDraftPersisted = useCallback(
    (
      step: ModularListingGenerationStep,
      meta?: { draftPersisted?: boolean },
    ) => {
      if (!meta?.draftPersisted) return;
      setDraftPersistedPhases((prev) => {
        if (step === "pipeline") {
          return { title: true, short: true, long: true };
        }
        if (step === "title") return { ...prev, title: true };
        if (step === "short") return { ...prev, short: true };
        if (
          step === "long" ||
          step === "hook" ||
          step === "features" ||
          step === "closing"
        ) {
          return { ...prev, long: true };
        }
        return prev;
      });
    },
    [],
  );

  const applyStepMeta = useCallback(
    (
      step: ModularListingGenerationStep,
      meta?: {
        trialRegenerationsUsed?: number;
        trialRegenerationsRemaining?: number;
        creditsRemaining?: number;
        creditsCharged?: number;
        draftPersisted?: boolean;
      },
    ) => {
      applyBillingMeta(meta);
      recordDraftPersisted(step, meta);
    },
    [applyBillingMeta, recordDraftPersisted],
  );

  /**
   * Runs the pre-flight discovery check.  Call this when the user focuses the
   * generate panel or when queueHash changes.  Updates `discoveryBlocker`.
   */
  const refreshDiscoveryCheck = useCallback(
    async (params: {
      workspaceId: string;
      appId?: string | null;
      queueHash?: string;
      vaultLocale?: "en" | "ar";
    }) => {
      const result = await checkPipelineReadiness(params);
      if (!result.ready) {
        setDiscoveryBlocker(result.blockedBy);
      } else {
        setDiscoveryBlocker(null);
      }
    },
    [],
  );

  const clearDiscoveryBlocker = useCallback(() => setDiscoveryBlocker(null), []);

  const resolveLockedKeywords = useCallback(
    (input: ModularGenerateBaseInput): string[] => {
      const fromProp = capLockedKeywords(lockedKeywords);
      if (fromProp.length > 0) return fromProp;
      return capLockedKeywords(input.targetKeywords.split(/[,;\n]+/));
    },
    [lockedKeywords],
  );

  const generateTitle = useCallback(async () => {
    const input = getBaseInput();
    if (!input) return false;
    capturePrevious("title", state);
    clearBlockError("title");
    setBlockLoading("title", true);
    try {
      const result = await generateModularTitle(input, resolveLockedKeywords(input), undefined, clientHooks);
      if (!result.ok) {
        markBlockError("title");
        onError?.(result.error.message, result.error.code);
        return false;
      }
      applyStepWarnings(result.warnings, result.meta?.isDraft === true);
      const titleValue = titleFromStepResponse(result.modularData);
      if (!titleValue) {
        markBlockError("title");
        onError?.("section_generation_failed", "section_generation_failed");
        return false;
      }
      setState((prev) => ({
        ...prev,
        title: { value: titleValue, locked: true },
      }));
      applyStepMeta("title", result.meta);
      return true;
    } finally {
      setBlockLoading("title", false);
    }
  }, [
    applyStepMeta,
    applyStepWarnings,
    capturePrevious,
    clearBlockError,
    getBaseInput,
    markBlockError,
    onError,
    resolveLockedKeywords,
    setBlockLoading,
    state,
  ]);

  const generateShort = useCallback(async () => {
    const input = getBaseInput();
    if (!input) return false;
    const contextTitle = state.title.value.trim();
    if (!contextTitle) {
      onError?.("Generate a title first.");
      return false;
    }
    capturePrevious("short", state);
    clearBlockError("short");
    setBlockLoading("short", true);
    try {
      const result = await generateModularShort(input, contextTitle, undefined, clientHooks);
      if (!result.ok) {
        markBlockError("short");
        onError?.(result.error.message, result.error.code);
        return false;
      }
      applyStepWarnings(result.warnings, result.meta?.isDraft === true);
      const variations = shortVariationsFromStepResponse(result.modularData);
      if (!variations.some((v) => v.text.trim())) {
        markBlockError("short");
        onError?.("section_generation_failed", "section_generation_failed");
        return false;
      }
      setState((prev) => ({
        ...prev,
        shortDescription: {
          variations: [...variations],
          selectedIndex: 2,
        },
      }));
      applyStepMeta("short", result.meta);
      return true;
    } finally {
      setBlockLoading("short", false);
    }
  }, [
    applyStepMeta,
    applyStepWarnings,
    capturePrevious,
    clearBlockError,
    getBaseInput,
    markBlockError,
    onError,
    setBlockLoading,
    state,
  ]);

  const generateLong = useCallback(async (): Promise<ModularListingState | null> => {
    const input = getBaseInput();
    if (!input) return null;
    const short =
      state.shortDescription.variations[state.shortDescription.selectedIndex];
    if (!state.title.value.trim() || !short?.text.trim()) {
      onError?.("Generate title and short description first.");
      return null;
    }
    (["hook", "features", "closing"] as const).forEach((id) => {
      capturePrevious(id, state);
      clearBlockError(id);
    });
    setBlockLoading("hook", true);
    setBlockLoading("features", true);
    setBlockLoading("closing", true);
    try {
      const result = await generateModularLong(
        input,
        { title: state.title.value, shortDescription: shortVariationText(short) },
        state,
        undefined,
        clientHooks,
      );
      if (!result.ok) {
        (["hook", "features", "closing"] as const).forEach(markBlockError);
        onError?.(result.error.message, result.error.code);
        return null;
      }
      applyStepWarnings(result.warnings, result.meta?.isDraft === true);
      const data = longFromStepResponse(result.modularData);
      if (isEmptyLongPayload(data)) {
        (["hook", "features", "closing"] as const).forEach(markBlockError);
        onError?.("section_generation_failed", "section_generation_failed");
        return null;
      }
      const nextState: ModularListingState = {
        ...state,
        longDescription: {
          hook: data.hook,
          features: data.features,
          closing: data.closing,
        },
      };
      setState(nextState);
      applyStepMeta("long", result.meta);
      return nextState;
    } finally {
      setBlockLoading("hook", false);
      setBlockLoading("features", false);
      setBlockLoading("closing", false);
    }
  }, [
    applyStepMeta,
    applyStepWarnings,
    capturePrevious,
    clearBlockError,
    getBaseInput,
    markBlockError,
    onError,
    setBlockLoading,
    state,
  ]);

  const regenerateBlock = useCallback(
    async (blockId: ModularListingBlockId): Promise<ModularListingState | null> => {
      const input = getBaseInput();
      if (!input) return null;

      if (blockId === "title") {
        capturePrevious("title", state);
        clearBlockError("title");
        setBlockLoading("title", true);
        try {
          const titleResult = await generateModularTitle(input, resolveLockedKeywords(input), {
            isRegenerate: true,
          }, clientHooks);
          if (!titleResult.ok) {
            markBlockError("title");
            onError?.(titleResult.error.message, titleResult.error.code);
            return null;
          }
          applyStepWarnings(titleResult.warnings, titleResult.meta?.isDraft === true);
          const next: ModularListingState = {
            ...state,
            title: {
              value: titleFromStepResponse(titleResult.modularData),
              locked: true,
            },
          };
          if (!next.title.value.trim()) {
            markBlockError("title");
            onError?.("section_generation_failed", "section_generation_failed");
            return null;
          }
          setState(next);
          applyStepMeta("title", titleResult.meta);
          return next;
        } finally {
          setBlockLoading("title", false);
        }
      }

      if (blockId === "short") {
        const contextTitle = state.title.value.trim();
        if (!contextTitle) {
          onError?.("Generate a title first.");
          return null;
        }
        capturePrevious("short", state);
        clearBlockError("short");
        setBlockLoading("short", true);
        try {
          const shortResult = await generateModularShort(input, contextTitle, {
            isRegenerate: true,
          }, clientHooks);
          if (!shortResult.ok) {
            markBlockError("short");
            onError?.(shortResult.error.message, shortResult.error.code);
            return null;
          }
          applyStepWarnings(shortResult.warnings, shortResult.meta?.isDraft === true);
          const next: ModularListingState = {
            ...state,
            shortDescription: {
              variations: [...shortVariationsFromStepResponse(shortResult.modularData)],
              selectedIndex: 2,
            },
          };
          if (!next.shortDescription.variations.some((v) => v.text.trim())) {
            markBlockError("short");
            onError?.("section_generation_failed", "section_generation_failed");
            return null;
          }
          setState(next);
          applyStepMeta("short", shortResult.meta);
          return next;
        } finally {
          setBlockLoading("short", false);
        }
      }

      const short =
        state.shortDescription.variations[state.shortDescription.selectedIndex];
      if (!state.title.value.trim() || !short?.text.trim()) {
        onError?.("Title and short description are required context.");
        return null;
      }
      capturePrevious(blockId, state);
      clearBlockError(blockId);
      setBlockLoading(blockId, true);
      try {
        const result = await regenerateModularLongBlock(input, blockId, state, clientHooks);
        if (!result.ok) {
          markBlockError(blockId);
          onError?.(result.error.message, result.error.code);
          return null;
        }
        applyStepWarnings(result.warnings, result.meta?.isDraft === true);
        const data = longFromStepResponse(result.modularData);
        const next: ModularListingState = {
          ...state,
          longDescription: {
            hook: data.hook || state.longDescription.hook,
            features: data.features || state.longDescription.features,
            closing: data.closing || state.longDescription.closing,
          },
        };
        if (isEmptyModularStep(blockId, next)) {
          markBlockError(blockId);
          onError?.("section_generation_failed", "section_generation_failed");
          return null;
        }
        setState(next);
        applyStepMeta(blockId, result.meta);
        return next;
      } finally {
        setBlockLoading(blockId, false);
      }
    },
    [
      applyStepMeta,
      applyStepWarnings,
      capturePrevious,
      clearBlockError,
      getBaseInput,
      markBlockError,
      onError,
      resolveLockedKeywords,
      setBlockLoading,
      state,
    ],
  );

  /**
   * Runs only the phases listed in `missingPhases` sequentially using explicit
   * context passing (avoids stale-closure issues with React state).
   *
   * Returns the final `ModularListingState` after all chained phases succeed,
   * or `null` if any phase fails.
   */
  const runPhaseChain = useCallback(
    async (
      input: ModularGenerateBaseInput,
      missingPhases: Array<"title" | "short" | "long">,
      currentState: ModularListingState,
    ): Promise<ModularListingState | null> => {
      let working = { ...currentState };

      if (missingPhases.includes("title")) {
        setPhaseChainStep("title");
        const result = await generateModularTitle(
          input,
          resolveLockedKeywords(input),
          undefined,
          clientHooks,
        );
        if (!result.ok) {
          markBlockError("title");
          onError?.(result.error.message, result.error.code);
          return null;
        }
        applyStepWarnings(result.warnings, result.meta?.isDraft === true);
        const titleValue = (result.modularData as { title?: string } | undefined)?.title?.trim() ?? "";
        if (!titleValue) {
          markBlockError("title");
          onError?.("section_generation_failed", "section_generation_failed");
          return null;
        }
        working = { ...working, title: { value: titleValue, locked: true } };
        setState(working);
        applyStepMeta("title", result.meta);
      }

      if (missingPhases.includes("short")) {
        setPhaseChainStep("short");
        const contextTitle = working.title.value.trim();
        if (!contextTitle) {
          onError?.("Title is required before generating a short description.");
          return null;
        }
        const result = await generateModularShort(input, contextTitle, undefined, clientHooks);
        if (!result.ok) {
          markBlockError("short");
          onError?.(result.error.message, result.error.code);
          return null;
        }
        applyStepWarnings(result.warnings, result.meta?.isDraft === true);
        const variations = (
          (result.modularData as { variations?: ModularListingState["shortDescription"]["variations"] } | undefined)
            ?.variations ?? []
        ).filter((v) => v.text?.trim());
        if (!variations.length) {
          markBlockError("short");
          onError?.("section_generation_failed", "section_generation_failed");
          return null;
        }
        working = {
          ...working,
          shortDescription: { variations, selectedIndex: 2 },
        };
        setState(working);
        applyStepMeta("short", result.meta);
      }

      if (missingPhases.includes("long")) {
        setPhaseChainStep("long");
        const short = working.shortDescription.variations[working.shortDescription.selectedIndex];
        if (!working.title.value.trim() || !short?.text.trim()) {
          onError?.("Title and short description are required to generate the long description.");
          return null;
        }
        const result = await generateModularLong(
          input,
          { title: working.title.value, shortDescription: short.text },
          working,
          undefined,
          clientHooks,
        );
        if (!result.ok) {
          (["hook", "features", "closing"] as const).forEach(markBlockError);
          onError?.(result.error.message, result.error.code);
          return null;
        }
        applyStepWarnings(result.warnings, result.meta?.isDraft === true);
        const data = result.modularData as { hook?: string; features?: string; closing?: string } | undefined;
        const hook = data?.hook?.trim() ?? "";
        const features = data?.features?.trim() ?? "";
        const closing = data?.closing?.trim() ?? "";
        if (!hook && !features && !closing) {
          (["hook", "features", "closing"] as const).forEach(markBlockError);
          onError?.("section_generation_failed", "section_generation_failed");
          return null;
        }
        working = { ...working, longDescription: { hook, features, closing } };
        setState(working);
        applyStepMeta("long", result.meta);
      }

      return working;
    },
    [
      applyStepMeta,
      applyStepWarnings,
      clientHooks,
      markBlockError,
      onError,
      setPhaseChainStep,
    ],
  );

  const runModularPipeline = useCallback(async (): Promise<ModularListingState | null> => {
    const input = getBaseInput();
    if (!input) return null;

    (["title", "short", "hook", "features", "closing"] as const).forEach((id) => {
      clearBlockError(id);
    });
    setBlockLoading("title", true);
    setBlockLoading("short", true);
    setBlockLoading("hook", true);
    setBlockLoading("features", true);
    setBlockLoading("closing", true);

    try {
      const result = await generateModularPipeline(input, clientHooks, { onJobQueued });
      if (!result.ok) {
        if (result.aborted) {
          onError?.(result.error.message, "service_unavailable");
          markBlockError("title");
          return null;
        }

        // ── 423: intel module in DISCOVERY state ────────────────────────────
        if (result.error.code === "intel_module_processing") {
          const details = result.error.details as
            | { module?: string; discoveryCount?: number }
            | undefined;
          setDiscoveryBlocker({
            module: (details?.module ?? "competitor_spy") as PipelineDiscoveryBlocker["module"],
            discoveryCount: details?.discoveryCount ?? 0,
            message: result.error.message,
          });
          markBlockError("title");
          return null;
        }

        // ── Phase order conflict — auto-chain then retry ─────────────────────
        //
        // Both codes are handled identically:
        //  • "WAITING_FOR_PHASES"        → 202 from the producer route's read-
        //    mode guard; the `missingPhases` array is embedded in the response.
        //  • "modular_phase_order_conflict" → job-polling failure when the
        //    QStash worker's execute-mode guard fires; `missingPhases` may NOT
        //    be present in the error details, so we default to all three phases.
        //
        // Recovery: run the missing phases sequentially client-side (which
        // persists each one to workspace_listing_drafts), then retry the full
        // pipeline.  Loading spinners stay active throughout so the user sees
        // a seamless "Generating…" progression — no visible error flash.
        if (
          result.error.code === "WAITING_FOR_PHASES" ||
          result.error.code === "modular_phase_order_conflict"
        ) {
          const details = result.error.details as
            | { missingPhases?: Array<"title" | "short" | "long"> }
            | undefined;

          // When the error arrives from the worker via job-polling the
          // details object is often absent.  Default to all three phases —
          // runPhaseChain skips any that are already present in `state`.
          const missingPhases: Array<"title" | "short" | "long"> =
            details?.missingPhases?.length
              ? details.missingPhases
              : ["title", "short", "long"];

          const chainedState = await runPhaseChain(input, missingPhases, state);
          setPhaseChainStep(null);

          if (!chainedState) {
            // runPhaseChain already called onError + markBlockError
            return null;
          }

          // All missing phases are now persisted — retry the pipeline
          setPhaseChainStep("retrying");
          const retryResult = await generateModularPipeline(input, clientHooks, { onJobQueued });
          setPhaseChainStep(null);

          if (!retryResult.ok) {
            markBlockError("title");
            onError?.(retryResult.error.message, retryResult.error.code);
            return null;
          }

          applyStepWarnings(retryResult.warnings, retryResult.meta?.isDraft === true);
          applyStepMeta("pipeline", retryResult.meta);
          const retryState = retryResult.modularData as ModularListingState | undefined;
          if (!retryState?.title.value.trim()) {
            markBlockError("title");
            onError?.("section_generation_failed", "section_generation_failed");
            return null;
          }
          setState(retryState);
          return retryState;
        }

        // Generic error fallback (aborted already handled above)
        if (result.error.code === "generation_timeout") {
          const queueHash = input.queueHash?.trim();
          if (queueHash && input.workspaceId?.trim()) {
            try {
              const draft = await fetchDraftState(input.workspaceId, queueHash, {
                appId: input.appId,
                vaultLocale: input.vaultLocale,
              });
              if (
                draft.ok &&
                !draft.draft.isEmpty &&
                draft.draft.modularState.title.value.trim()
              ) {
                applyStepWarnings(undefined, true);
                setState(draft.draft.modularState);
                return draft.draft.modularState;
              }
            } catch {
              /* fall through to error toast */
            }
          }
        }

        onError?.(result.error.message, result.error.code);
        markBlockError("title");
        return null;
      }

      applyStepWarnings(result.warnings, result.meta?.isDraft === true);
      applyStepMeta("pipeline", result.meta);

      const modularState = result.modularData;
      if (!modularState?.title.value.trim()) {
        markBlockError("title");
        onError?.("section_generation_failed", "section_generation_failed");
        return null;
      }
      if (!modularState.shortDescription.variations.some((v) => v.text.trim())) {
        markBlockError("short");
        onError?.("section_generation_failed", "section_generation_failed");
        return null;
      }
      if (
        !modularState.longDescription.hook.trim() &&
        !modularState.longDescription.features.trim() &&
        !modularState.longDescription.closing.trim()
      ) {
        (["hook", "features", "closing"] as const).forEach(markBlockError);
        onError?.("section_generation_failed", "section_generation_failed");
        return null;
      }

      setState(modularState);
      return modularState;
    } finally {
      setBlockLoading("title", false);
      setBlockLoading("short", false);
      setBlockLoading("hook", false);
      setBlockLoading("features", false);
      setBlockLoading("closing", false);
      setPhaseChainStep(null);
    }
  }, [
    applyStepMeta,
    applyStepWarnings,
    clearBlockError,
    clientHooks,
    getBaseInput,
    markBlockError,
    onError,
    onJobQueued,
    runPhaseChain,
    setBlockLoading,
    state,
  ]);

  const finalizeListing = useCallback(async () => {
    const input = getBaseInput();
    if (!input) return null;

    const finalizeCheck = modularListingFinalizeStateSchema.safeParse(state);
    if (!finalizeCheck.success) {
      const issue = finalizeCheck.error.issues[0];
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      onError?.(`${path}${issue.message}`);
      return null;
    }

    setBlockLoading("finalize", true);
    try {
      let result = await finalizeModularListing(input, state, clientHooks);
      if (
        !result.ok &&
        result.error.code === "WAITING_FOR_PHASES"
      ) {
        // Producer syncs modularListing to persisted_phases on each finalize POST.
        result = await finalizeModularListing(input, state, clientHooks);
      }
      if (
        !result.ok &&
        (result.error.code === "WAITING_FOR_PHASES" ||
          result.error.code === "modular_phase_order_conflict")
      ) {
        const details = result.error.details as
          | { missingPhases?: Array<"title" | "short" | "long"> }
          | undefined;
        const missingPhases: Array<"title" | "short" | "long"> =
          details?.missingPhases?.length
            ? details.missingPhases
            : ["title", "short", "long"];

        const chainedState = await runPhaseChain(input, missingPhases, state);
        setPhaseChainStep(null);
        if (!chainedState) {
          return null;
        }

        setPhaseChainStep("retrying");
        result = await finalizeModularListing(input, chainedState, clientHooks);
        setPhaseChainStep(null);
      }

      if (!result.ok) {
        onError?.(result.error.message, result.error.code);
        return null;
      }
      applyStepWarnings(result.warnings, result.meta?.isDraft === true);
      onFinalizeSuccess?.(result);
      applyStepMeta("finalize", result.meta);
      return result;
    } finally {
      setBlockLoading("finalize", false);
    }
  }, [
    applyStepMeta,
    applyStepWarnings,
    clientHooks,
    getBaseInput,
    onError,
    onFinalizeSuccess,
    runPhaseChain,
    setBlockLoading,
    state,
  ]);

  const applyLongAiTool = useCallback(
    async (tool: LongDescriptionAiTool): Promise<ModularListingState | null> => {
      const input = getBaseInput();
      if (!input) return null;
      const short =
        state.shortDescription.variations[state.shortDescription.selectedIndex];
      if (!state.title.value.trim() || !short?.text.trim()) {
        onError?.("Generate title and short description first.");
        return null;
      }
      (["hook", "features", "closing"] as const).forEach((id) => {
        capturePrevious(id, state);
        clearBlockError(id);
      });
      setBlockLoading("hook", true);
      setBlockLoading("features", true);
      setBlockLoading("closing", true);
      try {
        const currentLong = modularStateToListingCopy(state).fullDescription.trim();
        const instruction = currentLong
          ? `${LONG_AI_TOOL_INSTRUCTIONS[tool]}\n\nCurrent long description:\n${currentLong}`
          : LONG_AI_TOOL_INSTRUCTIONS[tool];
        const result = await generateModularLong(
          input,
          { title: state.title.value, shortDescription: shortVariationText(short) },
          state,
          {
            userInstruction: instruction,
            isRegenerate: true,
          },
          clientHooks,
        );
        if (!result.ok) {
          (["hook", "features", "closing"] as const).forEach(markBlockError);
          onError?.(result.error.message, result.error.code);
          return null;
        }
        applyStepWarnings(result.warnings, result.meta?.isDraft === true);
        const data = longFromStepResponse(result.modularData);
        if (isEmptyLongPayload(data)) {
          (["hook", "features", "closing"] as const).forEach(markBlockError);
          onError?.("section_generation_failed", "section_generation_failed");
          return null;
        }
        const nextState: ModularListingState = {
          ...state,
          longDescription: {
            hook: data.hook,
            features: data.features,
            closing: data.closing,
          },
        };
        setState(nextState);
        applyStepMeta("long", result.meta);
        return nextState;
      } finally {
        setBlockLoading("hook", false);
        setBlockLoading("features", false);
        setBlockLoading("closing", false);
      }
    },
    [
      applyStepMeta,
      applyStepWarnings,
      capturePrevious,
      clearBlockError,
      getBaseInput,
      markBlockError,
      onError,
      setBlockLoading,
      state,
    ],
  );

  const markDraftRestoredFromPersistence = useCallback((restored: ModularListingState) => {
    setDraftPersistedPhases({
      title: Boolean(restored.title.value.trim()),
      short: restored.shortDescription.variations.some((v) => v.text.trim()),
      long: Boolean(
        restored.longDescription.hook.trim() ||
          restored.longDescription.features.trim() ||
          restored.longDescription.closing.trim(),
      ),
    });
    setIsHydrating(false);
  }, []);

  /** After paid full AI generation — sync modular panel from unlock output (no extra short API). */
  const applyFullGenerationOutput = useCallback(
    async (
      output: ListingGenerationOutput,
      options?: {
        modularDraftShort?: GenerateOptimizedListingSuccess["modularDraftShort"];
      },
    ): Promise<ModularListingState | null> => {
      const input = getBaseInput();
      if (!input) return null;

      const title =
        coerceListingText(output.title).trim() ||
        input.appName.trim().slice(0, 30);
      const fullDescription = coerceListingText(output.fullDescription).trim();
      const shortFromOutput = coerceListingText(output.shortDescription).trim();
      const baseState = listingCopyToModularState(
        {
          title,
          shortDescription: shortFromOutput,
          fullDescription,
        },
        {
          modularLong: {
            hook: fullDescription,
            features: "",
            closing: "",
          },
        },
      );

      const fromServer = options?.modularDraftShort?.variations?.filter((v) =>
        v.text?.trim(),
      );
      const variations =
        fromServer && fromServer.length > 0
          ? fromServer.map((v) => ({
              type: v.type as ModularListingState["shortDescription"]["variations"][number]["type"],
              text: v.text.trim(),
            }))
          : shortVariationsFromFullOutput(output);

      const nextState: ModularListingState = {
        ...baseState,
        title: { value: title, locked: true },
        shortDescription: {
          variations:
            variations.length > 0
              ? variations
              : baseState.shortDescription.variations,
          selectedIndex: 2,
        },
      };

      setState(nextState);
      markDraftRestoredFromPersistence(nextState);
      return nextState;
    },
    [getBaseInput, markDraftRestoredFromPersistence],
  );

  const clearAllBlockErrors = useCallback(() => {
    setBlockErrors({});
  }, []);

  const resetModularState = useCallback(() => {
    setState(EMPTY_MODULAR_LISTING_STATE);
    setLoading(INITIAL_LOADING);
    setPreviousBlocks({});
    setBlockErrors({});
    setGenerationWarnings(null);
    setDraftPersistedPhases(EMPTY_DRAFT_PHASES);
    // Re-arm hydration guard: after a reset the panel is empty again and
    // needs to wait for the next syncFromOrchestration / draft restore.
    setIsHydrating(true);
  }, []);

  const selectShortVariation = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      shortDescription: {
        ...prev.shortDescription,
        selectedIndex: Math.min(2, Math.max(0, index)),
      },
    }));
  }, []);

  const setTitleValue = useCallback((value: string) => {
    setState((prev) => ({
      ...prev,
      title: { ...prev.title, value: value.slice(0, 30) },
    }));
  }, []);

  const setLongDescriptionValue = useCallback((value: string) => {
    const trimmed = value.slice(0, 4000);
    setState((prev) => ({
      ...prev,
      longDescription: {
        hook: trimmed,
        features: "",
        closing: "",
      },
    }));
  }, []);

  const syncFromOrchestration = useCallback(
    (
      orchestration: OrchestrationProtocol,
      root?: {
        title?: string;
        shortDescription?: string;
        longDescription?: string;
      },
    ) => {
      setState(orchestrationToModularState(orchestration, root));
      setIsHydrating(false);
    },
    [],
  );

  const assembledCopy = modularStateToListingCopy(state);

  const isPipelineReady =
    Boolean(state.title.value.trim()) &&
    state.shortDescription.variations.length > 0 &&
    Boolean(state.longDescription.hook.trim());

  const isDraftFullyPersisted =
    draftPersistedPhases.title &&
    draftPersistedPhases.short &&
    draftPersistedPhases.long;

  const synthesizingSignals =
    loading.title ||
    loading.short ||
    loading.hook ||
    loading.features ||
    loading.closing;

  return {
    state,
    setState,
    loading,
    previousBlocks,
    blockErrors,
    generationWarnings,
    ingestWarnings: applyStepWarnings,
    assembledCopy,
    isPipelineReady,
    isDraftFullyPersisted,
    synthesizingSignals,
    /**
     * True from mount until the first real data reconciliation.
     * Consumers should render a skeleton while true to avoid an empty-state flash.
     */
    isHydrating,
    /** Non-null when an intel module is blocking generation (423 guard). */
    discoveryBlocker,
    clearDiscoveryBlocker,
    refreshDiscoveryCheck,
    /** During auto-chain fallback, the current phase being generated. */
    phaseChainStep,
    markDraftRestoredFromPersistence,
    clearAllBlockErrors,
    generateTitle,
    generateShort,
    generateLong,
    applyLongAiTool,
    runModularPipeline,
    regenerateBlock,
    finalizeListing,
    applyFullGenerationOutput,
    resetModularState,
    selectShortVariation,
    setTitleValue,
    setLongDescriptionValue,
    syncFromOrchestration,
  };
}
