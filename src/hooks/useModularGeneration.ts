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
  type ModularListingBlockId,
  type ModularListingState,
} from "@/lib/listing/modular-listing.types";
import { modularStateToListingCopy } from "@/lib/listing/assemble-modular-listing";
import { orchestrationToModularState } from "@/lib/listing/orchestration-to-modular-state";
import type { OrchestrationProtocol } from "@/lib/listing/orchestration-protocol.schema";

export type ModularLoadingState = Record<ModularListingBlockId | "finalize", boolean>;

const INITIAL_LOADING: ModularLoadingState = {
  title: false,
  short: false,
  hook: false,
  features: false,
  closing: false,
  finalize: false,
};

export type UseModularGenerationOptions = {
  getBaseInput: () => ModularGenerateBaseInput | null;
  lockedKeywords?: string[];
  onFinalizeSuccess?: (result: GenerateOptimizedListingSuccess) => void;
  onError?: (message: string, code?: string) => void;
};

export function useModularGeneration({
  getBaseInput,
  lockedKeywords = [],
  onFinalizeSuccess,
  onError,
}: UseModularGenerationOptions) {
  const [state, setState] = useState<ModularListingState>(EMPTY_MODULAR_LISTING_STATE);
  const [loading, setLoading] = useState<ModularLoadingState>(INITIAL_LOADING);

  const setBlockLoading = useCallback(
    (block: keyof ModularLoadingState, busy: boolean) => {
      setLoading((prev) => ({ ...prev, [block]: busy }));
    },
    [],
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
    setBlockLoading("title", true);
    try {
      const result = await generateModularTitle(input, resolveLockedKeywords(input));
      if (!result.ok) {
        onError?.(result.error.message, result.error.code);
        return false;
      }
      const data = result.modularData!;
      setState((prev) => ({
        ...prev,
        title: { value: data.title, locked: true },
      }));
      return true;
    } finally {
      setBlockLoading("title", false);
    }
  }, [getBaseInput, onError, resolveLockedKeywords, setBlockLoading]);

  const generateShort = useCallback(async () => {
    const input = getBaseInput();
    if (!input) return false;
    const contextTitle = state.title.value.trim();
    if (!contextTitle) {
      onError?.("Generate a title first.");
      return false;
    }
    setBlockLoading("short", true);
    try {
      const result = await generateModularShort(input, contextTitle);
      if (!result.ok) {
        onError?.(result.error.message, result.error.code);
        return false;
      }
      const data = result.modularData!;
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
  }, [getBaseInput, onError, setBlockLoading, state.title.value]);

  const generateLong = useCallback(async () => {
    const input = getBaseInput();
    if (!input) return false;
    const short =
      state.shortDescription.variations[state.shortDescription.selectedIndex];
    if (!state.title.value.trim() || !short?.trim()) {
      onError?.("Generate title and short description first.");
      return false;
    }
    setBlockLoading("hook", true);
    setBlockLoading("features", true);
    setBlockLoading("closing", true);
    try {
      const result = await generateModularLong(
        input,
        { title: state.title.value, shortDescription: short },
        state,
      );
      if (!result.ok) {
        onError?.(result.error.message, result.error.code);
        return false;
      }
      const data = result.modularData!;
      setState((prev) => ({
        ...prev,
        longDescription: {
          hook: data.hook,
          features: data.features,
          closing: data.closing,
        },
      }));
      return true;
    } finally {
      setBlockLoading("hook", false);
      setBlockLoading("features", false);
      setBlockLoading("closing", false);
    }
  }, [getBaseInput, onError, setBlockLoading, state]);

  const regenerateBlock = useCallback(
    async (blockId: ModularListingBlockId): Promise<ModularListingState | null> => {
      const input = getBaseInput();
      if (!input) return null;

      if (blockId === "title") {
        setBlockLoading("title", true);
        try {
          const titleResult = await generateModularTitle(input, resolveLockedKeywords(input));
          if (!titleResult.ok) {
            onError?.(titleResult.error.message, titleResult.error.code);
            return null;
          }
          const next: ModularListingState = {
            ...state,
            title: {
              value: titleResult.modularData!.title,
              locked: true,
            },
          };
          setState(next);
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
        setBlockLoading("short", true);
        try {
          const shortResult = await generateModularShort(input, contextTitle);
          if (!shortResult.ok) {
            onError?.(shortResult.error.message, shortResult.error.code);
            return null;
          }
          const next: ModularListingState = {
            ...state,
            shortDescription: {
              variations: [...shortResult.modularData!.variations],
              selectedIndex: 2,
            },
          };
          setState(next);
          return next;
        } finally {
          setBlockLoading("short", false);
        }
      }

      const short =
        state.shortDescription.variations[state.shortDescription.selectedIndex];
      if (!state.title.value.trim() || !short?.trim()) {
        onError?.("Title and short description are required context.");
        return null;
      }
      setBlockLoading(blockId, true);
      try {
        const result = await regenerateModularLongBlock(input, blockId, state);
        if (!result.ok) {
          onError?.(result.error.message, result.error.code);
          return null;
        }
        const data = result.modularData!;
        const next: ModularListingState = {
          ...state,
          longDescription: {
            hook: data.hook || state.longDescription.hook,
            features: data.features || state.longDescription.features,
            closing: data.closing || state.longDescription.closing,
          },
        };
        setState(next);
        return next;
      } finally {
        setBlockLoading(blockId, false);
      }
    },
    [getBaseInput, onError, resolveLockedKeywords, setBlockLoading, state],
  );

  const runModularPipeline = useCallback(async (): Promise<ModularListingState | null> => {
    const input = getBaseInput();
    if (!input) return null;

    setBlockLoading("title", true);
    let titleValue = "";
    try {
      const titleResult = await generateModularTitle(input, resolveLockedKeywords(input));
      if (!titleResult.ok) {
        onError?.(titleResult.error.message, titleResult.error.code);
        return null;
      }
      titleValue = titleResult.modularData!.title;
    } finally {
      setBlockLoading("title", false);
    }

    setBlockLoading("short", true);
    let variations: [string, string, string] | null = null;
    try {
      const shortResult = await generateModularShort(input, titleValue);
      if (!shortResult.ok) {
        onError?.(shortResult.error.message, shortResult.error.code);
        return null;
      }
      variations = shortResult.modularData!.variations;
    } finally {
      setBlockLoading("short", false);
    }

    const selectedShort = variations[2];
    setBlockLoading("hook", true);
    setBlockLoading("features", true);
    setBlockLoading("closing", true);
    let longBlocks: ModularListingState["longDescription"] | null = null;
    try {
      const draftState: ModularListingState = {
        title: { value: titleValue, locked: true },
        shortDescription: { variations: [...variations], selectedIndex: 2 },
        longDescription: EMPTY_MODULAR_LISTING_STATE.longDescription,
      };
      const longResult = await generateModularLong(
        input,
        { title: titleValue, shortDescription: selectedShort },
        draftState,
      );
      if (!longResult.ok) {
        onError?.(longResult.error.message, longResult.error.code);
        return null;
      }
      longBlocks = longResult.modularData!;
    } finally {
      setBlockLoading("hook", false);
      setBlockLoading("features", false);
      setBlockLoading("closing", false);
    }

    const finalState: ModularListingState = {
      title: { value: titleValue, locked: true },
      shortDescription: { variations: [...variations], selectedIndex: 2 },
      longDescription: longBlocks,
    };
    setState(finalState);
    return finalState;
  }, [getBaseInput, onError, resolveLockedKeywords, setBlockLoading]);

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
      onFinalizeSuccess?.(result);
      return result;
    } finally {
      setBlockLoading("finalize", false);
    }
  }, [getBaseInput, onError, onFinalizeSuccess, setBlockLoading, state]);

  const resetModularState = useCallback(() => {
    setState(EMPTY_MODULAR_LISTING_STATE);
    setLoading(INITIAL_LOADING);
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
    assembledCopy,
    isPipelineReady,
    generateTitle,
    generateShort,
    generateLong,
    runModularPipeline,
    regenerateBlock,
    finalizeListing,
    resetModularState,
    selectShortVariation,
    setTitleValue,
    syncFromOrchestration,
  };
}
