import type { ContextPackageV1 } from "@/lib/listing/context-package.types";
import type { CompiledContext } from "@/lib/listing/context-gateway";
import type { ListingGenerationWarning } from "@/lib/listing/listing-generation-warnings";
import type { ModularListingGenerationStep } from "@/lib/listing/modular-listing.types";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import type { ListingModularGenerateBody } from "@/lib/validation/listing-modular-generate-body";
import type { PartialListingContent } from "@/lib/listing/pipeline-progress.types";

export type ListingGenerationJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  /**
   * Terminal state written by the Dead Letter Queue path.
   * Indicates the job cannot be automatically retried — the SRE must
   * inspect the `listing_dlq` row and trigger a manual replay if desired.
   * Polling clients treat this identically to "failed" (show error UI)
   * but the distinct status lets monitoring dashboards filter DLQ events.
   */
  | "failed_permanently";

export type ListingGenerationPhase =
  | "title"
  | "short"
  | "long"
  | "full";

export const LISTING_GENERATION_JOB_PAYLOAD_VERSION = 1 as const;

export type ListingGenerationJobPayload = {
  version: typeof LISTING_GENERATION_JOB_PAYLOAD_VERSION;
  workspaceId: string;
  userId: string;
  clientIp: string;
  headerWorkspaceId: string | null;
  step: ModularListingGenerationStep;
  body: ListingModularGenerateBody;
  listingInputForGeneration: ListingOptimizerInput;
  gatewayCompiledContext?: CompiledContext;
  pipeline?: "optimized" | "legacy" | "draft";
  contextPackage?: ContextPackageV1 | null;
  preflightWarnings?: ListingGenerationWarning[];
  model: string;
  creditCost: number;
  billsCredits: boolean;
  billsModularPhase: boolean;
  isRegenerate: boolean;
  qualityMeta?: Record<string, string>;
};

export type ListingGenerationJobResult = {
  generationStep: ModularListingGenerationStep;
  modularData?: unknown;
  data?: unknown;
  /** Structured long-description blocks from the instant-draft path.
   *  Present only when generationStep === "full" and isDraft === true. */
  modularDraftLong?: { hook: string; features: string; closing: string };
  warnings?: unknown;
  meta: Record<string, unknown>;
};

export type ListingGenerationJobStatusResponse = {
  ok: true;
  jobId: string;
  workspaceId: string;
  queueHash: string;
  status: ListingGenerationJobStatus | null;
  currentPhase: ListingGenerationPhase | null;
  phases: {
    title: boolean;
    short: boolean;
    long: boolean;
    full: boolean;
  };
  error: string | null;
  result: ListingGenerationJobResult | null;
  draftUpdatedAt: string | null;
  /**
   * Partial text content extracted from workspace_listing_drafts.modular_listing
   * as each pipeline phase writes its result.  Available on every poll even
   * while status = "processing", enabling progressive/streaming UI updates.
   *
   * Fields are null until the corresponding phase completes:
   *   title          → available after title phase  (~15 s)
   *   shortDescription → after short phase           (~30 s)
   *   longDescription  → after long phase             (~60 s)
   */
  partialContent: PartialListingContent;
};
