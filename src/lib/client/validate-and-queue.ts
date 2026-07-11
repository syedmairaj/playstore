import type {
  AddOptimizationQueueInput,
  OptimizationQueueItem,
  OptimizationQueueLocale,
} from "@/lib/optimization-queue";
import { diffQueueInputs } from "@/lib/optimization-queue/queue-routing";
import { addToOptimizationQueueClient } from "@/lib/client/optimization-queue-client";
import {
  listingOptimizerPathname,
  mergeOptimizerKeywordText,
  setPlaystoreInjectedKeywordContext,
} from "@/lib/client/listing-optimizer-keywords-prefill";

export type ValidateAndQueueSource =
  | "competitor_spy_gap"
  | "competitor_spy_quick_win"
  | "competitor_spy_review"
  | "competitor_spy_strength_audit"
  | "competitor_spy_keywords"
  | "competitor_spy_snapshot"
  | "market_intel_spotlight";

export type ValidateAndQueueResult = {
  ok: boolean;
  error?: string;
  addedCount: number;
  skippedCount?: number;
  items: AddOptimizationQueueInput[];
  /** No API call — every payload item already exists in the queue. */
  alreadyQueued?: boolean;
};

function resolveVaultLocale(workspaceLocale: string): OptimizationQueueLocale {
  return workspaceLocale === "ar" ? "ar" : "en";
}

function emptyPayloadMessage(locale: OptimizationQueueLocale): string {
  return locale === "ar"
    ? "لا توجد بيانات للإضافة إلى طابور التحسين."
    : "Nothing to add to the optimization queue.";
}

function localeMismatchMessage(locale: OptimizationQueueLocale): string {
  return locale === "ar"
    ? "لغة الإشارة لا تطابق لغة مساحة العمل الحالية (عربي/إنجليزي)."
    : "Signal locale does not match the current workspace language (EN/AR).";
}

/**
 * Unified validator for Competitor Spy (and related) queue actions.
 * Verifies non-empty payload and EN/AR locale alignment before persisting.
 */
export function validateQueuePayload(
  items: AddOptimizationQueueInput[],
  workspaceLocale: string,
): ValidateAndQueueResult {
  const locale = resolveVaultLocale(workspaceLocale);

  const normalized = (items ?? []).filter(
    (item) => typeof item.content === "string" && item.content.trim().length > 0,
  );

  if (normalized.length === 0) {
    return { ok: false, error: emptyPayloadMessage(locale), addedCount: 0, items: [] };
  }

  for (const item of normalized) {
    const itemLocale = (item.metadata?.locale as string | undefined)?.trim();
    if (itemLocale && itemLocale !== locale) {
      return { ok: false, error: localeMismatchMessage(locale), addedCount: 0, items: [] };
    }
  }

  return { ok: true, addedCount: 0, items: normalized };
}

type QueueClient = (
  items: AddOptimizationQueueInput[],
) => Promise<{ addedCount: number; skippedCount?: number }>;

type RouterPush = (href: string) => void;

function discoveryKeywordsFromQueueItems(
  items: AddOptimizationQueueInput[],
): string {
  const terms = items
    .map((item) => item.content.trim())
    .filter((content) => content.length > 0 && content.length <= 48);
  return mergeOptimizerKeywordText("", terms);
}

function pushListingOptimizerNavigation(
  args: {
    workspaceId: string;
    appId?: string;
    items?: AddOptimizationQueueInput[];
  },
  router: RouterPush,
): void {
  const pathname = listingOptimizerPathname(args.workspaceId);
  if (!pathname) return;

  const keywordText = args.items?.length
    ? discoveryKeywordsFromQueueItems(args.items)
    : "";
  if (keywordText && args.appId?.trim()) {
    setPlaystoreInjectedKeywordContext(keywordText, args.appId.trim());
  }

  const href = args.appId?.trim()
    ? `${pathname}?appId=${encodeURIComponent(args.appId.trim())}`
    : pathname;
  router.push(href);
}

/**
 * Validate, diff against existing queue (SSOT), persist only new items.
 * Skips the API entirely when every item is already queued.
 */
export async function validateAndQueue(args: {
  source: ValidateAndQueueSource;
  workspaceId: string;
  workspaceLocale: string;
  appId?: string;
  items: AddOptimizationQueueInput[];
  /** Current queue from useOptimizationQueue — enables client-side diff (no redundant API). */
  existingQueue?: OptimizationQueueItem[];
  addItems?: QueueClient;
  navigate?: boolean;
  router?: { push: RouterPush };
}): Promise<ValidateAndQueueResult> {
  const locale = resolveVaultLocale(args.workspaceLocale);
  const validation = validateQueuePayload(args.items, args.workspaceLocale);
  if (!validation.ok) {
    return validation;
  }

  const diff = diffQueueInputs(validation.items, args.existingQueue ?? []);

  if (diff.isEmpty) {
    return {
      ok: false,
      error: emptyPayloadMessage(locale),
      addedCount: 0,
      items: [],
    };
  }

  if (diff.allQueued) {
    if (args.navigate && args.router) {
      pushListingOptimizerNavigation(
        {
          workspaceId: args.workspaceId,
          appId: args.appId,
          items: validation.items,
        },
        args.router.push,
      );
    }
    return {
      ok: true,
      addedCount: 0,
      skippedCount: diff.skippedCount,
      items: validation.items,
      alreadyQueued: true,
    };
  }

  const addItems =
    args.addItems ??
    (async (items: AddOptimizationQueueInput[]) => {
      const result = await addToOptimizationQueueClient(
        args.workspaceId,
        locale,
        items,
        args.appId,
      );
      return {
        addedCount: result.addedCount,
        skippedCount: result.skippedCount,
      };
    });

  try {
    const result = await addItems(diff.toAdd);

    if (result.addedCount <= 0) {
      return {
        ok: true,
        addedCount: 0,
        skippedCount: diff.skippedCount + (result.skippedCount ?? 0),
        items: validation.items,
        alreadyQueued: true,
      };
    }

    if (args.navigate && args.router) {
      pushListingOptimizerNavigation(
        {
          workspaceId: args.workspaceId,
          appId: args.appId,
          items: validation.items,
        },
        args.router.push,
      );
    }

    return {
      ok: true,
      addedCount: result.addedCount,
      skippedCount: diff.skippedCount + (result.skippedCount ?? 0),
      items: validation.items,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: message,
      addedCount: 0,
      items: validation.items,
    };
  }
}
