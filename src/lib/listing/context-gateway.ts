import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import { mergeTrackedKeywordSignals } from "@/lib/listing/merge-request-keyword-signals";
import { syncQueueHash } from "@/lib/listing/sync-queue-hash";
import type { ListingOptimizerInput, TrackedKeywordSignalInput } from "@/lib/types/listing";
import type { ActiveContextSynthesisSignal } from "@/lib/optimization-queue/build-active-context-synthesis";

export const KEYWORD_CONTEXT_REQUIRED_MESSAGE =
  "ASO optimization requires staged keyword signals. Please add keywords to your Tracker first.";

export class KeywordContextRequiredError extends Error {
  readonly code = "KEYWORD_CONTEXT_REQUIRED" as const;

  constructor(message = KEYWORD_CONTEXT_REQUIRED_MESSAGE) {
    super(message);
    this.name = "KeywordContextRequiredError";
  }
}

export class ContextGatewayError extends Error {
  readonly code = "context_gateway_error" as const;

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ContextGatewayError";
  }
}

const contextSignalSchema = z.object({
  type: z.enum(["keyword", "market", "review"]),
  id: z.string().min(1),
  label: z.string().min(1),
  locale: z.enum(["en", "ar"]),
  metadata: z.record(z.unknown()).optional(),
});

const workspaceKeywordRowSchema = z.object({
  id: z.string().uuid(),
  keyword: z.string().min(1),
  locale: z.enum(["en", "ar"]),
  is_staged: z.boolean(),
  confidence: z.number().optional(),
  difficulty: z.number().nullable().optional(),
  search_volume: z.number().nullable().optional(),
  queue_hash: z.string().nullable().optional(),
});

const marketSnapshotRowSchema = z.object({
  id: z.string().uuid(),
  keyword: z.string().min(1),
  locale: z.enum(["en", "ar"]),
  rank: z.number().nullable().optional(),
  search_volume: z.number().nullable().optional(),
  country_code: z.string().nullable().optional(),
  snapshot_at: z.string(),
});

const reviewRowSchema = z.object({
  id: z.string().uuid(),
  review_id: z.string().min(1),
  review_text: z.string().min(1),
  score: z.number(),
  sentiment_tag: z.string().min(1),
  ai_tags: z.array(z.string()),
  is_utilized: z.boolean(),
});

export const compiledContextSchema = z.object({
  workspaceId: z.string().uuid(),
  appId: z.string().uuid().nullable(),
  queueHash: z.string().regex(/^[a-f0-9]{64}$/),
  vaultLocale: z.enum(["en", "ar"]),
  signals: z.array(contextSignalSchema),
  keywords: z.array(workspaceKeywordRowSchema),
  marketSnapshots: z.array(marketSnapshotRowSchema),
  reviews: z.array(reviewRowSchema),
});

export type CompiledContext = z.infer<typeof compiledContextSchema>;

export type CompileContextParams = {
  workspaceId: string;
  appId?: string | null;
  queueHash: string;
  vaultLocale?: OptimizationQueueLocale;
  /** Lazy scope — defaults to full signal load. */
  step?: string;
};

export type ContextGatewayStepScope = "keywords" | "keywords_competitors";

const STEP_SCOPED_TOP_KEYWORDS = 5;
const STEP_SCOPED_TOP_COMPETITORS = 2;

export function contextScopeForGenerationStep(step: string): ContextGatewayStepScope {
  if (step === "title" || step === "short") return "keywords";
  return "keywords_competitors";
}

function keywordRankScore(row: {
  confidence?: number;
  search_volume?: number | null;
}): number {
  const volume = typeof row.search_volume === "number" ? row.search_volume : 0;
  const confidence = typeof row.confidence === "number" ? row.confidence : 0;
  return volume * 1_000 + confidence;
}

function limitTopKeywords<T extends { confidence?: number; search_volume?: number | null }>(
  rows: T[],
  limit = STEP_SCOPED_TOP_KEYWORDS,
): T[] {
  return [...rows]
    .sort((a, b) => keywordRankScore(b) - keywordRankScore(a))
    .slice(0, limit);
}

function limitTopCompetitorSnapshots<
  T extends { rank?: number | null; search_volume?: number | null },
>(rows: T[], limit = STEP_SCOPED_TOP_COMPETITORS): T[] {
  return [...rows]
    .sort((a, b) => {
      const rankA = typeof a.rank === "number" ? a.rank : 999;
      const rankB = typeof b.rank === "number" ? b.rank : 999;
      if (rankA !== rankB) return rankA - rankB;
      const volA = typeof a.search_volume === "number" ? a.search_volume : 0;
      const volB = typeof b.search_volume === "number" ? b.search_volume : 0;
      return volB - volA;
    })
    .slice(0, limit);
}

function normalizeLocale(raw: string | null | undefined): "en" | "ar" {
  return raw?.toLowerCase() === "ar" ? "ar" : "en";
}

function applyAppScope<T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(
  query: T,
  appId?: string | null,
): T {
  if (!appId) return query;
  return query.or(`app_id.eq.${appId},app_id.is.null`) as T;
}

function applyQueueHashScope<T extends { or: (filter: string) => T }>(
  query: T,
  queueHash: string,
): T {
  return query.or(`queue_hash.eq.${queueHash},queue_hash.is.null`);
}

export async function compileContextForStep(
  supabase: SupabaseClient,
  params: CompileContextParams,
): Promise<CompiledContext> {
  const vaultLocale = params.vaultLocale ?? "en";
  const queueHash = params.queueHash.trim();
  const scope = contextScopeForGenerationStep(params.step ?? "full");

  let keywordsQuery = supabase
    .from("workspace_keywords")
    .select(
      "id, keyword, locale, is_staged, confidence, difficulty, search_volume, queue_hash",
    )
    .eq("workspace_id", params.workspaceId)
    .eq("is_staged", true)
    .eq("locale", vaultLocale);

  keywordsQuery = applyAppScope(keywordsQuery, params.appId);
  keywordsQuery = applyQueueHashScope(keywordsQuery, queueHash);

  const keywordsRes = await keywordsQuery;
  if (keywordsRes.error) {
    throw new ContextGatewayError(
      `Failed to load staged keywords: ${keywordsRes.error.message}`,
      keywordsRes.error,
    );
  }

  let marketSnapshots: CompiledContext["marketSnapshots"] = [];
  const reviews: CompiledContext["reviews"] = [];

  if (scope === "keywords_competitors") {
    let marketQuery = supabase
      .from("workspace_market_snapshots")
      .select(
        "id, keyword, locale, rank, search_volume, country_code, snapshot_at, queue_hash",
      )
      .eq("workspace_id", params.workspaceId)
      .eq("locale", vaultLocale);

    marketQuery = applyAppScope(marketQuery, params.appId);
    marketQuery = applyQueueHashScope(marketQuery, queueHash);

    const marketRes = await marketQuery;
    if (marketRes.error) {
      throw new ContextGatewayError(
        `Failed to load market snapshots: ${marketRes.error.message}`,
        marketRes.error,
      );
    }

    marketSnapshots = limitTopCompetitorSnapshots(
      (marketRes.data ?? []).map((row) => ({
        id: row.id as string,
        keyword: String(row.keyword ?? "").trim(),
        locale: normalizeLocale(row.locale as string),
        rank: typeof row.rank === "number" ? row.rank : null,
        search_volume:
          typeof row.search_volume === "number" ? row.search_volume : null,
        country_code: (row.country_code as string | null) ?? null,
        snapshot_at: String(row.snapshot_at ?? new Date().toISOString()),
      })),
    );
  }

  const keywords = limitTopKeywords(
    (keywordsRes.data ?? []).map((row) => ({
      id: row.id as string,
      keyword: String(row.keyword ?? "").trim(),
      locale: normalizeLocale(row.locale as string),
      is_staged: Boolean(row.is_staged),
      confidence:
        typeof row.confidence === "number" ? row.confidence : undefined,
      difficulty:
        typeof row.difficulty === "number" ? row.difficulty : null,
      search_volume:
        typeof row.search_volume === "number" ? row.search_volume : null,
      queue_hash: (row.queue_hash as string | null) ?? null,
    })),
  );

  if (keywords.length === 0) {
    throw new KeywordContextRequiredError();
  }

  const signals: CompiledContext["signals"] = [
    ...keywords.map((row) => ({
      type: "keyword" as const,
      id: row.id,
      label: row.keyword,
      locale: row.locale,
      metadata: {
        confidence: row.confidence,
        difficulty: row.difficulty,
        search_volume: row.search_volume,
        queue_hash: row.queue_hash,
      },
    })),
    ...marketSnapshots.map((row) => ({
      type: "market" as const,
      id: row.id,
      label: row.keyword,
      locale: row.locale,
      metadata: {
        rank: row.rank,
        search_volume: row.search_volume,
        country_code: row.country_code,
        snapshot_at: row.snapshot_at,
      },
    })),
  ];

  const draft: CompiledContext = {
    workspaceId: params.workspaceId,
    appId: params.appId ?? null,
    queueHash,
    vaultLocale,
    signals,
    keywords,
    marketSnapshots,
    reviews,
  };

  const parsed = compiledContextSchema.safeParse(draft);
  if (!parsed.success) {
    throw new ContextGatewayError(
      "Compiled context failed validation",
      parsed.error.flatten(),
    );
  }

  return parsed.data;
}

export function trackedKeywordSignalsFromCompiledContext(
  context: CompiledContext,
): TrackedKeywordSignalInput[] {
  return context.keywords.map((row) => ({
    keyword: row.keyword,
    confidence: typeof row.confidence === "number" ? row.confidence : 72,
    ...(typeof row.difficulty === "number" ? { difficulty: row.difficulty } : {}),
    ...(typeof row.search_volume === "number"
      ? { searchVolume: row.search_volume }
      : {}),
  }));
}

export function applyGatewayKeywordsToListingInput<
  T extends Pick<ListingOptimizerInput, "targetKeywords" | "trackedKeywordSignals" | "activeContext">,
>(input: T, context: CompiledContext | null | undefined): T {
  return applyCompiledContextToListingInput(input, context);
}

function marketSnapshotsToCompetitorSignals(
  snapshots: CompiledContext["marketSnapshots"],
): ActiveContextSynthesisSignal[] {
  return snapshots.map((row) => ({
    id: row.id,
    label: row.keyword,
    type: "market",
    signalCluster: "market" as const,
    impactPercent:
      typeof row.rank === "number"
        ? Math.max(5, Math.min(99, 100 - row.rank))
        : undefined,
  }));
}

export function applyCompiledContextToListingInput<
  T extends Pick<ListingOptimizerInput, "targetKeywords" | "trackedKeywordSignals" | "activeContext">,
>(input: T, context: CompiledContext | null | undefined): T {
  if (!context) return input;
  const trackedKeywordSignals = mergeTrackedKeywordSignals({
    vault: trackedKeywordSignalsFromCompiledContext(context),
    body: input.trackedKeywordSignals,
    targetKeywords: input.targetKeywords,
  });

  const competitorSignals = marketSnapshotsToCompetitorSignals(context.marketSnapshots);
  const activeContext =
    competitorSignals.length > 0
      ? {
          offensive: input.activeContext?.offensive ?? [],
          defensive: input.activeContext?.defensive ?? [],
          market: [
            ...(input.activeContext?.market ?? []),
            ...competitorSignals,
          ].slice(0, STEP_SCOPED_TOP_COMPETITORS),
        }
      : input.activeContext;

  return {
    ...input,
    trackedKeywordSignals,
    ...(activeContext ? { activeContext } : {}),
  };
}

/**
 * Atomically stamp staged keywords for the active queue hash, then compile Context Gateway signals.
 */
export async function stampAndCompileListingContext(
  supabase: SupabaseClient,
  params: CompileContextParams & { appId?: string | null },
): Promise<CompiledContext> {
  const queueHash = params.queueHash.trim();
  const appId = params.appId?.trim();

  if (appId) {
    console.log("[DEBUG] DB: stampAndCompileListingContext — before syncQueueHash", {
      workspaceId: params.workspaceId,
      appId,
      vaultLocale: params.vaultLocale ?? null,
    });
    const stampStart = Date.now();
    await syncQueueHash({
      workspaceId: params.workspaceId,
      appId,
      activeQueueHash: queueHash,
      vaultLocale: params.vaultLocale,
    });
    console.log("[DEBUG] DB: stampAndCompileListingContext — after syncQueueHash", {
      elapsedMs: Date.now() - stampStart,
    });
    console.log("[Context Audit] Stamped keywords to queueHash:", queueHash);
  }

  console.log("[DEBUG] DB: stampAndCompileListingContext — before compileContextForStep", {
    workspaceId: params.workspaceId,
    step: params.step ?? "full",
    vaultLocale: params.vaultLocale ?? "en",
  });
  const compileStart = Date.now();
  const context = await compileContextForStep(supabase, params);
  console.log("[DEBUG] DB: stampAndCompileListingContext — after compileContextForStep", {
    elapsedMs: Date.now() - compileStart,
    signalCount: context.signals.length,
  });
  console.log("[Context Audit] Signals found:", context.signals.length);
  return context;
}

export async function compileContext(
  supabase: SupabaseClient,
  params: CompileContextParams,
): Promise<CompiledContext> {
  return compileContextForStep(supabase, { ...params, step: "full" });
}
