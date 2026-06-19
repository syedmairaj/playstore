import type { OptimizationQueueSynthesisPayload } from "@/lib/optimization-queue";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import { logClientContextAudit } from "@/lib/client/context-audit-log-client";
import {
  sanitizeActiveContextForGenerate,
  sanitizeTrackedKeywordSignalsForGenerate,
} from "@/lib/listing/sanitize-listing-generate-payload";
import type {
  ModularListingGenerationStep,
  ModularListingState,
  ModularLongStepData,
  ModularShortStepData,
  ModularTitleStepData,
} from "@/lib/listing/modular-listing.types";
import { shortVariationText } from "@/lib/listing/modular-short-variations";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import type { GenerateOptimizedListingSuccess } from "@/lib/listing/generate-optimized-listing";

export type ModularGenerateBaseInput = {
  workspaceId: string;
  appId?: string;
  appName: string;
  category: string;
  targetKeywords: string;
  appFeatures: string;
  toneStyle: string;
  targetArabic: boolean;
  userInstruction?: string;
  queueSynthesis: OptimizationQueueSynthesisPayload;
  queueItemCount?: number;
  vaultLocale: OptimizationQueueLocale;
  queueHash: string;
};

type ModularApiError = {
  ok: false;
  status: number;
  error: {
    code?: string;
    message: string;
    details?: unknown;
    fieldErrors?: Record<string, string[]>;
    remaining?: number;
    required?: number;
  };
};

export type ModularStepSuccess<TStep extends ModularListingGenerationStep, TData> = {
  ok: true;
  generationStep: TStep;
  modularData?: TData;
  data?: ListingGenerationOutput;
  meta?: {
    model?: string;
    promptVersion?: string;
    creditsCharged?: number;
    persisted?: boolean;
    generationId?: string;
    savedAt?: string;
    asoScorePartial?: boolean;
    quality_status?: string;
    quality_warning?: string;
    trialRegenerationsUsed?: number;
    trialRegenerationsRemaining?: number;
    creditsRemaining?: number;
  };
};

function parseKeywordList(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function resolveLockedKeywordsForBody(
  input: ModularGenerateBaseInput,
  extras?: { lockedKeywords?: string[] },
): string[] {
  if (extras?.lockedKeywords && extras.lockedKeywords.length > 0) {
    return extras.lockedKeywords;
  }
  return parseKeywordList(input.targetKeywords);
}

function longDescriptionHasContent(long: ModularListingState["longDescription"]): boolean {
  return Boolean(
    long.hook.trim() || long.features.trim() || long.closing.trim(),
  );
}

/** Omit empty draft long blocks from API payload — context fields carry title/short. */
function modularListingForRequest(
  state: ModularListingState | undefined,
  step: ModularListingGenerationStep,
): ModularListingState | undefined {
  if (!state) return undefined;

  if (step === "finalize") {
    return state;
  }

  if (step === "long" && !longDescriptionHasContent(state.longDescription)) {
    return undefined;
  }

  return state;
}

function buildModularRequestBody(
  input: ModularGenerateBaseInput,
  step: ModularListingGenerationStep,
  extras?: {
    lockedKeywords?: string[];
    contextTitle?: string;
    contextShortDescription?: string;
    modularListing?: ModularListingState;
    userInstruction?: string;
    isRegenerate?: boolean;
  },
) {
  const { queueSynthesis } = input;
  const activeContext = sanitizeActiveContextForGenerate(queueSynthesis.activeContext);
  const trackedKeywordSignals = sanitizeTrackedKeywordSignalsForGenerate(
    queueSynthesis.trackedKeywordSignals,
  );

  logClientContextAudit({
    workspaceId: input.workspaceId,
    appId: input.appId,
    queueItemCount: input.queueItemCount ?? 0,
    queueHash: input.queueHash,
    vaultLocale: input.vaultLocale,
    synthesis: { ...queueSynthesis, activeContext, trackedKeywordSignals },
    note: `modular step: ${step}`,
  });

  const instruction = extras?.userInstruction?.trim() || input.userInstruction?.trim();
  const modularListing = extras?.modularListing
    ? modularListingForRequest(extras.modularListing, step)
    : undefined;

  return {
    workspaceId: input.workspaceId,
    ...(input.appId ? { appId: input.appId } : {}),
    appName: input.appName,
    category: input.category,
    targetKeywords: input.targetKeywords,
    appFeatures: input.appFeatures,
    toneStyle: input.toneStyle,
    targetArabic: input.targetArabic,
    vaultLocale: input.vaultLocale,
    queueHash: input.queueHash,
    clientQueueItemCount: input.queueItemCount ?? 0,
    generationStep: step,
    isRegenerate: extras?.isRegenerate ?? false,
    ...(instruction ? { userInstruction: instruction } : {}),
    activeContext,
    ...(trackedKeywordSignals.length > 0 ? { trackedKeywordSignals } : {}),
    strategyMode: queueSynthesis.strategyMode,
    ...(queueSynthesis.topStagedIssues.length > 0
      ? { topStagedIssues: queueSynthesis.topStagedIssues }
      : {}),
    activeSignalTypes: queueSynthesis.activeSignalTypes,
    /** Always send an array — never omit (Zod expects [] not undefined). */
    lockedKeywords: resolveLockedKeywordsForBody(input, extras),
    ...(extras?.contextTitle ? { contextTitle: extras.contextTitle } : {}),
    ...(extras?.contextShortDescription
      ? { contextShortDescription: extras.contextShortDescription }
      : {}),
    ...(modularListing ? { modularListing } : {}),
  };
}

async function postModularStep<TStep extends ModularListingGenerationStep, TData>(
  input: ModularGenerateBaseInput,
  step: TStep,
  extras?: Parameters<typeof buildModularRequestBody>[2],
): Promise<ModularStepSuccess<TStep, TData> | ModularApiError> {
  const res = await fetch("/api/listings/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(buildModularRequestBody(input, step, extras)),
  });

  const json = (await res.json()) as
    | ModularStepSuccess<TStep, TData>
    | { ok: false; error: ModularApiError["error"] };

  if (!res.ok || !("ok" in json) || json.ok === false) {
    return {
      ok: false,
      status: res.status,
      error:
        "ok" in json && json.ok === false
          ? json.error
          : { message: "Modular generation failed." },
    };
  }

  return json;
}

export async function generateModularTitle(
  input: ModularGenerateBaseInput,
  lockedKeywords: string[],
  options?: { isRegenerate?: boolean },
) {
  return postModularStep<"title", ModularTitleStepData>(input, "title", {
    lockedKeywords: lockedKeywords.length > 0 ? lockedKeywords : [],
    isRegenerate: options?.isRegenerate ?? false,
  });
}

export async function generateModularShort(
  input: ModularGenerateBaseInput,
  contextTitle: string,
  options?: { isRegenerate?: boolean },
) {
  return postModularStep<"short", ModularShortStepData>(input, "short", {
    contextTitle,
    isRegenerate: options?.isRegenerate ?? false,
  });
}

export async function generateModularLong(
  input: ModularGenerateBaseInput,
  context: { title: string; shortDescription: string },
  modularListing?: ModularListingState,
) {
  return postModularStep<"long", ModularLongStepData>(input, "long", {
    contextTitle: context.title,
    contextShortDescription: context.shortDescription,
    modularListing,
  });
}

export async function regenerateModularLongBlock(
  input: ModularGenerateBaseInput,
  block: "hook" | "features" | "closing",
  modularListing: ModularListingState,
) {
  const shortRow =
    modularListing.shortDescription.variations[
      modularListing.shortDescription.selectedIndex
    ];
  const short = shortRow ? shortVariationText(shortRow) : "";
  return postModularStep<typeof block, ModularLongStepData>(input, block, {
    contextTitle: modularListing.title.value,
    contextShortDescription: short,
    modularListing,
    isRegenerate: true,
  });
}

export async function finalizeModularListing(
  input: ModularGenerateBaseInput,
  modularListing: ModularListingState,
): Promise<GenerateOptimizedListingSuccess | ModularApiError> {
  const res = await fetch("/api/listings/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(
      buildModularRequestBody(input, "finalize", { modularListing }),
    ),
  });

  const json = (await res.json()) as GenerateOptimizedListingSuccess | {
    ok: false;
    error: ModularApiError["error"];
  };

  if (!res.ok || !json.ok) {
    return {
      ok: false,
      status: res.status,
      error: json.ok === false ? json.error : { message: "Finalize failed." },
    };
  }

  return json;
}

/** @deprecated Use modular steps; kept for regenerate-all tone variants. */
export async function generateFullListingMonolithic(
  input: ModularGenerateBaseInput,
) {
  return postModularStep<"full", ListingGenerationOutput>(input, "full");
}
