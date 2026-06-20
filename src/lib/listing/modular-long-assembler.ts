import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildFallbackLongCopy,
  safeAssemble,
  type SafeAssembleResult,
} from "@/lib/listing/listing-assembler";
import {
  longDescriptionSchema,
  type ModularLongStepData,
} from "@/lib/listing/modular-listing.types";
import { runGranularModularLongGeneration } from "@/lib/listing/modular-long-granular-generation";
import {
  assembledLongCharCount,
  MODULAR_LONG_ACCEPT_MIN_CHARS,
  type ModularLongLengthAssessment,
} from "@/lib/listing/modular-output-validation";
import { readVaultCachedModularLong } from "@/lib/staging-vault/read-cached-listing-long";
import type { ListingOptimizerInput } from "@/lib/types/listing";

export {
  ASO_BOILERPLATE_FOOTER_AR,
  ASO_BOILERPLATE_FOOTER_EN,
  safeAssemble,
  type SafeAssembleResult,
} from "@/lib/listing/listing-assembler";

/** Total assembler budget — expansion skipped after this to avoid 500 timeouts. */
export const MODULAR_LONG_ASSEMBLER_BUDGET_MS = 8_000;

export class ModularLongGenerationTimeoutError extends Error {
  readonly code = "generation_timeout";

  constructor() {
    super("Modular long generation exceeded time limit");
    this.name = "ModularLongGenerationTimeoutError";
  }
}

function withGenerationTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ModularLongGenerationTimeoutError());
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type ModularLongAssemblerParams = {
  supabase: SupabaseClient;
  workspaceId: string;
  appId?: string;
  input: ListingOptimizerInput;
  context: { title: string; shortDescription: string };
  lockedKeywords: string[];
  inlineFallback?: Partial<ModularLongStepData>;
};

export type ModularLongAssemblerResult = {
  data: ModularLongStepData;
  source: "generated" | "vault_cache" | "fallback";
  timedOut?: boolean;
  expansionSkipped?: boolean;
  lengthAssessment: ModularLongLengthAssessment;
  assembleWarnings: string[];
};

export function isModularLongBillingReady(data: ModularLongStepData): boolean {
  const parsed = longDescriptionSchema.safeParse(data);
  if (!parsed.success) return false;
  return assembledLongCharCount(parsed.data) > MODULAR_LONG_ACCEPT_MIN_CHARS;
}

function applySafeAssemble(
  raw: Partial<ModularLongStepData>,
  targetArabic: boolean,
): SafeAssembleResult {
  return safeAssemble(raw, { targetArabic });
}

/**
 * ASO Industry Standard pipeline: generate → safeAssemble (never 500 on length).
 */
export async function runModularLongAssembler(
  params: ModularLongAssemblerParams,
): Promise<ModularLongAssemblerResult> {
  const targetArabic = params.input.targetArabic ?? false;
  const startedAt = Date.now();
  const budgetMs = MODULAR_LONG_ASSEMBLER_BUDGET_MS;
  const remainingMs = () => Math.max(0, budgetMs - (Date.now() - startedAt));

  let raw: Partial<ModularLongStepData> | undefined;
  let source: ModularLongAssemblerResult["source"] = "generated";
  let timedOut = false;
  let expansionSkipped = false;
  const assembleWarnings: string[] = [];

  try {
    raw = await withGenerationTimeout(
      runGranularModularLongGeneration(
        params.input,
        params.context,
        params.lockedKeywords,
      ),
      remainingMs() || budgetMs,
    );
  } catch (error) {
    if (error instanceof ModularLongGenerationTimeoutError) {
      timedOut = true;
      assembleWarnings.push("Generation exceeded 8s budget.");
      raw = await readVaultCachedModularLong(params.supabase, {
        workspaceId: params.workspaceId,
        appId: params.appId,
        inlineFallback: params.inlineFallback,
      });
      if (raw) {
        source = "vault_cache";
      }
    } else {
      console.warn("[listing-modular/assembler] generation error — using safe fallback", error);
      assembleWarnings.push("AI generation failed — using safe fallback copy.");
    }
  }

  if (!raw) {
    raw =
      params.inlineFallback ??
      buildFallbackLongCopy({
        appName: params.input.appName,
        appFeatures: params.input.appFeatures,
        shortDescription: params.context.shortDescription,
        targetArabic,
      });
    source = "fallback";
  }

  if (remainingMs() <= 0) {
    expansionSkipped = true;
    assembleWarnings.push("Skipped post-processing to stay within 8s budget.");
  }

  const assembled = applySafeAssemble(raw, targetArabic);
  assembleWarnings.push(...assembled.warnings);

  return {
    data: assembled.data,
    source,
    lengthAssessment: assembled.lengthAssessment,
    assembleWarnings,
    ...(timedOut ? { timedOut: true } : {}),
    ...(expansionSkipped ? { expansionSkipped: true } : {}),
  };
}

export function longLengthWarningMessage(assessment: ModularLongLengthAssessment): string {
  return assessment.message;
}
