import type { OptimizationQueueLocale } from "@/lib/optimization-queue";
import { fetchWithRetry } from "@/lib/client/fetch-with-retry";
import { getSupabaseAuthHeaders } from "@/lib/client/supabase-auth-fetch-headers";
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

type DraftListingFields = ListingGenerationOutput & { longDescription?: string };

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

export async function generateInstantDraftListing(
  input: InstantDraftListingInput,
): Promise<InstantDraftListingSuccess | InstantDraftListingError> {
  const workspaceId = input.workspaceId.trim();
  const authHeaders = await getSupabaseAuthHeaders();
  const res = await fetchWithRetry("/api/listings/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Workspace-Id": workspaceId,
      ...authHeaders,
    },
    credentials: "include",
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

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {
      ok: false,
      status: res.status || 502,
      error: {
        code: "invalid_response",
        message: "Instant draft returned a non-JSON response.",
      },
    };
  }

  const body = json as
    | {
        ok: true;
        accepted?: boolean;
        data?: DraftListingFields;
        modularData?: DraftListingFields;
        modularDraftLong?: InstantDraftModularLong;
        modularDraftShort?: InstantDraftModularShort;
        warnings?: ListingGenerationWarningsPayload;
      }
    | { ok: false; error: { code?: string; message: string } };

  if (!res.ok || !("ok" in body) || body.ok !== true) {
    return {
      ok: false,
      status: res.status,
      error:
        "ok" in body && body.ok === false
          ? body.error
          : { message: "Instant draft failed." },
    };
  }

  // Async accept is not a draft listing — surface clearly instead of blank UI.
  if (body.accepted === true) {
    return {
      ok: false,
      status: res.status || 202,
      error: {
        code: "generation_accepted_async",
        message:
          "Draft was queued asynchronously. Wait for generation to finish, then refresh.",
      },
    };
  }

  const raw = body.data ?? body.modularData;
  const title = typeof raw?.title === "string" ? raw.title.trim() : "";
  const shortDescription =
    typeof raw?.shortDescription === "string" ? raw.shortDescription.trim() : "";
  const fullDescription =
    typeof raw?.fullDescription === "string"
      ? raw.fullDescription.trim()
      : typeof raw?.longDescription === "string"
        ? raw.longDescription.trim()
        : "";

  if (!title || !shortDescription || !fullDescription) {
    return {
      ok: false,
      status: res.status || 502,
      error: {
        code: "invalid_response",
        message: "Instant draft returned an incomplete listing.",
      },
    };
  }

  const data: ListingGenerationOutput = {
    ...(raw as ListingGenerationOutput),
    title,
    shortDescription,
    fullDescription,
    keywordSuggestions: asStringList(raw?.keywordSuggestions),
    ctaSuggestions: asStringList(raw?.ctaSuggestions),
  };

  return {
    ok: true,
    data,
    modularDraftLong: body.modularDraftLong,
    modularDraftShort: body.modularDraftShort,
    warnings: body.warnings,
    meta: { isDraft: true, creditsCharged: 0 },
  };
}
