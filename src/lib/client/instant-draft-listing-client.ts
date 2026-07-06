import type { OptimizationQueueLocale } from "@/lib/optimization-queue";
import { fetchWithRetry } from "@/lib/client/fetch-with-retry";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import type { ListingGenerationWarningsPayload } from "@/lib/listing/listing-generation-warnings";

export type InstantDraftListingInput = {
  workspaceId: string;
  appId?: string;
  appName: string;
  category: string;
  targetKeywords: string;
  appFeatures: string;
  toneStyle: string;
  targetArabic: boolean;
  vaultLocale: OptimizationQueueLocale;
  queueHash: string;
  queueItemCount?: number;
};

export type InstantDraftModularLong = {
  hook: string;
  features: string;
  closing: string;
};

export type InstantDraftModularShort = {
  variations: Array<{ type: "growth" | "conversion" | "utility"; text: string }>;
};

export type InstantDraftListingSuccess = {
  ok: true;
  data: ListingGenerationOutput;
  /** Structured hook/features/closing blocks for pre-populating the modular panel
   *  block editors immediately after the instant draft loads — no need to wait for
   *  the full async pipeline to see editable content in the long description. */
  modularDraftLong?: InstantDraftModularLong;
  /** Three distinct Phase 2 preview strategies (growth / conversion / utility). */
  modularDraftShort?: InstantDraftModularShort;
  warnings?: ListingGenerationWarningsPayload;
  meta?: { isDraft: true; creditsCharged: 0 };
};

export type InstantDraftListingError = {
  ok: false;
  status: number;
  error: { code?: string; message: string };
};

export async function generateInstantDraftListing(
  input: InstantDraftListingInput,
): Promise<InstantDraftListingSuccess | InstantDraftListingError> {
  const workspaceId = input.workspaceId.trim();
  const res = await fetchWithRetry("/api/listings/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Workspace-Id": workspaceId,
    },
    credentials: "same-origin",
    body: JSON.stringify({
      ...input,
      targetKeywords: input.targetKeywords
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      generationStep: "full",
      isDraft: true,
      includeOptimizerContext: false,
    }),
  });

  const json = (await res.json()) as
    | {
        ok: true;
        data?: ListingGenerationOutput;
        modularData?: ListingGenerationOutput;
        modularDraftLong?: InstantDraftModularLong;
        modularDraftShort?: InstantDraftModularShort;
        warnings?: ListingGenerationWarningsPayload;
      }
    | { ok: false; error: { code?: string; message: string } };

  if (!res.ok || !("ok" in json) || json.ok !== true) {
    return {
      ok: false,
      status: res.status,
      error: "ok" in json && json.ok === false ? json.error : { message: "Instant draft failed." },
    };
  }

  const data = json.data ?? json.modularData;
  if (
    !data ||
    typeof data.title !== "string" ||
    typeof data.shortDescription !== "string" ||
    typeof data.fullDescription !== "string"
  ) {
    return {
      ok: false,
      status: res.status || 502,
      error: {
        code: "invalid_response",
        message: "Instant draft returned an incomplete listing.",
      },
    };
  }

  return {
    ok: true,
    data,
    modularDraftLong: json.modularDraftLong,
    modularDraftShort: json.modularDraftShort,
    warnings: json.warnings,
    meta: { isDraft: true, creditsCharged: 0 },
  };
}
