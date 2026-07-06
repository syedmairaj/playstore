import "server-only";

import { activeContextHasSignals } from "@/lib/optimization-queue/build-active-context-synthesis";
import type { QueueHashValidationResult } from "@/lib/optimization-queue/validate-active-context-queue-hash";
import type {
  ModularLongStepData,
  ModularShortStepData,
  ModularTitleStepData,
} from "@/lib/listing/modular-listing.types";
import { SHORT_VARIATION_TYPES } from "@/lib/listing/modular-short-variations";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import type { ListingModularGenerateBody } from "@/lib/validation/listing-modular-generate-body";
import {
  buildWarningsPayload,
  dedupeWarnings,
  type ListingGenerationWarning,
  type ListingGenerationWarningsPayload,
} from "@/lib/listing/listing-generation-warnings";
import { normalizeShortVariationText } from "@/lib/listing/modular-output-validation";

function categorySeedTerms(category: string, appName: string): string[] {
  const cat = category.trim().toLowerCase();
  const appTokens = appName
    .split(/[\s\-:]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 2);
  const base = cat
    .split(/[\s&/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 3);
  return [...new Set([...appTokens, ...base, `${cat} app`, "best app"])].slice(0, 8);
}

export function assessListingInputWarnings(
  body: ListingModularGenerateBody,
  queueValidation: QueueHashValidationResult,
): ListingGenerationWarning[] {
  const warnings: ListingGenerationWarning[] = [];
  const keywordCount = body.targetKeywords.length;
  const requestKeywordCount = Math.max(
    keywordCount,
    body.trackedKeywordSignals?.length ?? 0,
  );
  const queueItems = Math.max(
    body.clientQueueItemCount ?? queueValidation.itemCount ?? 0,
    requestKeywordCount,
  );
  const hasActiveContext =
    body.activeContext != null && activeContextHasSignals(body.activeContext);
  const hasExploitTargets = (body.exploitTargets?.length ?? 0) > 0;
  const hasReviewSignals =
    (body.topStagedIssues?.length ?? 0) > 0 ||
    (body.exploitTargets ?? []).some((t) => !t.startsWith("market_spotlight:"));
  const signalCount = body.activeSignalTypes?.length ?? 0;

  if (!queueValidation.ok) {
    warnings.push({
      code: "stale_active_context",
      severity: "warning",
      message:
        "Active Context changed since this page loaded. Generation used the latest available signals — refresh the queue to align curated items.",
    });
  }

  if (queueItems === 0 && !hasActiveContext && requestKeywordCount === 0) {
    warnings.push({
      code: "empty_synthesis_vault",
      severity: "warning",
      message:
        "No signals are currently available for synthesis. Stage keywords in Keyword Tracker and competitor or review insights in Active Context, then try again.",
    });
  }

  if (keywordCount < 3) {
    warnings.push({
      code: "low_keyword_coverage",
      severity: "warning",
      message:
        keywordCount === 0
          ? "No target keywords provided. Seeded from app category — add Keyword Tracker terms to sharpen search intent."
          : "Few target keywords staged. Add more from Keyword Tracker or Competitor Spy for richer keyword coverage.",
    });
  }

  if (!hasExploitTargets && !hasActiveContext) {
    warnings.push({
      code: "missing_exploit_targets",
      severity: "info",
      message:
        "No market spotlight or competitor gap targets. Generic category positioning applied — queue gaps or quick wins to personalize copy.",
    });
  }

  if (!hasReviewSignals && signalCount < 2) {
    warnings.push({
      code: "missing_review_signals",
      severity: "info",
      message:
        "No review pain points staged. Add Review Insights to the Optimization Queue to counter competitor weaknesses in copy.",
    });
  }

  if (signalCount < 2 && queueItems > 0) {
    warnings.push({
      code: "sparse_active_context",
      severity: "info",
      message:
        "Partial signal coverage. Stage keywords, reviews, and competitor intel together for maximum synthesis depth.",
    });
  }

  return dedupeWarnings(warnings);
}

export function enrichListingInputForHeuristics(
  body: ListingModularGenerateBody,
  preflightWarnings: ListingGenerationWarning[],
): { input: ListingOptimizerInput; warnings: ListingGenerationWarning[] } {
  const {
    workspaceId: _w,
    appId: _a,
    activeSignalTypes: _s,
    vaultLocale: _l,
    queueHash: _h,
    clientQueueItemCount: _c,
    generationStep: _g,
    lockedKeywords: _lk,
    contextTitle: _ct,
    contextShortDescription: _cs,
    modularListing: _m,
    orchestration: _orch,
    modularTitle: _mt,
    isRegenerate: _ir,
    ...listingInput
  } = body;

  const warnings = [...preflightWarnings];
  const seeds = categorySeedTerms(listingInput.category, listingInput.appName);

  if (listingInput.targetKeywords.length < 3) {
    const merged = [
      ...listingInput.targetKeywords,
      ...seeds.filter((s) => !listingInput.targetKeywords.includes(s)),
    ].slice(0, 20);
    if (merged.length > listingInput.targetKeywords.length) {
      listingInput.targetKeywords = merged;
      if (!warnings.some((w) => w.code === "category_best_practices")) {
        warnings.push({
          code: "category_best_practices",
          severity: "info",
          message:
            "Expanded keyword seeds from category and app name. Refine target keywords before publishing.",
        });
      }
    }
  }

  if (!listingInput.userInstruction?.trim() && warnings.length > 0) {
    listingInput.userInstruction =
      "Use professional Google Play ASO best practices for this category. Where curated signals are missing, write credible generic copy the developer can refine later — never refuse or output placeholders like TBD.";
  }

  return { input: listingInput, warnings: dedupeWarnings(warnings) };
}

export function buildHeuristicTitle(
  input: ListingOptimizerInput,
  lockedKeywords: string[],
): ModularTitleStepData {
  const appName = (input.appName ?? "App").trim() || "App";
  const category = (input.category ?? "").trim();
  const anchor =
    lockedKeywords[0] ??
    input.targetKeywords?.[0] ??
    category.split(/\s+/)[0] ??
    "App";
  const raw = `${appName}: ${anchor}`;
  const title =
    raw.length <= 30 ? raw : appName.slice(0, 30).trim() || raw.slice(0, 30);
  return {
    title,
    lockedKeywords: lockedKeywords.length > 0 ? lockedKeywords.slice(0, 20) : [anchor],
  };
}

export function buildHeuristicShortLine(
  input: ListingOptimizerInput,
  contextTitle: string,
): string {
  const cat = (input.category ?? "").trim() || "mobile";
  const line = `${contextTitle} — professional ${cat} tools for daily results`;
  return normalizeShortVariationText(line);
}

export function buildHeuristicShortVariations(
  input: ListingOptimizerInput,
  contextTitle: string,
): ModularShortStepData {
  const cat = (input.category ?? "").trim() || "your category";
  const app = (input.appName ?? "App").trim() || "App";
  const templates: Record<(typeof SHORT_VARIATION_TYPES)[number], string> = {
    growth: `${contextTitle}: ${cat} keywords to reach new users`,
    conversion: `Trusted ${cat} app — ${app} delivers results you can count on`,
    utility: `${cat} essentials in one app — practical everyday use`,
  };
  return {
    variations: SHORT_VARIATION_TYPES.map((type) => ({
      type,
      text: normalizeShortVariationText(templates[type]),
    })),
  };
}

export function buildHeuristicLongBlocks(
  input: ListingOptimizerInput,
  context: { title: string; shortDescription: string },
): ModularLongStepData {
  const app = (input.appName ?? "App").trim() || "App";
  const cat = (input.category ?? "").trim() || "your category";
  const featureSnippet =
    (input.appFeatures ?? "").trim().slice(0, 280) ||
    `Everything you need for ${cat} in one thoughtfully designed experience.`;
  return {
    hook: `${context.title} helps you get more from ${cat}. ${context.shortDescription}`.slice(
      0,
      600,
    ),
    features: featureSnippet,
    closing: `Download ${app} today and refine this draft with your brand voice before publishing to Google Play.`.slice(
      0,
      400,
    ),
  };
}

export function partialModelOutputWarning(step: string): ListingGenerationWarning {
  return {
    code: "partial_model_output",
    severity: "warning",
    message: `AI output for ${step} needed a professional fallback. Review and edit this section before publishing.`,
  };
}

export function missingContextShortWarning(): ListingGenerationWarning {
  return {
    code: "missing_context_short",
    severity: "info",
    message:
      "Short description was inferred from your title. Generate Phase 2 or edit the short line for a tighter hook.",
  };
}

export function finalizeWarningsPayload(
  warnings: ListingGenerationWarning[],
): ListingGenerationWarningsPayload | undefined {
  if (warnings.length === 0) return undefined;
  return buildWarningsPayload(warnings);
}
