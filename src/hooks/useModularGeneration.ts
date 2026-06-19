"use client";

import { useCallback, useState } from "react";
import {
  finalizeModularListing,
  generateModularLong,
  generateModularShort,
  generateModularTitle,
  regenerateModularLongBlock,
  type ModularGenerateBaseInput,
} from "@/lib/client/modular-listing-generate-client";
import type { GenerateOptimizedListingSuccess } from "@/lib/listing/generate-optimized-listing";
import {
  EMPTY_MODULAR_LISTING_STATE,
  modularListingFinalizeStateSchema,
  type ModularBlockSnapshotKey,
  type ModularListingBlockId,
  type ModularListingState,
} from "@/lib/listing/modular-listing.types";
import { modularStateToListingCopy } from "@/lib/listing/assemble-modular-listing";
import { shortVariationText } from "@/lib/listing/modular-short-variations";
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

export type UseModularGenerationOptions = {
  getBaseInput: () => ModularGenerateBaseInput | null;
  lockedKeywords?: string[];
  onFinalizeSuccess?: (result: GenerateOptimizedListingSuccess) => void;
  onError?: (message: string, code?: string) => void;
  onBillingMeta?: (meta: {
    trialRegenerationsUsed?: number;
    trialRegenerationsRemaining?: number;
    creditsRemaining?: number;
    creditsCharged?: number;
  }) => void;
  onWarnings?: (warnings: ListingGenerationWarningsPayload) => void;
};

export function useModularGeneration({
  getBaseInput,
  lockedKeywords = [],
  onFinalizeSuccess,
  onError,
  onBillingMeta,
  onWarnings,
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
    (warnings?: ListingGenerationWarningsPayload) => {
      if (!warnings?.items.length) return;
      setGenerationWarnings((prev) => mergeWarningsPayload(prev, warnings));
      onWarnings?.(warnings);
    },
    [onWarnings],
  );

  const applyBillingMeta = useCallback(
    (meta?: {
      trialRegenerationsUsed?: number;
      trialRegenerationsRemaining?: number;
      creditsRemaining?: number;
      creditsCharged?: number;
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

  const resolveLockedKeywords = useCallback(
    (input: ModularGenerateBaseInput): string[] => {
      const fromProp = lockedKeywords.filter(Boolean);
      if (fromProp.length > 0) return fromProp;
      return input.targetKeywords
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
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
      const result = await generateModularTitle(input, resolveLockedKeywords(input));
      if (!result.ok) {
        markBlockError("title");
        onError?.(result.error.message, result.error.code);
        return false;
      }
      applyStepWarnings(result.warnings);
      const data = result.modularData!;
      if (!data.title.trim()) {
        markBlockError("title");
        onError?.("section_generation_failed", "section_generation_failed");
        return false;
      }
      setState((prev) => ({
        ...prev,
        title: { value: data.title, locked: true },
      }));
      return true;
    } finally {
      setBlockLoading("title", false);
    }
  }, [
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
      const result = await generateModularShort(input, contextTitle);
      if (!result.ok) {
        markBlockError("short");
        onError?.(result.error.message, result.error.code);
        return false;
      }
      applyStepWarnings(result.warnings);
      const data = result.modularData!;
      if (!data.variations.some((v) => v.text.trim())) {
        markBlockError("short");
        onError?.("section_generation_failed", "section_generation_failed");
        return false;
      }
      setState((prev) => ({
        ...prev,
        shortDescription: {
          variations: [...data.variations],
          selectedIndex: 2,
        },
      }));
      return true;
    } finally {
      setBlockLoading("short", false);
    }
  }, [
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
      );
      if (!result.ok) {
        (["hook", "features", "closing"] as const).forEach(markBlockError);
        onError?.(result.error.message, result.error.code);
        return null;
      }
      applyStepWarnings(result.warnings);
      const data = result.modularData!;
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
      applyBillingMeta(result.meta);
      return nextState;
    } finally {
      setBlockLoading("hook", false);
      setBlockLoading("features", false);
      setBlockLoading("closing", false);
    }
  }, [
    applyBillingMeta,
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
          });
          if (!titleResult.ok) {
            markBlockError("title");
            onError?.(titleResult.error.message, titleResult.error.code);
            return null;
          }
          applyStepWarnings(titleResult.warnings);
          const next: ModularListingState = {
            ...state,
            title: {
              value: titleResult.modularData!.title,
              locked: true,
            },
          };
          if (!next.title.value.trim()) {
            markBlockError("title");
            onError?.("section_generation_failed", "section_generation_failed");
            return null;
          }
          setState(next);
          applyBillingMeta(titleResult.meta);
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
          });
          if (!shortResult.ok) {
            markBlockError("short");
            onError?.(shortResult.error.message, shortResult.error.code);
            return null;
          }
          applyStepWarnings(shortResult.warnings);
          const next: ModularListingState = {
            ...state,
            shortDescription: {
              variations: [...shortResult.modularData!.variations],
              selectedIndex: 2,
            },
          };
          if (!next.shortDescription.variations.some((v) => v.text.trim())) {
            markBlockError("short");
            onError?.("section_generation_failed", "section_generation_failed");
            return null;
          }
          setState(next);
          applyBillingMeta(shortResult.meta);
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
        const result = await regenerateModularLongBlock(input, blockId, state);
        if (!result.ok) {
          markBlockError(blockId);
          onError?.(result.error.message, result.error.code);
          return null;
        }
        applyStepWarnings(result.warnings);
        const data = result.modularData!;
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
        applyBillingMeta(result.meta);
        return next;
      } finally {
        setBlockLoading(blockId, false);
      }
    },
    [
      applyBillingMeta,
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

  const runModularPipeline = useCallback(async (): Promise<ModularListingState | null> => {
    const input = getBaseInput();
    if (!input) return null;

    setBlockLoading("title", true);
    let titleValue = "";
    try {
      const titleResult = await generateModularTitle(input, resolveLockedKeywords(input));
      if (!titleResult.ok) {
        markBlockError("title");
        onError?.(titleResult.error.message, titleResult.error.code);
        return null;
      }
      applyStepWarnings(titleResult.warnings);
      titleValue = titleResult.modularData!.title;
      if (!titleValue.trim()) {
        markBlockError("title");
        onError?.("section_generation_failed", "section_generation_failed");
        return null;
      }
    } finally {
      setBlockLoading("title", false);
    }

    setBlockLoading("short", true);
    let variations: ModularListingState["shortDescription"]["variations"] | null = null;
    try {
      const shortResult = await generateModularShort(input, titleValue);
      if (!shortResult.ok) {
        markBlockError("short");
        onError?.(shortResult.error.message, shortResult.error.code);
        return null;
      }
      applyStepWarnings(shortResult.warnings);
      variations = [...shortResult.modularData!.variations];
      if (!variations.some((v) => v.text.trim())) {
        markBlockError("short");
        onError?.("section_generation_failed", "section_generation_failed");
        return null;
      }
    } finally {
      setBlockLoading("short", false);
    }

    const finalState: ModularListingState = {
      title: { value: titleValue, locked: true },
      shortDescription: { variations: [...variations], selectedIndex: 2 },
      longDescription: EMPTY_MODULAR_LISTING_STATE.longDescription,
    };
    setState(finalState);
    return finalState;
  }, [applyStepWarnings, getBaseInput, markBlockError, onError, resolveLockedKeywords, setBlockLoading]);

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
      const result = await finalizeModularListing(input, state);
      if (!result.ok) {
        onError?.(result.error.message, result.error.code);
        return null;
      }
      applyStepWarnings(result.warnings);
      onFinalizeSuccess?.(result);
      applyBillingMeta(result.meta);
      return result;
    } finally {
      setBlockLoading("finalize", false);
    }
  }, [applyBillingMeta, applyStepWarnings, getBaseInput, onError, onFinalizeSuccess, setBlockLoading, state]);

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
        );
        if (!result.ok) {
          (["hook", "features", "closing"] as const).forEach(markBlockError);
          onError?.(result.error.message, result.error.code);
          return null;
        }
        applyStepWarnings(result.warnings);
        const data = result.modularData!;
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
        applyBillingMeta(result.meta);
        return nextState;
      } finally {
        setBlockLoading("hook", false);
        setBlockLoading("features", false);
        setBlockLoading("closing", false);
      }
    },
    [
      applyBillingMeta,
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

  const resetModularState = useCallback(() => {
    setState(EMPTY_MODULAR_LISTING_STATE);
    setLoading(INITIAL_LOADING);
    setPreviousBlocks({});
    setBlockErrors({});
    setGenerationWarnings(null);
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
    },
    [],
  );

  const assembledCopy = modularStateToListingCopy(state);

  const isPipelineReady =
    Boolean(state.title.value.trim()) &&
    state.shortDescription.variations.length > 0 &&
    Boolean(state.longDescription.hook.trim());

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
    generateTitle,
    generateShort,
    generateLong,
    applyLongAiTool,
    runModularPipeline,
    regenerateBlock,
    finalizeListing,
    resetModularState,
    selectShortVariation,
    setTitleValue,
    setLongDescriptionValue,
    syncFromOrchestration,
  };
}
