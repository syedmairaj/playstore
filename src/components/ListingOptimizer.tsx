"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { ListingOptimizerHydrationPayload } from "@/lib/listing/latest-listing-hydration";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import { AddAppModal, type CreatedWorkspaceApp } from "@/components/app/add-app-modal";
import { OptimizerLivePreviewPane } from "@/components/listing/optimizer/optimizer-live-preview-pane";
import {
  PlayConsoleExportDialog,
  type PlayConsoleExportCopyField,
} from "@/components/listing/play-console-export-dialog";
import { clampListingTexts } from "@/components/listing/optimizer/listing-field-limits";
import {
  OptimizerResultsGeneratingView,
  OptimizerResultsPanel,
} from "@/components/listing/optimizer/optimizer-results-panel";
import {
  OptimizerSparkleTextarea,
} from "@/components/listing/optimizer/optimizer-sparkle-textarea";
import {
  OptimizerStepper,
  type OptimizerWizardStep,
} from "@/components/listing/optimizer/optimizer-stepper";
import {
  OptimizerCreditsConfirmDialog,
  type SynthesisSignalContext,
} from "@/components/listing/optimizer/optimizer-credits-confirm-dialog";
import { AlertTriangle, Hash, Info, Loader2, Shield, Sparkles } from "lucide-react";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { OptimizerWizardStepShell } from "@/components/listing/optimizer/optimizer-wizard-step-shell";
import { LogoGeneratorDialog } from "@/components/listing/logo-generator-dialog";
import { UpgradeModal } from "@/components/ui/upgrade-modal";
import type { AppLimitsData } from "@/hooks/use-app-limits";
import { useAppLimits, workspaceAppsQueryKey } from "@/hooks/use-app-limits";
import { useOptimizerSync } from "@/hooks/useOptimizerSync";
import { precheckAddApp } from "@/lib/client/precheck-add-app";
import {
  clearFinalListingCache,
  finalListingCacheToOutput,
  listingOutputToFinalListingCache,
  readFinalListingCache,
  writeFinalListingCache,
} from "@/lib/client/listing-optimizer-generated-cache";
import {
  consumeInjectedOptimizerKeywords,
  consumePlaystoreKeywordContext,
  consumePlaystoreCompetitorVulnerabilities,
  hasPlaystoreInjectedKeywordContext,
  LISTING_OPTIMIZER_KEYWORDS_PREFILL_STORAGE,
  mergeOptimizerKeywordText,
  OPTIMIZER_KEYWORDS_INJECTED_EVENT,
  readListingOptimizerSession,
  writeListingOptimizerSession,
} from "@/lib/client/listing-optimizer-keywords-prefill";
import {
  AI_CREDIT_COSTS,
  KEYWORD_TRACK_AI_FREE_PER_GENERATION,
} from "@/lib/features/billing/credit-costs";
import { normalizePlan, PLAN_META, UNLIMITED_APP_SLOTS } from "@/lib/plan-limits";
import {
  parseLogoGeneratorMetadata,
  resolveListingPreviewIconUrl,
} from "@/lib/apps/logo-generator-metadata";
import { LocalizedResults } from "@/components/optimizer/LocalizedResults";
import { ListingHistory } from "@/components/listing/ListingHistory";
import { ActiveContextKeywords } from "@/components/optimizer/ActiveContextKeywords";
import {
  type KeywordDisplayItem,
  extractKeywordsFromContext,
  deduplicateKeywords,
} from "@/lib/client/optimizer-keywords-display";
import {
  LOCALIZE_MARKETS,
  type LocalizeMarketCode,
  type LocalizedMarketRecord,
} from "@/lib/listing/localized-markets";
import {
  buildListingImprovementsGenerateDirective,
  fetchUnutilizedListingImprovements,
  type ListingImprovementItem,
} from "@/components/reviews/review-improvements-queue";
import StagingWorkspace from "@/components/staging-workspace/StagingWorkspace";
import KeywordTrackerPanel from "@/components/listing-optimizer/KeywordTrackerPanel";
import { formatLiveRankIndicators } from "@/lib/staging/keyword-signals";
import { KeywordValidatorCard } from "@/components/keyword-tracker/KeywordValidatorCard";
import { useStagingWorkspace } from "@/hooks/useStagingWorkspace";
import {
  buildStagingWorkspaceState,
  getSignalsForAISynthesis,
} from "@/lib/client/staging-workspace-service";
import type {
  ReviewIssueSignal,
  MarketOpportunitySignal,
  CompetitorKeywordSignal,
} from "@/lib/client/staging-workspace-types";
import { cn } from "@/lib/utils";

type ToneStyle = "professional" | "friendly" | "bold" | "minimal";

type ApiSuccess = {
  ok: true;
  data: ListingGenerationOutput;
  meta?: {
    model?: string;
    promptVersion?: string;
    persisted?: boolean;
    generationId?: string;
    savedAt?: string;
    /** Server could not validate ASO scoring; listing fields are still valid. */
    asoScorePartial?: boolean;
    /** Server performed an automatic retry — first attempt failed schema validation. */
    retried?: boolean;
    /** Clamp layer trimmed shortDescription to fit ≤80 chars — surfaced as a neutral UI hint. */
    shortDescriptionClamped?: boolean;
    /**
     * All three signal channels were active — synthesis quality is maximum.
     * Shown as a green "Maximum Synthesis" badge in the results area.
     */
    quality_status?: "All signals active. Synthesis mode: Maximum.";
    /**
     * Fewer than 3 signal channels were active — listing was generated from partial data.
     * Shown as an amber nudge badge in the results area.
     */
    quality_warning?: "Listing generated using partial data. Add Review, Market, or Competitor signals for a more comprehensive strategy.";
  };
};

type ApiError = {
  ok: false;
  error: {
    code?: string;
    message: string;
    details?: unknown;
    remaining?: number;
    required?: number;
  };
};

type AutofillField = "keywords" | "features";

type CreditConfirmPending =
  | { kind: "listing_generation" }
  | { kind: "autofill"; field: AutofillField };

type AutofillApiSuccess = {
  ok: true;
  data: { text: string; field: AutofillField };
  meta?: {
    model?: string;
    creditsCharged?: number;
    creditsRemaining?: number;
    persistedInputs?: boolean;
    generationId?: string;
    savedAt?: string;
  };
};

// ── Spotlight stub sessionStorage bridge ──────────────────────────────────────
// Spotlight stubs (url-exploit- items with market_spotlight: sentimentTag) are
// ephemeral React state injected from URL params. They get wiped whenever
// refreshQueuedImprovements fires a DB fetch and replaces the queue array.
// Writing them to sessionStorage lets the DB-fetch merge re-attach any stubs
// that haven't been explicitly removed by the user.
const SPOTLIGHT_STUBS_SESSION_KEY = "playstore:listingOptimizer:spotlightStubs";

function writeSpotlightStubsToSession(stubs: import("@/components/reviews/review-improvements-queue").ListingImprovementItem[]): void {
  if (typeof window === "undefined") return;
  try {
    const spotlightOnly = stubs.filter(
      (s) => s.id.startsWith("url-exploit-") && s.sentimentTag?.startsWith("market_spotlight:"),
    );
    if (spotlightOnly.length === 0) {
      sessionStorage.removeItem(SPOTLIGHT_STUBS_SESSION_KEY);
    } else {
      sessionStorage.setItem(SPOTLIGHT_STUBS_SESSION_KEY, JSON.stringify(spotlightOnly));
    }
  } catch { /* quota / private mode */ }
}

function readSpotlightStubsFromSession(): import("@/components/reviews/review-improvements-queue").ListingImprovementItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(SPOTLIGHT_STUBS_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as import("@/components/reviews/review-improvements-queue").ListingImprovementItem[];
  } catch { return []; }
}

function clearSpotlightStubsFromSession(): void {
  if (typeof window === "undefined") return;
  try { sessionStorage.removeItem(SPOTLIGHT_STUBS_SESSION_KEY); } catch { /* ok */ }
}
// ─────────────────────────────────────────────────────────────────────────────

/** English instructions for Gemini (stable regardless of UI locale). */
const REGENERATE_MODEL_INSTRUCTIONS = {
  punchier:
    "Regenerate the full Play listing JSON. Make the copy punchier, more energetic, and more memorable. Keep honest claims, respect Google Play character limits, preserve the same app facts and keyword intent, and return a fresh aso_score + score_breakdown + improvement_tips that reflect the new copy.",
  professional:
    "Regenerate the full Play listing JSON. Use a more polished, enterprise-appropriate professional voice while staying approachable. Keep honest claims and character limits, and return a fresh aso_score + score_breakdown + improvement_tips that reflect the new copy.",
  arabic:
    "Regenerate the full Play listing JSON. Translate every user-visible store string into natural modern Arabic suitable for MENA users on Google Play. Keep honest claims and character limits, and return a fresh aso_score + score_breakdown + improvement_tips that reflect the new copy.",
  tone:
    "Regenerate the full Play listing JSON. Vary tone and phrasing with a fresh creative angle while keeping the same substance and keyword intent. Keep honest claims and character limits, and return a fresh aso_score + score_breakdown + improvement_tips that reflect the new copy.",
} as const;

function metaString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mergeLocalizedMarkets(
  prev: LocalizedMarketRecord[],
  incoming: LocalizedMarketRecord[],
): LocalizedMarketRecord[] {
  const map = new Map(prev.map((m) => [m.market, m]));
  for (const row of incoming) map.set(row.market, row);
  return LOCALIZE_MARKETS.filter((code) => map.has(code)).map(
    (code) => map.get(code)!,
  );
}

function defaultActiveLocalizeMarket(
  markets: LocalizedMarketRecord[],
): LocalizeMarketCode {
  if (markets.some((m) => m.market === "ae")) return "ae";
  return markets[0]?.market ?? "ae";
}

function buildLocalizedExportTxt(record: LocalizedMarketRecord): string {
  return [
    `Title: ${record.title}`,
    "",
    `Short Description: ${record.shortDescription}`,
    "",
    `Long Description: ${record.longDescription}`,
    "",
    `Keywords: ${record.keywords.join(", ")}`,
  ].join("\n");
}

function downloadLocalizedMarketTxt(record: LocalizedMarketRecord) {
  const blob = new Blob([buildLocalizedExportTxt(record)], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `play-listing-${record.market}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Avoids `RangeError: Invalid time value` when `Intl` formats a bad timestamp. */
function formatListingGeneratedAtLabel(
  iso: string | null | undefined,
  formatter: Intl.DateTimeFormat,
): string {
  const raw = typeof iso === "string" ? iso.trim() : "";
  if (!raw) return "";
  const ms = new Date(raw).getTime();
  if (Number.isNaN(ms)) return "";
  try {
    return formatter.format(new Date(ms));
  } catch {
    return "";
  }
}

/** Reads listing-related keys from `apps` row (column `icon_url` preferred, then `metadata`). */
function readAppListingMeta(
  metadata: Record<string, unknown> | null | undefined,
  iconUrlColumn?: string | null,
): { category: string; shortDescription: string; iconUrl: string } {
  if (!metadata || typeof metadata !== "object") {
    const col = metaString(iconUrlColumn);
    return { category: "", shortDescription: "", iconUrl: col };
  }
  const short =
    metaString(metadata.short_description) ||
    metaString(
      (metadata as { shortDescription?: unknown }).shortDescription,
    );
  const metaIcon =
    metaString(metadata.icon_url) ||
    metaString((metadata as { iconUrl?: unknown }).iconUrl);
  const colIcon = metaString(iconUrlColumn);
  const icon = colIcon || metaIcon;
  return {
    category: metaString(metadata.category),
    shortDescription: short,
    iconUrl: icon,
  };
}

function workspaceIdFromParams(
  raw: string | string[] | undefined,
): string | undefined {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  const first = Array.isArray(raw) ? raw[0] : undefined;
  if (typeof first === "string" && first.trim()) return first.trim();
  return undefined;
}

function hasValidHttpsPreviewIcon(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * StagingWorkspaceSection Component
 *
 * Adapter that bridges ListingOptimizer state with the new StagingWorkspace component.
 * Converts existing pill/keyword arrays into properly typed signals and manages removal callbacks.
 */
interface StagingWorkspaceSectionProps {
  workspaceId: string;
  appId: string;
  reviewQueuePills: import("@/components/reviews/review-improvements-queue").ListingImprovementItem[];
  spotlightQueuePills: import("@/components/reviews/review-improvements-queue").ListingImprovementItem[];
  stagedKeywords: KeywordDisplayItem[];
  competitorWeaknesses: string[];
  locale: string;
  isRtl: boolean;
  loading: boolean;
  onRemoveReviewIssue: (id: string) => void;
  onRemoveMarketOpportunity: (id: string) => void;
  onRemoveCompetitorKeyword: (keywordId: string, signalId: string) => void;
  onRemoveCompetitorWeakness: (idx: number) => void;
  onOpenKeywordValidator: (keyword: string) => void;
  keywordSignalsLoading?: boolean;
  keywordTrackerCount?: number;
  vaultLocale: "en" | "ar";
}

function StagingWorkspaceSection({
  workspaceId,
  appId,
  reviewQueuePills,
  spotlightQueuePills,
  stagedKeywords,
  competitorWeaknesses,
  locale,
  isRtl,
  loading,
  onRemoveReviewIssue,
  onRemoveMarketOpportunity,
  onRemoveCompetitorKeyword,
  onRemoveCompetitorWeakness,
  onOpenKeywordValidator,
  keywordSignalsLoading,
  keywordTrackerCount = 0,
  vaultLocale,
}: StagingWorkspaceSectionProps) {
  // Convert review queue pills to ReviewIssueSignal format
  const reviewIssues: ReviewIssueSignal[] = reviewQueuePills.map((pill) => ({
    id: pill.id,
    source: "review_issue" as const,
    content: pill.label,
    timestamp: Date.now(),
    metadata: { originalPill: pill },
  }));

  // Convert spotlight pills to MarketOpportunitySignal format
  const marketOpportunities: MarketOpportunitySignal[] = spotlightQueuePills.map((pill) => ({
    id: pill.id,
    source: "market_spotlight" as const,
    keyword: pill.label,
    timestamp: Date.now(),
    metadata: { originalPill: pill },
  }));

  // Convert staged keywords to CompetitorKeywordSignal format
  const competitorKeywords: CompetitorKeywordSignal[] = stagedKeywords.map((kw) => ({
    id: kw.id,
    source: "competitor_keyword" as const,
    keyword: kw.term,
    category: kw.category,
    userSelected: true,
    timestamp: Date.now(),
    metadata: { originalId: kw.originalId },
  }));

  // Create unified removal handler
  const handleRemoveSignal = async (signalId: string, source: string) => {
    if (source === "review_issue") {
      onRemoveReviewIssue(signalId);
    } else if (source === "market_spotlight") {
      onRemoveMarketOpportunity(signalId);
    } else if (source === "competitor_keyword") {
      // Find the original ID from metadata
      const keyword = stagedKeywords.find((kw) => kw.id === signalId);
      if (keyword) {
        onRemoveCompetitorKeyword(signalId, keyword.originalId);
      }
    }
  };

  // Use the staging workspace hook
  const {
    workspaceState,
    workspaceConfig,
    handleRemoveSignal: wrappedRemoveHandler,
  } = useStagingWorkspace({
    reviewIssues,
    marketOpportunities,
    competitorKeywords,
    locale: locale as "en" | "ar",
    isRtl,
    isLoading: loading,
    onRemoveSignal: handleRemoveSignal,
  });

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
      <StagingWorkspace
        state={workspaceState}
        config={workspaceConfig}
        onRemoveSignal={wrappedRemoveHandler}
        keywordTrackerCount={keywordTrackerCount}
        topSection={
          appId ? (
            <KeywordTrackerPanel
              workspaceId={workspaceId}
              appId={appId}
              vaultLocale={vaultLocale}
              isRtl={isRtl}
              onOpenValidator={(keyword) => onOpenKeywordValidator(keyword)}
              isLoading={keywordSignalsLoading}
            />
          ) : null
        }
      />

      {/* Competitor Weaknesses - kept separate as it's a different data model */}
      {competitorWeaknesses.length > 0 && (
        <div className="mt-4 space-y-4 border-t border-white/[0.07] pt-4">
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <Shield className="size-3 shrink-0 text-amber-400/80" aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400/80">
                {isRtl ? "نقاط ضعف المنافسين" : "Competitor Weaknesses"}
              </span>
              <span className="text-[10px] text-white/25">
                {isRtl ? "← تُستخدم لإبراز التميز في الوصف الطويل" : "→ position you as the superior alternative"}
              </span>
            </div>
            {competitorWeaknesses.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <AnimatePresence initial={false}>
                  {competitorWeaknesses.map((weakness, idx) => (
                    <motion.span
                      key={`cweak-${idx}-${weakness.slice(0, 20).replace(/\s/g, "-")}`}
                      layout
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.18 }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200/90",
                        loading && "pointer-events-none opacity-60",
                      )}
                    >
                      <Shield className="size-2.5 shrink-0 text-amber-400/70" aria-hidden />
                      <span className="max-w-[160px] truncate">{weakness}</span>
                      {!loading ? (
                        <button
                          type="button"
                          aria-label={`Remove ${weakness}`}
                          onClick={() => onRemoveCompetitorWeakness(idx)}
                          className="ms-0.5 rounded-full p-0.5 text-amber-400/50 transition hover:bg-amber-500/20 hover:text-amber-300"
                        >
                          ×
                        </button>
                      ) : null}
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export function ListingOptimizer({
  workspaceId: workspaceIdProp,
  embedded,
  locale: localeProp,
  initialAppLimits,
  initialApps,
  initialAiCreditsRemaining,
  initialHydrationByApp,
  initialHydrationNoApp,
}: {
  /** When omitted (e.g. embedded reuse), derived from the `[workspaceId]` segment via `useParams`. */
  workspaceId?: string;
  embedded?: boolean;
  /** Route locale for RTL, typography, and API language hints (falls back to `useLocale()`). */
  locale?: "en" | "ar";
  /** Server snapshot from `canAddNewApp` — same shape as GET app-limits; avoids flash before client fetch. */
  initialAppLimits?: AppLimitsData;
  /** Server-fetched apps so the picker works before the client refetch. */
  initialApps?: {
    id: string;
    name: string;
    package_name?: string | null;
    metadata?: Record<string, unknown> | null;
    icon_url?: string | null;
  }[];
  /** Workspace `ai_credits_remaining` for client-side autofill pre-check (optional). */
  initialAiCreditsRemaining?: number;
  /** Latest saved listing_generations per app (server-loaded for refresh restore). */
  initialHydrationByApp?: Record<string, ListingOptimizerHydrationPayload>;
  /** Latest workspace-wide generation without `app_id` (no workspace apps). */
  initialHydrationNoApp?: ListingOptimizerHydrationPayload | null;
}) {
  const params = useParams<{ workspaceId?: string | string[] }>();
  const workspaceId =
    (workspaceIdProp?.trim() ? workspaceIdProp.trim() : undefined) ??
    workspaceIdFromParams(params.workspaceId);

  const intlLocale = useLocale();
  const locale: "en" | "ar" =
    localeProp === "ar" || localeProp === "en"
      ? localeProp
      : intlLocale === "ar"
        ? "ar"
        : "en";
  const isRtl = locale === "ar";

  const t = useTranslations("optimizer");
  const tAddApp = useTranslations("addApp");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [appName, setAppName] = useState("");
  const [category, setCategory] = useState("");
  const [keywords, setKeywords] = useState("");
  const [features, setFeatures] = useState("");
  const [toneStyle, setToneStyle] = useState<ToneStyle>("professional");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ListingGenerationOutput | null>(null);
  /**
   * Mirrors `result` synchronously so async effects can read the current value
   * without being re-triggered by stale closures.  Used to guard against the
   * hydration effect clearing a live result when the DB returns a null-output row.
   */
  const resultRef = useRef<ListingGenerationOutput | null>(null);
  resultRef.current = result;
  const [editedTitle, setEditedTitle] = useState("");
  const [editedShort, setEditedShort] = useState("");
  const [editedLong, setEditedLong] = useState("");
  const [meta, setMeta] = useState<ApiSuccess["meta"]>();
  const [listingGenerationId, setListingGenerationId] = useState<
    string | undefined
  >();
  const [trackKwBusy, setTrackKwBusy] = useState(false);
  /** Dedicated debounce flag: set true the instant a credit-consuming action is dispatched,
   *  cleared in the finally block. Prevents double-click / double-fire before React re-renders. */
  const [isProcessingCredits, setIsProcessingCredits] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [addAppOpen, setAddAppOpen] = useState(false);
  const [exportPlayOpen, setExportPlayOpen] = useState(false);
  const [logoGenOpen, setLogoGenOpen] = useState(false);
  const [googlePlayConnected, setGooglePlayConnected] = useState<boolean | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [previewShortDesc, setPreviewShortDesc] = useState("");
  const [previewIconUrl, setPreviewIconUrl] = useState("");
  const [autofillBusy, setAutofillBusy] = useState<AutofillField | null>(null);
  const [creditConfirmPending, setCreditConfirmPending] =
    useState<CreditConfirmPending | null>(null);
  const [autofillGate, setAutofillGate] = useState<{
    appName?: boolean;
    category?: boolean;
  }>({});
  const [aiCreditsRemaining, setAiCreditsRemaining] = useState<number | null>(
    typeof initialAiCreditsRemaining === "number"
      ? initialAiCreditsRemaining
      : null,
  );

  // ── Staging Vault Context ────────────────────────────────────────────────
  const {
    data: optimizerContext,
    mutate: refreshOptimizerContext,
    keywordSignalsLoading,
    keywordSignals,
    keywordSignalsTotal,
  } = useOptimizerSync(workspaceId, {
    appId: selectedAppId.trim() || undefined,
    vaultLocale: locale,
  });

  const [validatorOpen, setValidatorOpen] = useState(false);
  const [validatorPrefillKeyword, setValidatorPrefillKeyword] = useState("");

  const handleOpenKeywordValidator = useCallback((keyword: string) => {
    setValidatorPrefillKeyword(keyword);
    setValidatorOpen(true);
  }, []);

  // ── Localization expansion state ──────────────────────────────────────────
  type LocalizeMarket = LocalizeMarketCode;
  const [localizeMarkets, setLocalizeMarkets] = useState<Set<LocalizeMarket>>(new Set());
  const [localizeConfirmOpen, setLocalizeConfirmOpen] = useState(false);
  const [localizeRegenerateConfirmOpen, setLocalizeRegenerateConfirmOpen] = useState(false);
  const [localizeRegenerateMarket, setLocalizeRegenerateMarket] =
    useState<LocalizeMarketCode | null>(null);
  const [localizeInputExpanded, setLocalizeInputExpanded] = useState(false);
  const [localizeBusy, setLocalizeBusy] = useState(false);
  const [localizeRegeneratingMarket, setLocalizeRegeneratingMarket] =
    useState<LocalizeMarketCode | null>(null);
  const [localizedMarkets, setLocalizedMarkets] = useState<LocalizedMarketRecord[]>([]);
  const [activeMarket, setActiveMarket] = useState<LocalizeMarketCode>("ae");
  const [localizeCopied, setLocalizeCopied] = useState<string | null>(null);
  const [localizeError, setLocalizeError] = useState<string | null>(null);

  const localizeCreditCost = AI_CREDIT_COSTS.localization;
  // localizeTotalCredits, toggleLocalizeMarket, runLocalize, copyLocalizeText
  // are defined after clampedListing (below) to avoid temporal dead zone.

  /** Last workspace-app id applied by the picker; used to detect real row changes vs refetch-only. */
  const workspacePickerPrevIdRef = useRef<string>("");
  /** One-time auto-select first workspace app so the picker is not left blank on first load. */
  const autoPickedInitialAppRef = useRef(false);
  const generateNoAppToastShownRef = useRef(false);
  const keywordsPrefillAppliedRef = useRef(false);
  /** Blocks latest-listing hydration from restoring stale ASO/listing after Competitor Spy injection. */
  const suppressListingHydrationRef = useRef(false);
  /** Consumes localStorage/session injection queues once per route navigation. */
  const injectionNavKeyRef = useRef("");
  const injectionConsumedForNavRef = useRef(false);
  /**
   * Competitor pain-point phrases injected from the Exploit bridge.
   * Consumed once on the first generation run as an inversion directive —
   * never surfaced as raw search keywords in the Target Keywords field.
   * Also mirrored into `competitorWeaknesses` state so Step 3 can render them
   * as a removable pill group in the Active Context canvas.
   */
  const competitorVulnerabilitiesRef = useRef<string[]>([]);
  /**
   * UI-visible mirror of competitorVulnerabilitiesRef.
   * Populated whenever vulnerabilities are injected; each pill can be removed
   * independently. The ref is kept in sync so generation consumes the current set.
   */
  const [competitorWeaknesses, setCompetitorWeaknesses] = useState<string[]>([]);
  const [queuedImprovements, setQueuedImprovements] = useState<ListingImprovementItem[]>([]);
  const [queuedImprovementsLoading, setQueuedImprovementsLoading] = useState(false);
  /**
   * Snapshot of queuedImprovements captured at generation time.
   * Used to populate "Optimization Factors" pills in the results panel
   * — we need to know what WAS in the queue when the listing was generated,
   * not what's left after items are archived.
   */
  const [generationQueueSnapshot, setGenerationQueueSnapshot] = useState<ListingImprovementItem[]>([]);
  const optimizerSessionRestoredRef = useRef(false);
  const [pickAppGate, setPickAppGate] = useState(false);
  const [wizardStep, setWizardStep] = useState<OptimizerWizardStep>(0);
  const [wizardPanelPeek, setWizardPanelPeek] = useState<
    Partial<Record<OptimizerWizardStep, boolean>>
  >({});
  const [generateJustSucceeded, setGenerateJustSucceeded] = useState(false);
  /** After fresh keyword injection: show results skeleton until the user runs Generate. */
  const [purgedAwaitingGenerate, setPurgedAwaitingGenerate] = useState(false);
  const purgedAwaitingGenerateRef = useRef(false);
  purgedAwaitingGenerateRef.current = purgedAwaitingGenerate;

  const [hydrationByApp, setHydrationByApp] = useState<
    Record<string, ListingOptimizerHydrationPayload>
  >(() => initialHydrationByApp ?? {});

  const [lastGeneratedAtIso, setLastGeneratedAtIso] = useState<string | null>(
    null,
  );

  const lastGeneratedLabelFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale === "ar" ? "ar" : "en", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [intlLocale],
  );

  useEffect(() => {
    if (initialHydrationByApp) {
      setHydrationByApp(initialHydrationByApp);
    }
  }, [initialHydrationByApp]);

  const appliedNoAppHydrationRef = useRef(false);

  useEffect(() => {
    if (typeof initialAiCreditsRemaining === "number") {
      setAiCreditsRemaining(initialAiCreditsRemaining);
    }
  }, [initialAiCreditsRemaining]);

  useEffect(() => {
    if (!result) return;
    setEditedTitle(result.title);
    setEditedShort(result.shortDescription);
    setEditedLong(result.fullDescription);
  }, [result]);

  const queryClient = useQueryClient();
  const limits = useAppLimits(workspaceId, {
    initialData: initialAppLimits,
  });
  const appsQuery = useQuery({
    queryKey: workspaceAppsQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    ...(initialApps !== undefined ? { initialData: initialApps } : {}),
    /** Always reconcile with the API on mount — long `staleTime` hid failures and skipped refetch. */
    staleTime: 0,
    queryFn: async () => {
      if (!workspaceId) {
        throw new Error(t("appContext.missingWorkspaceId"));
      }
      const res = await fetch(`/api/workspaces/${workspaceId}/apps`, {
        credentials: "include",
      });
      const raw = await res.text();
      let json: unknown;
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          res.ok
            ? t("appContext.appsErrorInvalid")
            : t("appContext.appsErrorStatus", { status: res.status }),
        );
      }
      const body = json as {
        ok?: boolean;
        apps?: {
          id: string;
          name: string;
          package_name?: string | null;
          metadata?: Record<string, unknown> | null;
          icon_url?: string | null;
        }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(body.error?.message ?? t("appContext.appsErrorStatus", { status: res.status }));
      }
      if (body.ok !== true) {
        throw new Error(body.error?.message ?? t("appContext.appsError"));
      }
      const rows = body.apps ?? [];
      return rows.map((a) => ({
        id: String((a as { id?: unknown }).id ?? ""),
        name: String((a as { name?: unknown }).name ?? ""),
        package_name:
          typeof (a as { package_name?: unknown }).package_name === "string" &&
          (a as { package_name: string }).package_name.trim()
            ? (a as { package_name: string }).package_name.trim()
            : null,
        metadata:
          (a as { metadata?: Record<string, unknown> | null }).metadata ?? null,
        icon_url:
          typeof (a as { icon_url?: unknown }).icon_url === "string" &&
          (a as { icon_url: string }).icon_url.trim()
            ? (a as { icon_url: string }).icon_url.trim()
            : null,
      }));
    },
  });

  const appsList = appsQuery.data ?? [];
  const selectedAppRow = useMemo(() => {
    const list = appsQuery.data;
    if (!list) return undefined;
    return list.find((a) => a.id === selectedAppId);
  }, [appsQuery.data, selectedAppId]);
  const selectedPersistedIconUrl = useMemo(() => {
    if (!selectedAppRow) return "";
    return resolveListingPreviewIconUrl({
      iconUrlColumn: selectedAppRow.icon_url,
      metadata: selectedAppRow.metadata,
    });
  }, [selectedAppRow]);
  const livePreviewIconUrl = useMemo(() => {
    const fromState = previewIconUrl.trim();
    if (hasValidHttpsPreviewIcon(fromState)) return fromState;
    const persisted = selectedPersistedIconUrl.trim();
    if (hasValidHttpsPreviewIcon(persisted)) return persisted;
    return "";
  }, [previewIconUrl, selectedPersistedIconUrl]);

  /**
   * Canonical display name for the App Identity input and phone mockup header.
   * Priority: workspace app row (always authoritative) → hydration record
   * → appName state (user-typed draft).
   * This ensures "Salt Sugar" (or whatever the primary app is) never goes blank
   * during injection, hydration suppression, or intermediate loading states.
   */
  const displayAppName = useMemo(() => {
    const fromRow = selectedAppRow?.name?.trim();
    if (fromRow) return fromRow;
    if (selectedAppId) {
      const fromHyd = hydrationByApp[selectedAppId]?.appName?.trim();
      if (fromHyd) return fromHyd;
    }
    return appName.trim();
  }, [appName, hydrationByApp, selectedAppId, selectedAppRow]);

  /** Phone mockup header: after a generation the result was generated for the current
   *  draft, so use the draft appName; before generation always lock to the primary app row. */
  const previewAppName = useMemo(() => {
    if (result) return appName.trim() || displayAppName;
    return displayAppName;
  }, [appName, displayAppName, result]);

  useEffect(() => {
    if (!generateJustSucceeded) return;
    const timer = window.setTimeout(() => setGenerateJustSucceeded(false), 2800);
    return () => window.clearTimeout(timer);
  }, [generateJustSucceeded]);
  const showChangeLogoBtn = Boolean(
    selectedAppId &&
      (livePreviewIconUrl.trim().length > 0 ||
        selectedPersistedIconUrl.trim().length > 0),
  );
  const appsBusy =
    (appsQuery.isLoading && initialApps === undefined) ||
    (appsQuery.isFetching && appsList.length === 0);

  const clearOptimizerGeneratedOutputs = useCallback(
    (opts?: {
      clearLocalCache?: boolean;
      appId?: string;
      /**
       * When true, also clears the App Identity, App Features & Value, and Phone
       * Mockup frame fields. Set this on a fresh exploit-injection campaign so
       * stale data from the previous session never bleeds into the new run.
       */
      clearInputFrames?: boolean;
    }) => {
      // ── Generated output frames ─────────────────────────────────────────────
      setResult(null);
      setEditedTitle("");
      setEditedShort("");
      setEditedLong("");
      setMeta(undefined);
      setListingGenerationId(undefined);
      setLastGeneratedAtIso(null);
      setGenerateJustSucceeded(false);
      setWizardStep(0);
      setWizardPanelPeek({});
      setPurgedAwaitingGenerate(false);
      // ── App Identity / Features / Phone Mockup frames (on fresh injection) ──
      if (opts?.clearInputFrames) {
        setAppName("");
        setFeatures("");
        setPreviewShortDesc("");
        setPreviewIconUrl("");
      }
      if (opts?.clearLocalCache && opts.appId?.trim()) {
        clearFinalListingCache(opts.appId.trim());
      }
    },
    [],
  );

  const applyCachedOrHydratedListingOutput = useCallback(
    (
      aid: string,
      output: ListingGenerationOutput,
      savedAt: string,
      generationId?: string,
    ) => {
      setResult(output);
      setWizardStep(2);
      setWizardPanelPeek({});
      setEditedTitle(output.title);
      setEditedShort(output.shortDescription);
      setEditedLong(output.fullDescription);
      setLastGeneratedAtIso(savedAt);
      if (generationId) setListingGenerationId(generationId);
      setPurgedAwaitingGenerate(false);
    },
    [],
  );

  const tryApplyFinalListingCache = useCallback(
    (aid: string): boolean => {
      const final = readFinalListingCache(aid);
      if (!final) return false;
      applyCachedOrHydratedListingOutput(
        aid,
        finalListingCacheToOutput(final),
        final.generatedAt,
        final.generationId,
      );
      return true;
    },
    [applyCachedOrHydratedListingOutput],
  );

  const syncPreviewFromWorkspaceApp = useCallback(
    (appId: string) => {
      const row = appsList.find((a) => a.id === appId);
      if (!row) return;
      const appRowMeta = readAppListingMeta(row.metadata, row.icon_url);
      const previewIcon = resolveListingPreviewIconUrl({
        iconUrlColumn: row.icon_url,
        metadata: row.metadata,
      });
      const displayName = row.name.trim();
      setAppName(displayName);
      setCategory(appRowMeta.category);
      setPreviewShortDesc(appRowMeta.shortDescription);
      setPreviewIconUrl(previewIcon);
    },
    [appsList],
  );

  const applyOptimizerKeywordInjection = useCallback(() => {
    const freshReplaceQueued = hasPlaystoreInjectedKeywordContext();
    if (keywordsPrefillAppliedRef.current && !freshReplaceQueued) return;
    if (appsBusy || appsQuery.isError) return;
    if (appsList.length > 0 && !selectedAppId.trim()) return;

    const navKey = `${pathname}?${searchParams.toString()}`;
    if (injectionNavKeyRef.current !== navKey) {
      injectionNavKeyRef.current = navKey;
      injectionConsumedForNavRef.current = false;
    }

    const rawParam = searchParams.get("keywords");
    const fromUrl =
      rawParam && rawParam.trim()
        ? (() => {
            try {
              return decodeURIComponent(rawParam.trim());
            } catch {
              return rawParam.trim();
            }
          })()
        : "";
    let legacy = fromUrl;
    if (!legacy && !injectionConsumedForNavRef.current && typeof window !== "undefined") {
      try {
        const stored = sessionStorage
          .getItem(LISTING_OPTIMIZER_KEYWORDS_PREFILL_STORAGE)
          ?.trim();
        if (stored) {
          legacy = stored;
          sessionStorage.removeItem(LISTING_OPTIMIZER_KEYWORDS_PREFILL_STORAGE);
        }
      } catch {
        /* sessionStorage unavailable */
      }
    }

    let injectedReplace: string[] = [];
    let injectedSession: string[] = [];
    if (!injectionConsumedForNavRef.current) {
      injectionConsumedForNavRef.current = true;
      injectedReplace = consumePlaystoreKeywordContext();
      injectedSession = consumeInjectedOptimizerKeywords();
      // Consume competitor vulnerabilities alongside keyword injection so they
      // arrive atomically. Stored in a ref — used once on the next generation run.
      // Also mirrored into competitorWeaknesses state so Step 3 can render them.
      const vulns = consumePlaystoreCompetitorVulnerabilities();
      if (vulns.length) {
        competitorVulnerabilitiesRef.current = vulns;
        setCompetitorWeaknesses(vulns);
      }
    }

    if (!legacy && injectedReplace.length === 0 && injectedSession.length === 0) return;
    keywordsPrefillAppliedRef.current = true;

    const appIdParam = searchParams.get("appId")?.trim() ?? "";
    const resolvedAppId =
      appIdParam && appsList.some((a) => a.id === appIdParam)
        ? appIdParam
        : selectedAppId.trim();

    if (injectedReplace.length > 0) {
      // ── Atomic isolated state overwrite ─────────────────────────────────────
      // Flush the entire optimizer form to a clean slate derived from the injected
      // context, preventing stale ASO results, scoring spinners, or previous-app
      // identity from bleeding through into the new session.
      suppressListingHydrationRef.current = true;

      // Explicit localStorage guard: consumePlaystoreKeywordContext() already removed
      // the key but we remove it again atomically here to prevent any concurrent
      // effect cycle from re-reading a partially-written value.
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("playstore_injected_keyword_context");
        }
      } catch { /* quota / private mode */ }

      // 1. Clear all generated output (nulls result → nulls asoScore) and reset
      //    wizard to step 0. purgedAwaitingGenerate=true holds the skeleton open
      //    until the user runs a fresh generation.
      //    clearInputFrames=true additionally wipes App Identity, App Features & Value,
      //    and Phone Mockup frames so stale cached data never bleeds into the new campaign.
      clearOptimizerGeneratedOutputs({
        clearLocalCache: Boolean(resolvedAppId),
        appId: resolvedAppId || undefined,
        clearInputFrames: true,
      });
      setPurgedAwaitingGenerate(true);
      setError(null);

      // 2. Overwrite keywords with the injected payload — no merge with stale chips.
      setKeywords(injectedReplace.join(", "));

      if (resolvedAppId) {
        if (resolvedAppId !== selectedAppId) {
          workspacePickerPrevIdRef.current = resolvedAppId;
          setSelectedAppId(resolvedAppId);
        }

        // 3. Resolve app identity: workspace app row is the primary source of truth;
        //    fall back to hydration data when the row hasn't loaded yet (e.g. "Salt Sugar").
        const appRowFromList = appsList.find((a) => a.id === resolvedAppId);
        const hyd = hydrationByApp[resolvedAppId];
        const session = readListingOptimizerSession();

        // App Name — always overwrite from the authoritative source.
        const resolvedAppName =
          appRowFromList?.name?.trim() ||
          hyd?.appName?.trim() ||
          "";
        setAppName(resolvedAppName);

        // Preview icon — from the app row (or hydration metadata).
        if (appRowFromList) {
          const appRowMeta = readAppListingMeta(appRowFromList.metadata, appRowFromList.icon_url);
          const previewIcon = resolveListingPreviewIconUrl({
            iconUrlColumn: appRowFromList.icon_url,
            metadata: appRowFromList.metadata,
          });
          // Overwrite short-desc and icon unconditionally — injection context wins.
          setPreviewShortDesc(appRowMeta.shortDescription);
          setPreviewIconUrl(previewIcon);
        } else {
          // App row not yet loaded; sync via helper (may be no-op) and clear stale icon.
          syncPreviewFromWorkspaceApp(resolvedAppId);
          setPreviewShortDesc("");
          setPreviewIconUrl("");
        }

        // 4. Overwrite features, category, and tone from session/hydration — always
        //    replace rather than leaving stale values from a different app in place.
        const resolvedFeatures =
          session?.appId === resolvedAppId && session.features.trim()
            ? session.features
            : hyd?.appFeatures?.trim() ?? "";
        const resolvedCategory =
          session?.appId === resolvedAppId && session.category.trim()
            ? session.category
            : appRowFromList
              ? readAppListingMeta(appRowFromList.metadata, appRowFromList.icon_url).category
              : hyd?.category?.trim() ?? "";
        const resolvedTone: ToneStyle =
          (session?.appId === resolvedAppId
            ? (session.toneStyle as ToneStyle)
            : hyd?.toneStyle) ?? "professional";

        setFeatures(resolvedFeatures);
        setCategory(resolvedCategory);
        setToneStyle(resolvedTone);
      }
      // ────────────────────────────────────────────────────────────────────────
    } else {
      setKeywords((prev) => {
        const merged = mergeOptimizerKeywordText(prev, [
          ...(legacy ? legacy.split(/[,;\n]+/u).map((s) => s.trim()).filter(Boolean) : []),
          ...injectedSession,
        ]);
        return merged;
      });
    }

    const sp = new URLSearchParams(searchParams.toString());
    let qsChanged = false;
    if (rawParam?.trim() && sp.has("keywords")) {
      sp.delete("keywords");
      qsChanged = true;
    }
    if (appIdParam && sp.has("appId")) {
      sp.delete("appId");
      qsChanged = true;
    }
    if (qsChanged) {
      try {
        const qs = sp.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      } catch {
        /* */
      }
    }
  }, [
    appsBusy,
    appsQuery.isError,
    appsList,
    clearOptimizerGeneratedOutputs,
    pathname,
    router,
    searchParams,
    selectedAppId,
    syncPreviewFromWorkspaceApp,
    hydrationByApp,
  ]);

  useEffect(() => {
    applyOptimizerKeywordInjection();
  }, [applyOptimizerKeywordInjection]);

  const refreshQueuedImprovements = useCallback(() => {
    if (!workspaceId) {
      setQueuedImprovements([]);
      setQueuedImprovementsLoading(false);
      return;
    }
    setQueuedImprovementsLoading(true);

    // Fetch both listing-improvements (review-based) AND backlog items (Common Issues)
    // then merge them so the Active Optimization Queue shows everything at once.
    const listingImprovementsPromise = fetchUnutilizedListingImprovements(workspaceId);
    const backlogPromise = fetch(
      `/api/workspaces/${workspaceId}/backlog`,
      { credentials: "same-origin" },
    )
      .then((r) => r.json() as Promise<{ success: boolean; items?: Array<{
        id: string;
        package_name: string;
        country_code: string;
        issue_title: string;
        issue_description: string;
        severity: string;
        impact: number;
        is_implemented: boolean;
        created_at: string;
        updated_at: string;
      }> }>)
      .then((json) => {
        if (!json.success || !Array.isArray(json.items)) return [] as ListingImprovementItem[];
        // Only show active (not yet exploited) backlog items
        return json.items
          .filter((item) => !item.is_implemented)
          .map((item): ListingImprovementItem => ({
            id: `backlog-${item.id}`,
            reviewId: item.id,
            reviewText: item.issue_description,
            userName: "",
            score: 0,
            sentimentTag: item.issue_title,
            appId: null,
            packageName: item.package_name ?? null,
            isUtilized: false,
            createdAt: item.created_at,
          }));
      })
      .catch(() => [] as ListingImprovementItem[]);

    void Promise.all([listingImprovementsPromise, backlogPromise])
      .then(([listingRows, backlogRows]) => {
        // Deduplicate: backlog rows are prefixed "backlog-", listing rows have plain UUIDs.
        // Preserve ephemeral url-exploit- stubs — they are never in the DB and would be
        // silently wiped by a full replace. Read from both current state AND sessionStorage
        // to cover the race where the DB fetch completes before the URL-param effect fires.
        setQueuedImprovements((prev) => {
          const stateStubs = prev.filter((item) => item.id.startsWith("url-exploit-"));
          const sessionStubs = readSpotlightStubsFromSession();
          // Merge state stubs + session stubs, deduplicating by id
          const allStubIds = new Set(stateStubs.map((s) => s.id));
          const extraSessionStubs = sessionStubs.filter((s) => !allStubIds.has(s.id));
          const ephemeralStubs = [...stateStubs, ...extraSessionStubs];
          const dbRows = [...listingRows, ...backlogRows];
          const dbIds = new Set(dbRows.map((r) => r.id));
          const freshStubs = ephemeralStubs.filter((s) => !dbIds.has(s.id));
          return [...dbRows, ...freshStubs];
        });
        setQueuedImprovementsLoading(false);
      })
      .catch((error) => {
        // Handle fetch errors gracefully
        console.error('[ListingOptimizer] Failed to refresh queued improvements:', error instanceof Error ? error.message : error);
        // Keep UI functional — just show empty queue
        setQueuedImprovements((prev) => {
          // Preserve ephemeral stubs even if fetch fails
          return prev.filter((item) => item.id.startsWith("url-exploit-"));
        });
        setQueuedImprovementsLoading(false);
      });
  }, [workspaceId]);

  useEffect(() => {
    refreshQueuedImprovements();
  }, [refreshQueuedImprovements]);

  // ── Google Play connection status ─────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    fetch(`/api/integrations/google-play/status?workspaceId=${workspaceId}`)
      .then((r) => r.json() as Promise<{ ok: boolean; connected: boolean; authorizedEmail: string | null }>)
      .then((data) => {
        if (cancelled) return;
        if (data.ok) {
          setGooglePlayConnected(data.connected);
          setConnectedEmail(data.authorizedEmail);
        }
      })
      .catch(() => { /* non-fatal — publish button just won't show */ });
    return () => { cancelled = true; };
  }, [workspaceId]);

  // ── Queue item deletion ───────────────────────────────────────────────────
  const handleRemoveQueueItem = useCallback(
    (itemId: string) => {
      // Optimistic: remove from local state immediately
      setQueuedImprovements((prev) => {
        const next = prev.filter((item) => item.id !== itemId);
        // Keep sessionStorage in sync when a spotlight stub is removed
        if (itemId.startsWith("url-exploit-")) {
          writeSpotlightStubsToSession(next);
        }
        return next;
      });
      // Skip API call for synthetic url-inject stubs (no DB row)
      if (itemId.startsWith("url-exploit-")) return;
      if (!workspaceId) return;
      // Backlog items are prefixed "backlog-" — mark them as implemented rather than delete
      if (itemId.startsWith("backlog-")) {
        const realId = itemId.replace(/^backlog-/, "");
        void fetch(
          `/api/workspaces/${workspaceId}/backlog/${realId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_implemented: true }),
            credentials: "same-origin",
          },
        ).catch(() => refreshQueuedImprovements());
        return;
      }
      void fetch(
        `/api/workspaces/${workspaceId}/listing-improvements/${itemId}`,
        { method: "DELETE", credentials: "same-origin" },
      ).then((res) => {
        if (!res.ok) {
          // Re-fetch if the server rejected the deletion
          refreshQueuedImprovements();
        }
      }).catch(() => {
        refreshQueuedImprovements();
      });
    },
    [workspaceId, refreshQueuedImprovements],
  );

  // ── Remove signal from staging vault ──────────────────────────────────────
  const handleRemoveFromStagingVault = useCallback(
    (signalId: string) => {
      if (!workspaceId) return;

      // Optimistically remove from context
      if (optimizerContext) {
        // This would require a more complex state update
        // For now, just call the API and refresh
      }

      void fetch(
        `/api/workspaces/${workspaceId}/staging/delete`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signalId }),
          credentials: "same-origin",
        },
      ).then((res) => {
        if (res.ok) {
          // Refresh optimizer context after deletion
          refreshOptimizerContext();
        }
      }).catch((err) => {
        console.error("Failed to delete signal from staging vault:", err);
        // Refresh to show current state
        refreshOptimizerContext();
      });
    },
    [workspaceId, refreshOptimizerContext],
  );

  // ── Remove individual keyword from staging vault ──────────────────────────
  const handleRemoveKeyword = useCallback(
    (keywordId: string, signalId: string) => {
      if (!workspaceId) {
        console.error("[ListingOptimizer] ❌ REMOVAL FAILED: No workspaceId");
        return;
      }

      // Extract keyword term from keywordId (format: "{signalId}-{term}")
      const keywordTerm = keywordId.split('-').slice(1).join('-');

      console.log("[ListingOptimizer] 🗑️ GRANULAR KEYWORD DELETION (EN/AR SUPPORT):", {
        keywordId,
        keywordTerm,
        signalId,
        workspaceId,
        locale,
        timestamp: new Date().toISOString(),
      });

      // ✅ GRANULAR DELETION: Remove just this keyword from the signal
      const deletePayload = {
        signalId,
        keywordTerm,  // ✅ Pass the keyword term for granular deletion
      };

      console.log("[ListingOptimizer] 📤 SENDING DELETE REQUEST:", {
        endpoint: `/api/workspaces/${workspaceId}/staging/delete`,
        payload: deletePayload,
      });

      void fetch(
        `/api/workspaces/${workspaceId}/staging/delete`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(deletePayload),
          credentials: "same-origin",
        },
      ).then(async (res) => {
        const resBody = await res.json();

        if (res.ok) {
          console.log("[ListingOptimizer] ✅ DELETE SUCCESSFUL:", {
            status: res.status,
            response: resBody,
          });

          // Refresh optimizer context after deletion
          console.log("[ListingOptimizer] 🔄 INVALIDATING QUERY to refresh optimizer context...");
          refreshOptimizerContext();

          console.log("[ListingOptimizer] ✅ Keyword removed successfully, context refreshed");
        } else {
          console.error("[ListingOptimizer] ❌ DELETE FAILED:", {
            status: res.status,
            response: resBody,
          });
          refreshOptimizerContext();
        }
      }).catch((err) => {
        console.error("[ListingOptimizer] ❌ ERROR REMOVING KEYWORD:", {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : 'no stack',
        });
        refreshOptimizerContext();
      });
    },
    [workspaceId, locale, refreshOptimizerContext],
  );
  // ─────────────────────────────────────────────────────────────────────────

  // ── exploit_targets + market_tip URL params → queue injection ───────────
  // When the user navigates here from Market Intel or Competitor Spy with
  // ?exploit_targets=…, synthesise stub ListingImprovementItem entries from
  // the encoded labels, merge them into queuedImprovements, show a toast,
  // then clear BOTH exploit_targets and market_tip from the URL so they
  // don't persist in the address bar or re-fire on re-render.
  //
  // ID slug sanitisation: strip all non-alphanumeric characters (colon, dot,
  // percent, etc.) from the slug portion of the id so Framer Motion's internal
  // key tracking never receives special characters that could break its Map
  // lookups or CSS selector generation.
  useEffect(() => {
    const raw = searchParams.get("exploit_targets");
    const rawTip = searchParams.get("market_tip");

    // Nothing to do if neither param is present
    if (!raw?.trim() && !rawTip?.trim()) return;

    if (raw?.trim()) {
      // searchParams.get() already percent-decodes the value — no need for a
      // manual decodeURIComponent call. Calling it again would double-decode
      // values like "%2520" → "%20" → " " instead of the intended "%20" → " ".
      const labels = raw
        .trim()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (labels.length) {
        const stubs: ListingImprovementItem[] = labels.map((label, i) => {
          // Produce a safe DOM/Framer-Motion-friendly id slug:
          // replace any non-word character (colons, dots, slashes, etc.) with a dash,
          // collapse consecutive dashes, and trim leading/trailing dashes.
          const safeSlug = label
            .toLowerCase()
            .replace(/[^\w]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 60);
          return {
            id: `url-exploit-${i}-${safeSlug || "kw"}`,
            reviewId: `url-exploit-${i}`,
            reviewText: label,
            userName: "",
            score: 0,
            sentimentTag: label,
            appId: null,
            packageName: null,
            isUtilized: false,
            createdAt: new Date().toISOString(),
          };
        });

        setQueuedImprovements((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const fresh = stubs.filter((s) => !existingIds.has(s.id));
          if (!fresh.length) return prev;
          const next = [...prev, ...fresh];
          // Persist spotlight stubs to sessionStorage so they survive the
          // refreshQueuedImprovements DB-fetch replace that fires on mount.
          writeSpotlightStubsToSession(next);
          return next;
        });

        // Determine whether these are market spotlight keywords or review-based issues
        const spotlightLabels = labels.filter((l) => l.startsWith("market_spotlight:"));
        const reviewLabels = labels.filter((l) => !l.startsWith("market_spotlight:"));
        const hasSpotlight = spotlightLabels.length > 0;
        const hasReviews = reviewLabels.length > 0;

        if (hasSpotlight) {
          const spotlightCount = spotlightLabels.length;
          toast.success(
            spotlightCount === 1
              ? "1 market keyword loaded into optimizer"
              : `${spotlightCount} market keywords loaded into optimizer`,
            {
              description: "Market Intelligence spotlight will be woven into your listing. Go to Step 3 to generate.",
              duration: 7000,
            },
          );
        }
        if (hasReviews) {
          const reviewCount = reviewLabels.length;
          toast.success(
            reviewCount === 1
              ? "1 review insight loaded"
              : `${reviewCount} review insights loaded`,
            {
              description: t("activeQueue.exploitTargetsToastDescription"),
              duration: 6000,
            },
          );
        }
      }
    }

    // Clear BOTH params from the URL in a single replace call.
    // Build the new search string from current searchParams directly rather
    // than re-parsing searchParams.toString() (which may re-encode values
    // and cause a second effect fire if the result differs from the current URL).
    try {
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("exploit_targets");
      sp.delete("market_tip");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    } catch { /* navigation errors are non-fatal */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    function onInjected() {
      keywordsPrefillAppliedRef.current = false;
      injectionConsumedForNavRef.current = false;
      optimizerSessionRestoredRef.current = false;
      applyOptimizerKeywordInjection();
    }
    window.addEventListener(OPTIMIZER_KEYWORDS_INJECTED_EVENT, onInjected);
    return () => window.removeEventListener(OPTIMIZER_KEYWORDS_INJECTED_EVENT, onInjected);
  }, [applyOptimizerKeywordInjection]);

  useEffect(() => {
    if (optimizerSessionRestoredRef.current) return;
    if (keywordsPrefillAppliedRef.current) return;
    if (hasPlaystoreInjectedKeywordContext()) return;
    if (appsBusy || appsQuery.isError) return;
    if (appsList.length > 0 && !selectedAppId.trim()) return;

    const session = readListingOptimizerSession();
    if (!session) return;
    optimizerSessionRestoredRef.current = true;

    if (appsList.length > 0 && appsList.some((a) => a.id === session.appId)) {
      if (selectedAppId !== session.appId) {
        workspacePickerPrevIdRef.current = session.appId;
        setSelectedAppId(session.appId);
      }
    }
    setKeywords(session.keywords);
    setAppName(session.appName);
    setCategory(session.category);
    setFeatures(session.features);
    setToneStyle(session.toneStyle as ToneStyle);
    setPreviewShortDesc(session.previewShortDesc);
    setPreviewIconUrl(session.previewIconUrl);
    // Do NOT suppress hydration or clear generated output here.
    // Session restore only repopulates form inputs (keywords, features, etc.)
    // from the user's last edit session. The DB hydration effect
    // (/api/listings/latest) runs independently and will restore the result
    // panel — suppressing it here would block that restore on every page load
    // and bounce-back, wiping the ASO score and listing.
    // suppressListingHydrationRef is only set by keyword injection (Competitor Spy
    // → Optimizer flow), which has its own clearOptimizerGeneratedOutputs() call.
  }, [
    appsBusy,
    appsQuery.isError,
    appsList,
    clearOptimizerGeneratedOutputs,
    selectedAppId,
  ]);

  useEffect(() => {
    const aid = selectedAppId.trim();
    if (!aid) return;
    writeListingOptimizerSession({
      appId: aid,
      keywords,
      appName: displayAppName || appName,
      category,
      features,
      toneStyle,
      previewShortDesc,
      previewIconUrl,
    });
  }, [
    selectedAppId,
    keywords,
    appName,
    category,
    features,
    toneStyle,
    previewShortDesc,
    previewIconUrl,
  ]);

  useEffect(() => {
    const appId = selectedAppId.trim();
    if (!workspaceId || !appId) {
      setLocalizedMarkets([]);
      setLocalizeInputExpanded(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/listings/localize?appId=${encodeURIComponent(appId)}`,
        );
        const data = (await res.json()) as
          | { ok: true; markets: LocalizedMarketRecord[] }
          | { ok: false };
        if (cancelled || !data.ok) return;
        setLocalizedMarkets(data.markets);
        setLocalizeInputExpanded(data.markets.length === 0);
        setActiveMarket((prev) =>
          data.markets.some((m) => m.market === prev)
            ? prev
            : defaultActiveLocalizeMarket(data.markets),
        );
      } catch {
        /* non-blocking */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, selectedAppId]);

  const canSubmit = useMemo(() => {
    const appGateOk =
      appsList.length === 0 || Boolean(selectedAppId.trim());
    return (
      Boolean(workspaceId) &&
      appGateOk &&
      displayAppName.length > 0 &&
      category.trim().length > 0 &&
      keywords.trim().length > 0 &&
      features.trim().length > 0 &&
      !loading &&
      !isProcessingCredits
    );
  }, [
    workspaceId,
    appsList.length,
    selectedAppId,
    displayAppName,
    category,
    keywords,
    features,
    loading,
    isProcessingCredits,
  ]);

  const planLabelForLimits = limits.data
    ? PLAN_META[normalizePlan(limits.data.plan)].label
    : "";

  function onWorkspaceAppChange(id: string) {
    setSelectedAppId(id);
    if (id) {
      generateNoAppToastShownRef.current = false;
    }
    if (!id) {
      workspacePickerPrevIdRef.current = "";
      setPreviewShortDesc("");
      setPreviewIconUrl("");
      setPickAppGate(false);
      return;
    }

    const row = appsQuery.data?.find((a) => a.id === id);
    if (!row) return;

    const prevPickerId = workspacePickerPrevIdRef.current;
    const switchingApps = prevPickerId !== id;
    workspacePickerPrevIdRef.current = id;

    const appRowMeta = readAppListingMeta(row.metadata, row.icon_url);
    const previewIcon = resolveListingPreviewIconUrl({
      iconUrlColumn: row.icon_url,
      metadata: row.metadata,
    });
    const displayName = row.name.trim();

    const hyd = hydrationByApp[id];
    const suppressHydration = suppressListingHydrationRef.current;

    if (hyd) {
      setAppName(displayName);
      if (!suppressHydration) {
        setCategory(hyd.category.trim() || appRowMeta.category);
        setKeywords(hyd.keywordsText);
        setFeatures(hyd.appFeatures);
        setToneStyle(hyd.toneStyle);
        setListingGenerationId(hyd.generationId);
        setLastGeneratedAtIso(hyd.createdAt);
      } else if (switchingApps) {
        setCategory(appRowMeta.category);
      }
      setMeta(undefined);
      if (hyd.output && !suppressHydration) {
        applyCachedOrHydratedListingOutput(
          id,
          hyd.output,
          hyd.createdAt,
          hyd.generationId,
        );
        writeFinalListingCache(
          id,
          listingOutputToFinalListingCache(
            hyd.output,
            hyd.createdAt,
            hyd.generationId,
          ),
        );
      } else if (!suppressHydration) {
        if (!purgedAwaitingGenerateRef.current) {
          const cacheRestored = tryApplyFinalListingCache(id);
          if (!cacheRestored && !resultRef.current) {
            setWizardStep(0);
            setWizardPanelPeek({});
            setResult(null);
            setEditedTitle("");
            setEditedShort("");
            setEditedLong("");
          }
        }
        if (purgedAwaitingGenerateRef.current && !resultRef.current) {
          setWizardStep(0);
          setWizardPanelPeek({});
          setResult(null);
          setEditedTitle("");
          setEditedShort("");
          setEditedLong("");
        }
      }
      if (!suppressHydration && (switchingApps || !previewShortDesc.trim())) {
        setPreviewShortDesc(appRowMeta.shortDescription);
      }
      if (!suppressHydration && (switchingApps || !previewIconUrl.trim())) {
        setPreviewIconUrl(previewIcon);
      }
      setPickAppGate(false);
      return;
    }

    // Picker-driven prefill: when the user selects a different workspace app,
    // always sync name + metadata-backed fields from that row (including default
    // Play titles like "Primary Google Play app" and empty metadata). When the
    // selection id is unchanged, only fill fields that are still empty so we do
    // not overwrite edits mid-session. (Native `<select>` only fires onChange on
    // real changes, so "switching apps" is the common path.)
    if (switchingApps || !appName.trim()) {
      setAppName(displayName);
    }
    if (!suppressHydration && (switchingApps || !category.trim())) {
      setCategory(appRowMeta.category);
    }
    if (!suppressHydration && (switchingApps || !previewShortDesc.trim())) {
      setPreviewShortDesc(appRowMeta.shortDescription);
    }
    if (!suppressHydration && (switchingApps || !previewIconUrl.trim())) {
      setPreviewIconUrl(previewIcon);
    }
    if (switchingApps) {
      setWizardStep(0);
      setWizardPanelPeek({});
      setResult(null);
      setEditedTitle("");
      setEditedShort("");
      setEditedLong("");
      setListingGenerationId(undefined);
      setLastGeneratedAtIso(null);
      setMeta(undefined);
    }
    setPickAppGate(false);
  }

  useEffect(() => {
    if (appsBusy || appsQuery.isError) return;
    if (appsList.length === 0) return;
    if (selectedAppId) return;
    if (autoPickedInitialAppRef.current) return;
    autoPickedInitialAppRef.current = true;
    onWorkspaceAppChange(appsList[0].id);
    // `onWorkspaceAppChange` is stable enough for this one-shot init; listing deps would retrigger every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appsBusy, appsQuery.isError, appsList, selectedAppId]);

  useEffect(() => {
    if (appsBusy || appsQuery.isError) return;
    if (appsList.length > 0) return;
    if (!initialHydrationNoApp || appliedNoAppHydrationRef.current) return;
    appliedNoAppHydrationRef.current = true;
    const hyd = initialHydrationNoApp;
    const suppressHydration = suppressListingHydrationRef.current;
    setAppName(suppressHydration ? "" : hyd.appName);
    if (!suppressHydration) {
      setCategory(hyd.category);
      setKeywords(hyd.keywordsText);
      setFeatures(hyd.appFeatures);
      setToneStyle(hyd.toneStyle);
      setListingGenerationId(hyd.generationId);
      setLastGeneratedAtIso(hyd.createdAt);
    }
    if (hyd.output && !suppressHydration) {
      setResult(hyd.output);
      setWizardStep(2);
      setWizardPanelPeek({});
      setEditedTitle(hyd.output.title);
      setEditedShort(hyd.output.shortDescription);
      setEditedLong(hyd.output.fullDescription);
    }
  }, [
    appsBusy,
    appsQuery.isError,
    appsList.length,
    initialHydrationNoApp,
  ]);

  /** Keep Target Keywords / Features (and listing blocks) aligned with `listing_generations` after refresh and when switching apps. */
  useEffect(() => {
    const ws = workspaceId?.trim();
    const aid = selectedAppId.trim();
    if (!ws || !aid) return;

    const ac = new AbortController();

    void (async () => {
      try {
        const res = await fetch(
          `/api/listings/latest?workspaceId=${encodeURIComponent(ws)}&appId=${encodeURIComponent(aid)}`,
          { credentials: "include", signal: ac.signal },
        );
        const raw = await res.text();
        let parsed: unknown;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch {
          return;
        }
        const body = parsed as {
          ok?: boolean;
          data?: ListingOptimizerHydrationPayload | null;
        };
        if (ac.signal.aborted || body.ok !== true) return;

        if (suppressListingHydrationRef.current) {
          if (body.data) {
            setHydrationByApp((prev) => ({ ...prev, [aid]: body.data! }));
          }
          setPickAppGate(false);
          return;
        }

        const hyd = body.data;
        const row = appsList.find((a) => a.id === aid);
        const displayName = row?.name.trim() ?? "";
        const appRowMeta = row
          ? readAppListingMeta(row.metadata, row.icon_url)
          : { category: "", shortDescription: "", iconUrl: "" };

        if (!hyd) {
          setHydrationByApp((prev) => {
            const next = { ...prev };
            delete next[aid];
            return next;
          });
          if (row) {
            const suppressNoHyd = suppressListingHydrationRef.current;
            setAppName(displayName);
            if (!suppressNoHyd) {
              setCategory((prev) => prev.trim() || appRowMeta.category);
              setPreviewShortDesc(appRowMeta.shortDescription);
              setPreviewIconUrl(appRowMeta.iconUrl);
            }
            if (!purgedAwaitingGenerateRef.current && !suppressNoHyd) {
              const cacheRestored = tryApplyFinalListingCache(aid);
              if (!cacheRestored && !resultRef.current) {
                setListingGenerationId(undefined);
                setLastGeneratedAtIso(null);
                setMeta(undefined);
                setWizardStep(0);
                setWizardPanelPeek({});
                setResult(null);
                setEditedTitle("");
                setEditedShort("");
                setEditedLong("");
              }
            }
          }
          setPickAppGate(false);
          return;
        }

        setHydrationByApp((prev) => ({ ...prev, [aid]: hyd }));

        const suppressHydrationAsync = suppressListingHydrationRef.current;
        setAppName(displayName);
        if (!suppressHydrationAsync) {
          setCategory(hyd.category.trim() || appRowMeta.category);
          setKeywords(hyd.keywordsText);
          setFeatures(hyd.appFeatures);
          setToneStyle(hyd.toneStyle);
          setListingGenerationId(hyd.generationId);
          setLastGeneratedAtIso(hyd.createdAt);
        }
        setMeta(undefined);
        if (hyd.output && !suppressHydrationAsync) {
          applyCachedOrHydratedListingOutput(
            aid,
            hyd.output,
            hyd.createdAt,
            hyd.generationId,
          );
          writeFinalListingCache(
            aid,
            listingOutputToFinalListingCache(
              hyd.output,
              hyd.createdAt,
              hyd.generationId,
            ),
          );
        } else if (!suppressHydrationAsync) {
          // hyd.output is null — the DB returned an inputs-only row (e.g. from autofill).
          // Only clear result if:
          //   (a) there is no live result currently in state (resultRef), AND
          //   (b) localStorage has nothing to restore.
          // Never wipe a live result — doing so causes the ASO score to vanish on
          // refresh / page bounce when router.refresh() re-triggers this effect
          // before the DB two-pass query can find the prior generation row.
          if (!purgedAwaitingGenerateRef.current) {
            const cacheRestored = tryApplyFinalListingCache(aid);
            if (!cacheRestored && !resultRef.current) {
              setWizardStep(0);
              setWizardPanelPeek({});
              setResult(null);
              setEditedTitle("");
              setEditedShort("");
              setEditedLong("");
            }
          }
          // purgedAwaitingGenerate is set by keyword injection — in that case we do
          // want to stay on the "awaiting generate" empty canvas, but only if there
          // really is no result already showing.
          if (purgedAwaitingGenerateRef.current && !resultRef.current) {
            setWizardStep(0);
            setWizardPanelPeek({});
            setResult(null);
            setEditedTitle("");
            setEditedShort("");
            setEditedLong("");
          }
        }
        if (!suppressHydrationAsync) {
          setPreviewShortDesc(appRowMeta.shortDescription);
          setPreviewIconUrl(appRowMeta.iconUrl);
        }
        setPickAppGate(false);
      } catch {
        /* aborted or network */
      }
    })();

    return () => ac.abort();
    // Intentionally omit appsList, appsBusy, appsQuery.isError from deps:
    // – appsList: causes refetch on every background apps-query update
    // – appsBusy / appsQuery.isError: cause refetch on every router.refresh() (e.g.
    //   after autofill), which races the just-written inputs-only DB row and can
    //   return hyd.output=null, wiping the live result.
    // The effect only needs to re-run when the workspace or the selected app changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, selectedAppId, applyCachedOrHydratedListingOutput]);

  /**
   * Final-listing hydration guard — fires synchronously when `selectedAppId`
   * resolves so F5 refresh shows results before /api/listings/latest returns.
   *
   * Hydration order (output blocks): playstore_final_listing_{id} (with one-time
   * legacy read of playstore_last_generated_ / playstore_saved_listing_), then
   * async DB via /api/listings/latest. Skipped when injection suppresses hydration
   * or purgedAwaitingGenerate is true.
   */
  useEffect(() => {
    const aid = selectedAppId.trim();
    if (!aid || aid === "undefined") return;
    if (suppressListingHydrationRef.current) return;
    if (result) return;
    if (purgedAwaitingGenerateRef.current) return;
    tryApplyFinalListingCache(aid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppId, tryApplyFinalListingCache]);

  function tryOpenAddApp() {
    if (!workspaceId) return;
    const pre = precheckAddApp(limits);
    if (pre.outcome === "deny_wait") return;
    if (pre.outcome === "deny_limits_failed") return;
    if (pre.outcome === "deny_upgrade") {
      toast.message(t("appContext.atLimitToast"), {
        description: pre.snapshot.message ?? t("appContext.atLimitToastHint"),
      });
      setUpgradeOpen(true);
      return;
    }
    setAddAppOpen(true);
  }

  function applyCreatedApp(app: CreatedWorkspaceApp) {
    workspacePickerPrevIdRef.current = app.id;
    setSelectedAppId(app.id);
    setAppName(app.name.trim());
    const meta = readAppListingMeta(app.metadata, app.icon_url);
    setCategory(meta.category);
    setPreviewShortDesc(meta.shortDescription);
    setPreviewIconUrl(meta.iconUrl);
    toast.success(tAddApp("toast.success"));
  }

  function goToSettingsHome() {
    if (!workspaceId) return;
    router.push(`/app/${workspaceId}/settings`);
  }

  function handleNavigateToReviews() {
    if (!workspaceId) return;
    router.push(`/app/${workspaceId}/reviews`);
  }

  function clearAutofillGate(field: "appName" | "category") {
    setAutofillGate((g) => {
      const next = { ...g };
      delete next[field];
      return next;
    });
  }

  function requestAutofill(field: AutofillField) {
    setCreditConfirmPending({ kind: "autofill", field });
  }

  async function runAutofill(field: AutofillField) {
    if (!workspaceId) {
      setError(t("appContext.missingWorkspaceId"));
      return;
    }
    if (appsList.length > 0 && !selectedAppId.trim()) {
      setPickAppGate(true);
      if (!generateNoAppToastShownRef.current) {
        generateNoAppToastShownRef.current = true;
        toast.message(t("appContext.needAppToOptimize"));
      }
      return;
    }
    const nameOk = displayAppName.length > 0;
    const catOk = category.trim().length > 0;
    if (!nameOk || !catOk) {
      setAutofillGate({
        appName: !nameOk ? true : undefined,
        category: !catOk ? true : undefined,
      });
      toast.message(t("form.autofill.validationTitle"), {
        description: t("form.autofill.validationBody"),
      });
      return;
    }
    if (
      typeof aiCreditsRemaining === "number" &&
      aiCreditsRemaining < AI_CREDIT_COSTS.listing_optimizer_autofill
    ) {
      toast.message(t("form.autofill.insufficientTitle"), {
        description: `${t("form.creditsDetail", {
          rem: aiCreditsRemaining,
          req: AI_CREDIT_COSTS.listing_optimizer_autofill,
        })}${t("form.creditsSuffix")}`,
      });
      setUpgradeOpen(true);
      return;
    }
    // Hard debounce: block re-entry before React flushes setAutofillBusy.
    if (isProcessingCredits) return;
    setIsProcessingCredits(true);
    setAutofillGate({});
    setAutofillBusy(field);
    setError(null);
    const autofillToastId = toast.loading(
      t("form.autofill.generatingToast", {
        credits: AI_CREDIT_COSTS.listing_optimizer_autofill,
      }),
    );
    try {
      const res = await fetch("/api/listings/optimizer-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          appName: displayAppName,
          category: category.trim(),
          field,
          language: locale,
          ...(selectedAppId.trim()
            ? {
                appId: selectedAppId.trim(),
                toneStyle,
                keywordsDraft: keywords,
                featuresDraft: features,
              }
            : {}),
        }),
      });
      const json = (await res.json()) as AutofillApiSuccess | ApiError;
      if (!json.ok) {
        if (res.status === 401) {
          toast.error(t("form.signInError"));
        } else if (
          res.status === 402 ||
          json.error.code === "insufficient_credits"
        ) {
          const rem = json.error.remaining;
          const req = json.error.required;
          const suffix =
            typeof rem === "number" && typeof req === "number"
              ? ` ${t("form.creditsDetail", { rem, req })}`
              : "";
          toast.message(t("form.autofill.insufficientTitle"), {
            description: `${json.error.message}${suffix}${t("form.creditsSuffix")}`,
          });
          setUpgradeOpen(true);
          if (typeof rem === "number") {
            setAiCreditsRemaining(rem);
          }
        } else {
          toast.error(json.error.message || t("form.autofill.generationError"));
        }
        return;
      }
      const nextKeywords =
        field === "keywords" ? json.data.text : keywords;
      const nextFeatures =
        field === "features" ? json.data.text : features;
      if (field === "keywords") {
        setKeywords(json.data.text);
      } else {
        setFeatures(json.data.text);
      }

      const sid = selectedAppId.trim();
      const persistedOk = json.meta?.persistedInputs === true;
      const gid = json.meta?.generationId;
      const savedAtIso = json.meta?.savedAt;
      if (sid && persistedOk && gid && savedAtIso) {
        setListingGenerationId(gid);
        setHydrationByApp((prev) => ({
          ...prev,
          [sid]: {
            generationId: gid,
            createdAt: savedAtIso,
            appName: displayAppName,
            category: category.trim(),
            keywordsText: nextKeywords.trim(),
            appFeatures: nextFeatures.trim(),
            toneStyle,
            output: prev[sid]?.output ?? null,
          },
        }));
      } else if (sid && json.meta?.persistedInputs === false) {
        toast.warning(t("form.autofill.persistFailed"));
      }

      const charged =
        json.meta?.creditsCharged ??
        AI_CREDIT_COSTS.listing_optimizer_autofill;
      const remaining = json.meta?.creditsRemaining;
      if (typeof remaining === "number") {
        setAiCreditsRemaining(remaining);
      }
      void router.refresh();
      toast.success(t("form.autofill.successTitle"), {
        description:
          typeof remaining === "number"
            ? t("form.autofill.successCredits", {
                used: charged,
                balance: remaining,
              })
            : t("form.autofill.successDescription"),
      });
    } catch {
      toast.error(t("form.networkError"));
    } finally {
      toast.dismiss(autofillToastId);
      setAutofillBusy(null);
      setIsProcessingCredits(false);
    }
  }

  async function copyText(
    _label: string,
    text: string,
    playConsoleField?: PlayConsoleExportCopyField | "all",
  ) {
    try {
      await navigator.clipboard.writeText(text);
      if (playConsoleField) {
        const fieldName = t(
          `results.exportModal.fieldLabels.${playConsoleField}`,
        );
        toast.success(
          t("results.exportModal.copyToast", { field: fieldName }),
        );
      } else {
        toast.success(t("results.copiedTitle"), {
          description: t("results.copiedDescription"),
        });
      }
    } catch {
      window.prompt(t("results.copyPrompt"), text);
    }
  }

  function copyListingAllBlocks(data: {
    title: string;
    shortDescription: string;
    fullDescription: string;
  }) {
    const sep = "\n\n---\n\n";
    const parts = [
      `${t("results.exportModal.fieldLabels.appNameTitle")}\n${data.title}`,
      `${t("results.exportModal.fieldLabels.shortDescription")}\n${data.shortDescription}`,
      `${t("results.exportModal.fieldLabels.fullDescription")}\n${data.fullDescription}`,
    ];
    return parts.join(sep);
  }

  function downloadPlayConsoleExport() {
    if (!result) return;
    const data = clampedListing;
    const payload = {
      format: "playstore.xyz-listing-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      locale,
      appName: displayAppName,
      category: category.trim(),
      title: data.title,
      shortDescription: data.shortDescription,
      fullDescription: data.fullDescription,
      keywordSuggestions: result.keywordSuggestions,
      ctaSuggestions: result.ctaSuggestions,
      ...(typeof result.asoScore === "number" &&
      result.scoreBreakdown &&
      result.improvementTips &&
      result.improvementTips.length > 0
        ? {
            asoScore: result.asoScore,
            scoreBreakdown: result.scoreBreakdown,
            improvementTips: result.improvementTips,
          }
        : {}),
    };
    const json = JSON.stringify(payload, null, 2);
    const txt = [
      "=== Google Play listing export (PlayStore.xyz) ===",
      `Exported (UTC): ${payload.exportedAt}`,
      `App name: ${payload.appName}`,
      `Category: ${payload.category}`,
      "",
      "--- TITLE (Play Console) ---",
      data.title,
      "",
      "--- SHORT DESCRIPTION ---",
      data.shortDescription,
      "",
      "--- FULL DESCRIPTION ---",
      data.fullDescription,
      "",
      "--- ASO KEYWORD SUGGESTIONS ---",
      result.keywordSuggestions.join(", "),
      "",
      "--- CTA SUGGESTIONS ---",
      result.ctaSuggestions.join("\n"),
      "",
      "--- JSON (same data, machine-readable) ---",
      json,
    ].join("\n");

    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `play-console-listing-${workspaceId ?? "export"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("results.exportSuccess"));
  }

  async function runListingGeneration(opts: {
    mode: "fresh" | "regenerate";
    userInstruction?: string;
    targetArabicOverride?: boolean;
  }) {
    if (!workspaceId) {
      setError(t("appContext.missingWorkspaceId"));
      return;
    }
    if (appsList.length > 0 && !selectedAppId.trim()) {
      setPickAppGate(true);
      if (!generateNoAppToastShownRef.current) {
        generateNoAppToastShownRef.current = true;
        toast.message(t("appContext.needAppToOptimize"));
      }
      return;
    }
    if (
      displayAppName.length === 0 ||
      category.trim().length === 0 ||
      keywords.trim().length === 0 ||
      features.trim().length === 0
    ) {
      return;
    }
    if (loading) return;
    // Hard debounce: block re-entry even before React flushes the `loading` state update.
    if (isProcessingCredits) return;
    setIsProcessingCredits(true);

    setError(null);
    if (opts.mode === "fresh") {
      setResult(null);
      setMeta(undefined);
      setListingGenerationId(undefined);
      setLastGeneratedAtIso(null);
    }

    if (
      typeof aiCreditsRemaining === "number" &&
      aiCreditsRemaining < AI_CREDIT_COSTS.listing_generation
    ) {
      toast.message(t("form.autofill.insufficientTitle"), {
        description: `${t("form.creditsDetail", {
          rem: aiCreditsRemaining,
          req: AI_CREDIT_COSTS.listing_generation,
        })}${t("form.creditsSuffix")}`,
      });
      setUpgradeOpen(true);
      setIsProcessingCredits(false);
      return;
    }
    const runToastId = toast.loading(
      t("form.generateStarting", {
        credits: AI_CREDIT_COSTS.listing_generation,
      }),
    );
    setLoading(true);
    // Snapshot the queue before generation — used for "Optimization Factors" pills
    setGenerationQueueSnapshot([...queuedImprovements]);
    try {
      // ── Competitor inversion directive ────────────────────────────────────
      // If the Exploit bridge injected competitor pain-points, prepend a
      // one-time system instruction that inverts them into positive positioning
      // angles. Consumed here and cleared so it never leaks into a re-generate.
      // Use the UI-visible state if present (user may have removed some pills);
      // fall back to the raw ref for programmatic invocations.
      const vulns = competitorWeaknesses.length > 0
        ? competitorWeaknesses
        : competitorVulnerabilitiesRef.current;
      competitorVulnerabilitiesRef.current = [];
      setCompetitorWeaknesses([]);
      const inversionDirective =
        vulns.length > 0
          ? `Tracked competitor analysis has surfaced the following active user pain-points across rival apps: ${vulns.join("; ")}. DO NOT mention these issues literally in the listing. Instead, aggressively position our app as the definitive solution — emphasise stability, accuracy, seamless synchronisation, and a clean ad-free experience that directly resolves each of these rival weaknesses. Where multiple competitors share the same pain-point, treat it as a high-priority differentiation signal. Keep all target keywords positive and optimised for high-volume Play Store indexing.`
          : "";
      // ── Split queued items by type ────────────────────────────────────────
      // Spotlight items (market_spotlight: prefix on sentimentTag) travel as
      // exploitTargets[] — the v10 prompt builder routes them into SYNTHESIS
      // PRIORITY 2 (EXPLOIT MARKET INTELLIGENCE block).
      // Review-based issues travel as userInstruction via the improvements
      // directive — SYNTHESIS PRIORITY 1 (FIX & REASSURE block).
      const spotlightQueueItems = queuedImprovements.filter(
        (item) => item.sentimentTag?.startsWith("market_spotlight:"),
      );
      const reviewQueueItems = queuedImprovements.filter(
        (item) => !item.sentimentTag?.startsWith("market_spotlight:"),
      );

      // Build exploit targets — keep the "market_spotlight:" prefix so the
      // server-side prompt builder can split them correctly (buildUserMessage
      // already does .filter(t => t.startsWith("market_spotlight:"))).
      const exploitTargets: string[] = spotlightQueueItems.map(
        (item) => item.sentimentTag!.trim(),
      );

      const improvementsDirective = buildListingImprovementsGenerateDirective(
        reviewQueueItems,
      );
      const effectiveInstruction = [
        inversionDirective,
        improvementsDirective,
        opts.userInstruction,
      ]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join("\n\n");

      const trackedKeywordSignals = keywordSignals.map((s) => ({
        keyword: s.keyword,
        confidence: s.confidence,
        difficulty: s.difficulty,
        searchVolume: s.searchVolume,
        liveRankSummary:
          formatLiveRankIndicators(s.liveRanks).join(", ") || undefined,
      }));

      const seedKwList = keywords
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const trackedTerms = [...keywordSignals]
        .sort((a, b) => b.confidence - a.confidence)
        .map((s) => s.keyword);
      const mergedKeywords = [
        ...new Set([...trackedTerms, ...seedKwList]),
      ].slice(0, 40);

      const res = await fetch("/api/listings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          ...(selectedAppId.trim() ? { appId: selectedAppId.trim() } : {}),
          appName: displayAppName,
          category: category.trim(),
          targetKeywords:
            mergedKeywords.length > 0 ? mergedKeywords : keywords.trim(),
          appFeatures: features.trim(),
          toneStyle,
          targetArabic: opts.targetArabicOverride ?? locale === "ar",
          ...(effectiveInstruction
            ? { userInstruction: effectiveInstruction }
            : {}),
          // Market spotlight keywords from Market Intelligence → SYNTHESIS PRIORITY 2
          ...(exploitTargets.length > 0 ? { exploitTargets } : {}),
          ...(trackedKeywordSignals.length > 0
            ? { trackedKeywordSignals }
            : {}),
          // Active signal types — used server-side to compute quality_status / quality_warning meta.
          activeSignalTypes: [
            ...(keywordSignals.length > 0 ? (["keywords"] as const) : []),
            ...(reviewQueueItems.length > 0 ? (["reviews"] as const) : []),
            ...(spotlightQueueItems.length > 0 ? (["market"] as const) : []),
            ...(vulns.length > 0 ? (["competitors"] as const) : []),
          ],
        }),
      });
      const json = (await res.json()) as ApiSuccess | ApiError;
      toast.dismiss(runToastId);
      if (!json.ok) {
        if (res.status === 401) {
          setError(t("form.signInError"));
        } else if (json.error.code === "duplicate_request") {
          // A generation is already running for this workspace — silently discard
          // the duplicate. The in-flight request will complete and update the UI.
          // No error message, no credit deduction — safe to ignore.
          return;
        } else if (
          res.status === 402 ||
          json.error.code === "insufficient_credits"
        ) {
          const rem = json.error.remaining;
          const req = json.error.required;
          const suffix =
            typeof rem === "number" && typeof req === "number"
              ? ` ${t("form.creditsDetail", { rem, req })}`
              : "";
          setError(`${json.error.message}${suffix}${t("form.creditsSuffix")}`);
          setUpgradeOpen(true);
          if (typeof rem === "number") {
            setAiCreditsRemaining(rem);
          }
        } else {
          setError(json.error.message || t("form.networkError"));
        }
        return;
      }
      const d = json.data;
      setError(null);
      suppressListingHydrationRef.current = false;
      setPurgedAwaitingGenerate(false);
      setResult(d);
      // Derive the fresh AI-generated keywords and features from the response
      // object — NOT from the closed-over state variables (keywords / features),
      // which still hold the pre-generation user input at this point in the
      // render cycle. Using the closed-over variables here would stamp stale
      // values into hydrationByApp, causing the async /api/listings/latest
      // effect to overwrite the AI copy back to the old text on the next render.
      const freshKeywordsText = d.keywordSuggestions?.length
        ? d.keywordSuggestions.join(", ")
        : keywords.trim();
      const freshFeatures = d.fullDescription?.trim() || features.trim();

      // Back-fill form inputs with AI-suggested content so the user sees
      // what drove the generation and can iterate from it.
      if (d.keywordSuggestions?.length) {
        setKeywords(freshKeywordsText);
      }
      if (freshFeatures && freshFeatures !== features.trim()) {
        setFeatures(freshFeatures);
      }
      // ── Atomic queue → archive transition ────────────────────────────────
      // Snapshot which backlog items were in the queue at success time (before
      // clearing), then fire-and-forget PATCH each one to is_implemented=true.
      // This is atomic from the user's perspective: state clears in the same
      // React batch as the success flags, and the DB writes are best-effort
      // (the Reviews page re-fetches on mount so eventual consistency is fine).
      const backlogIdsToArchive = queuedImprovements
        .filter((item) => item.id.startsWith("backlog-"))
        .map((item) => item.id.replace(/^backlog-/, ""));
      if (workspaceId && backlogIdsToArchive.length > 0) {
        // Fire individually — the PATCH endpoint handles one item at a time.
        for (const realId of backlogIdsToArchive) {
          void fetch(`/api/workspaces/${workspaceId}/backlog/${realId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_implemented: true }),
            credentials: "same-origin",
          }).catch(() => { /* best-effort — Reviews page re-fetches on mount */ });
        }
      }
      // ── Listing Performance Attribution snapshot ──────────────────────────
      // Fire-and-forget: POST a snapshot row capturing the exact listing copy,
      // signals used, and strategy meta so the ListingHistory attribution
      // engine can later compute before/after metric deltas.
      // Must run BEFORE clearSpotlightStubsFromSession() and setQueuedImprovements([])
      // so the queue snapshot contains the full signal set.
      if (workspaceId) {
        const snapshotSignals = queuedImprovements.map((item) => item.sentimentTag?.trim() ?? item.reviewText?.slice(0, 80) ?? "");
        const qualityStatus =
          json.meta?.quality_status ? "maximum" : "partial";
        void fetch("/api/listings/snapshots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            workspaceId,
            appId: selectedAppId.trim() || undefined,
            generationId: json.meta?.generationId,
            title: d.title,
            shortDescription: d.shortDescription,
            fullDescription: d.fullDescription,
            signals: snapshotSignals.filter(Boolean),
            strategySummary: d.strategySummary ?? d.strategicNote,
            asoScore: d.asoScore,
            promptVersion: json.meta?.promptVersion,
            toneStyle,
            qualityStatus,
          }),
        }).catch(() => { /* non-fatal — attribution is best-effort */ });
      }
      // ─────────────────────────────────────────────────────────────────────

      // Clear the staging queue — provides clean confirmation state now that
      // the AI has consumed all queued improvements. Also clear sessionStorage
      // so spotlight stubs don't reappear on the next refreshQueuedImprovements.
      clearSpotlightStubsFromSession();
      setQueuedImprovements([]);
      setGenerateJustSucceeded(true);
      setWizardStep(2);
      setWizardPanelPeek({});
      setEditedTitle(d.title);
      setEditedShort(d.shortDescription);
      setEditedLong(d.fullDescription);
      setMeta(json.meta);
      const generationIdFromApi = json.meta?.generationId;
      setListingGenerationId(generationIdFromApi);
      const savedIso =
        json.meta?.savedAt ?? new Date().toISOString();
      setLastGeneratedAtIso(savedIso);
      const sid = selectedAppId.trim();
      if (sid) {
        writeFinalListingCache(
          sid,
          listingOutputToFinalListingCache(d, savedIso, generationIdFromApi),
        );
      }
      // Back-patch the listing_generations row with AI-derived values so that a
      // hard page reload hydrates the AI copy rather than the pre-generation
      // user input. Best-effort: fire-and-forget, never blocks the UI.
      if (generationIdFromApi) {
        const kws = d.keywordSuggestions?.length
          ? d.keywordSuggestions
          : keywords.trim().split(/\s*,\s*/).filter(Boolean);
        void fetch("/api/listings/generate", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            generationId: generationIdFromApi,
            appFeatures: freshFeatures,
            targetKeywords: kws,
          }),
        }).catch(() => {
          // Best-effort — swallow silently
        });
      }
      if (generationIdFromApi && sid) {
        const gid = generationIdFromApi;
        setHydrationByApp((prev) => ({
          ...prev,
          [sid]: {
            generationId: gid,
            createdAt: savedIso,
            appName: displayAppName,
            category: category.trim(),
            // Use the fresh AI-derived values so the in-memory hydration
            // snapshot matches what was just written to localStorage and DB.
            // This prevents the async /api/listings/latest refetch from
            // overwriting these fields back to the pre-generation text.
            keywordsText: freshKeywordsText,
            appFeatures: freshFeatures,
            toneStyle,
            output: d,
          },
        }));
      }
      if (json.meta?.persisted === false) {
        toast.warning(t("results.persistWarning"));
      } else {
        toast.success(t("form.generateSuccessToastSaved"));
      }
      // asoScorePartial: listing is fully generated — the ASO score section
      // is an optional metric. Silently skip it; don't show a warning toast
      // that confuses users into thinking generation failed.
    } catch {
      toast.dismiss(runToastId);
      setError(t("form.networkError"));
    } finally {
      setLoading(false);
      setIsProcessingCredits(false);
    }
  }


  async function trackKeywordsInKeywordTracker() {
    if (!workspaceId?.trim()) return;
    if (!selectedAppId.trim()) {
      toast.message(t("results.trackKeywords.needApp"));
      return;
    }
    if (!result?.keywordSuggestions?.length) return;
    if (!listingGenerationId) {
      toast.message(t("results.trackKeywords.persistHint"));
      return;
    }

    setTrackKwBusy(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId.trim()}/keywords/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            terms: result.keywordSuggestions,
            appId: selectedAppId.trim(),
            listingGenerationId,
          }),
        },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        creditsCharged?: number;
        creditsRemaining?: number;
        error?: {
          code?: string;
          message?: string;
          remaining?: number;
          required?: number;
        };
      };

      if (!res.ok || !json.ok) {
        if (
          res.status === 402 ||
          json.error?.code === "insufficient_credits"
        ) {
          toast.error(t("results.trackKeywords.insufficient"));
          setUpgradeOpen(true);
          if (typeof json.error?.remaining === "number") {
            setAiCreditsRemaining(json.error.remaining);
          }
          return;
        }
        toast.error(json.error?.message ?? t("results.trackKeywords.error"));
        return;
      }

      toast.success(t("results.trackKeywords.toastSaved"));
      if (typeof json.creditsRemaining === "number") {
        setAiCreditsRemaining(json.creditsRemaining);
      }
    } finally {
      setTrackKwBusy(false);
    }
  }

  function requestListingGeneration() {
    setCreditConfirmPending({ kind: "listing_generation" });
  }

  function handleCreditConfirm() {
    setCreditConfirmPending((pending) => {
      if (!pending) return null;
      if (pending.kind === "listing_generation") {
        void runListingGeneration({ mode: "fresh" });
      } else {
        void runAutofill(pending.field);
      }
      return null;
    });
  }

  const creditConfirmCredits =
    creditConfirmPending?.kind === "listing_generation"
      ? AI_CREDIT_COSTS.listing_generation
      : creditConfirmPending?.kind === "autofill"
        ? AI_CREDIT_COSTS.listing_optimizer_autofill
        : 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    requestListingGeneration();
  }

  const fieldFocus = cn(
    "rounded-xl border border-zinc-800 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35",
    "focus-visible:border-emerald-500/35 focus-visible:shadow-[0_0_0_3px_rgba(52,211,153,0.1)] focus-visible:ring-[0.5px] focus-visible:ring-emerald-400/55",
  );

  const shellClass = embedded
    ? "w-full min-h-0 max-w-full flex-1 rounded-2xl border border-white/[0.09] bg-gradient-to-b from-[#0a100d]/95 via-[#080c11]/98 to-[#06080c] px-0 py-7 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(34,197,94,0.08)] ring-1 ring-[#22C55E]/10 sm:py-9"
    : "min-h-screen bg-[#0B0E14] px-4 py-12 sm:px-6 lg:px-8";

  const showAppsEmpty =
    !appsQuery.isError && !appsBusy && appsList.length === 0;
  const previewConnected = Boolean(selectedAppId || result);
  const canRegenerate = Boolean(canSubmit && result);
  const resultsBusy = Boolean(loading && result);
  const canSaveKeywordsToTracker = Boolean(
    workspaceId &&
      selectedAppId.trim() &&
      listingGenerationId &&
      result?.keywordSuggestions?.length &&
      !resultsBusy,
  );
  const logoGenTriggerDisabled =
    Boolean(resultsBusy) || !workspaceId || !selectedAppId.trim();
  const logoGenTriggerTitle = resultsBusy
    ? undefined
    : !workspaceId
      ? t("appContext.missingWorkspaceId")
      : !selectedAppId.trim()
        ? t("logo.selectAppFirstHint")
        : undefined;

  const clampedListing = useMemo(
    () => clampListingTexts(editedTitle, editedShort, editedLong),
    [editedTitle, editedShort, editedLong],
  );

  const activeLocalized = useMemo(
    () => localizedMarkets.find((m) => m.market === activeMarket),
    [localizedMarkets, activeMarket],
  );

  const hasLocalizedAssets = localizedMarkets.length > 0;
  const showLocalizeMarketPicker =
    !hasLocalizedAssets || localizeInputExpanded;

  const previewFieldsForPhone = useMemo(() => {
    const showLocalizedPhone =
      hasLocalizedAssets &&
      activeLocalized &&
      !(showLocalizeMarketPicker && localizeMarkets.size > 0);

    if (showLocalizedPhone && activeLocalized) {
      return {
        title: activeLocalized.title,
        shortDescription: activeLocalized.shortDescription,
        fullDescription: activeLocalized.longDescription,
      };
    }
    return clampedListing;
  }, [
    activeLocalized,
    clampedListing,
    hasLocalizedAssets,
    showLocalizeMarketPicker,
    localizeMarkets.size,
  ]);

  const previewShortForPhone =
    hasLocalizedAssets &&
    activeLocalized &&
    !(showLocalizeMarketPicker && localizeMarkets.size > 0)
      ? activeLocalized.shortDescription
      : previewShortDesc;

  const phonePreviewDir: "ltr" | "rtl" =
    hasLocalizedAssets &&
    activeLocalized &&
    !(showLocalizeMarketPicker && localizeMarkets.size > 0)
      ? activeLocalized.rtl
        ? "rtl"
        : "ltr"
      : isRtl
        ? "rtl"
        : "ltr";

  const savedMarketCodes = useMemo(
    () => new Set(localizedMarkets.map((m) => m.market)),
    [localizedMarkets],
  );
  const pendingLocalizeMarkets = useMemo(
    () =>
      Array.from(localizeMarkets).filter((code) => !savedMarketCodes.has(code)),
    [localizeMarkets, savedMarketCodes],
  );

  // ── Localization handlers (after clampedListing to avoid TDZ) ────────────
  const localizeTotalCredits = pendingLocalizeMarkets.length * localizeCreditCost;

  function toggleLocalizeMarket(market: LocalizeMarket) {
    setLocalizeMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(market)) next.delete(market);
      else next.add(market);
      return next;
    });
  }

  async function runLocalizeForMarkets(
    markets: LocalizeMarket[],
    options?: { isReGeneration?: boolean },
  ) {
    if (!workspaceId || !selectedAppId.trim() || markets.length === 0 || localizeBusy) {
      return;
    }
    setLocalizeBusy(true);
    setLocalizeError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/listings/localize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appId: selectedAppId.trim(),
            title: clampedListing.title,
            shortDescription: clampedListing.shortDescription,
            longDescription: clampedListing.fullDescription ?? undefined,
            keywords: result?.keywordSuggestions ?? keywords.split(/[,;\n]+/).map((k) => k.trim()).filter(Boolean),
            markets,
            isReGeneration: options?.isReGeneration === true,
          }),
        },
      );
      const data = (await res.json()) as
        | {
            ok: true;
            results: LocalizedMarketRecord[];
            creditsUsed: number;
            failures?: Array<{ market: LocalizeMarket; code: string; message: string }>;
          }
        | { ok: false; error: { code: string; message: string } };

      if (!data.ok) {
        const errCode = (data as { ok: false; error: { code: string } }).error.code;
        setLocalizeError(
          errCode === "insufficient_credits"
            ? t("results.localize.errorInsufficient")
            : t("results.localize.errorGeneral"),
        );
        return;
      }
      const okData = data as {
        ok: true;
        results: LocalizedMarketRecord[];
        creditsUsed: number;
        failures?: Array<{ market: LocalizeMarket; code: string; message: string }>;
      };
      setLocalizedMarkets((prev) => {
        const merged = mergeLocalizedMarkets(prev, okData.results);
        setActiveMarket((activePrev) =>
          okData.results.some((m) => m.market === activePrev)
            ? activePrev
            : defaultActiveLocalizeMarket(merged),
        );
        return merged;
      });
      if (okData.failures?.length) {
        const failedLabels = okData.failures
          .map((f) => {
            if (f.market === "ae") return t("results.localize.marketAe");
            if (f.market === "in") return t("results.localize.marketIn");
            return t("results.localize.marketMx");
          })
          .join(", ");
        setLocalizeError(
          t("results.localize.errorPartial", { markets: failedLabels }),
        );
      }
      if (typeof okData.creditsUsed === "number") {
        setAiCreditsRemaining((prev) =>
          prev !== null ? prev - okData.creditsUsed : null,
        );
      }
      setLocalizeMarkets((prev) => {
        const next = new Set(prev);
        for (const row of okData.results) next.delete(row.market);
        return next;
      });
      if (okData.results.length > 0) {
        setLocalizeInputExpanded(false);
      }
    } catch {
      setLocalizeError(t("results.localize.errorGeneral"));
    } finally {
      setLocalizeBusy(false);
    }
  }

  async function runLocalize() {
    await runLocalizeForMarkets(pendingLocalizeMarkets);
  }

  async function regenerateLocalizedMarket(market: LocalizeMarketCode) {
    setLocalizeRegeneratingMarket(market);
    try {
      await runLocalizeForMarkets([market], { isReGeneration: true });
    } finally {
      setLocalizeRegeneratingMarket(null);
    }
  }

  async function deleteLocalizedMarket(market: LocalizeMarketCode) {
    if (!workspaceId || !selectedAppId.trim() || localizeBusy) return;
    setLocalizeBusy(true);
    setLocalizeError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/listings/localize?appId=${encodeURIComponent(selectedAppId.trim())}&market=${encodeURIComponent(market)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { ok: boolean };
      if (!data.ok) {
        setLocalizeError(t("results.localize.errorDelete"));
        return;
      }
      setLocalizedMarkets((prev) => {
        const next = prev.filter((m) => m.market !== market);
        setActiveMarket((activePrev) =>
          next.some((m) => m.market === activePrev)
            ? activePrev
            : defaultActiveLocalizeMarket(next),
        );
        if (next.length === 0) setLocalizeInputExpanded(true);
        return next;
      });
      setLocalizeMarkets((prev) => {
        const next = new Set(prev);
        next.delete(market);
        return next;
      });
    } catch {
      setLocalizeError(t("results.localize.errorDelete"));
    } finally {
      setLocalizeBusy(false);
    }
  }

  function exportLocalizedMarket(market: LocalizeMarketCode) {
    const record = localizedMarkets.find((m) => m.market === market);
    if (!record) return;
    downloadLocalizedMarketTxt(record);
  }

  function requestRegenerateLocalizedMarket(market: LocalizeMarketCode) {
    setLocalizeRegenerateMarket(market);
    setLocalizeRegenerateConfirmOpen(true);
  }

  function copyLocalizeText(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setLocalizeCopied(key);
      setTimeout(() => setLocalizeCopied(null), 1800);
    });
  }

  function goWizardStep(next: OptimizerWizardStep) {
    setWizardStep(next);
    setWizardPanelPeek({});
  }

  function advanceWizard() {
    setWizardStep((s) => {
      const n = (s >= 2 ? 2 : s + 1) as OptimizerWizardStep;
      return n;
    });
    setWizardPanelPeek({});
  }

  function expandedWizardPanel(step: OptimizerWizardStep) {
    return wizardStep === step || Boolean(wizardPanelPeek[step]);
  }

  function toggleWizardPanelPeek(step: OptimizerWizardStep) {
    if (wizardStep === step) return;
    setWizardPanelPeek((p) => ({ ...p, [step]: !p[step] }));
  }

  const discoverySummary =
    keywords.trim().length > 0
      ? keywords.trim().slice(0, 72) + (keywords.trim().length > 72 ? "…" : "")
      : t("workflow.discoverySummaryEmpty");
  const identitySummary =
    (displayAppName || "—") + " · " + (category.trim() || "—");
  const toneLabel =
    toneStyle === "professional"
      ? t("form.toneProfessional")
      : toneStyle === "friendly"
        ? t("form.toneFriendly")
        : toneStyle === "bold"
          ? t("form.toneBold")
          : t("form.toneMinimal");
  const finalSummary = t("workflow.finalSummaryLine", { tone: toneLabel });

  // ── Active Context Canvas: pre-compute pill groups outside JSX ───────────
  // These MUST be plain variables (not IIFEs inside JSX) so that Framer Motion
  // AnimatePresence can track key identity across renders without frame.join errors.

  // Combine queued improvements with staging vault signals
  const reviewQueuePills = [
    // From listing backlog
    ...queuedImprovements.filter(
      (item) => !item.sentimentTag?.startsWith("market_spotlight:"),
    ).map((item) => ({
      id: item.id,
      label: item.title,
      source: "backlog" as const,
      item,
    })),
    // From staging vault - review_issue signals
    ...(optimizerContext?.activeItems || [])
      .filter((item) => item.signalType === "review_issue")
      .map((item) => ({
        id: item.id,
        label: item.content,
        source: "staging_vault" as const,
        item,
      })),
  ];

  const spotlightQueuePills = [
    // From listing backlog
    ...queuedImprovements.filter(
      (item) => item.sentimentTag?.startsWith("market_spotlight:"),
    ).map((item) => ({
      id: item.id,
      label: item.title,
      source: "backlog" as const,
      item,
    })),
    // From staging vault - keyword/optimization_insight signals
    ...(optimizerContext?.activeItems || [])
      .filter((item) => item.signalType === "keyword" || item.signalType === "optimization_insight")
      .map((item) => ({
        id: item.id,
        label: item.content,
        source: "staging_vault" as const,
        item,
      })),
  ];
  // ─────────────────────────────────────────────────────────────────────────

  // ── Extract individual keywords from staging vault signals ────────────────
  const stagedKeywords = useMemo(() => {
    const extracted = extractKeywordsFromContext(optimizerContext?.activeItems);
    return deduplicateKeywords(extracted);
  }, [optimizerContext?.activeItems]);
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      lang={locale}
      className={cn(
        isRtl && "font-arabic",
        embedded && "flex min-h-0 w-full min-w-0 flex-1 flex-col",
        shellClass,
      )}
    >
      <div
        className={cn(
          embedded && "flex min-h-0 min-w-0 flex-1 flex-col",
        )}
      >
      <OptimizerCreditsConfirmDialog
        open={creditConfirmPending !== null}
        onOpenChange={(open) => {
          if (!open) setCreditConfirmPending(null);
        }}
        credits={creditConfirmCredits}
        isRtl={isRtl}
        onConfirm={handleCreditConfirm}
        showSpyTip={creditConfirmPending?.kind === "autofill"}
        autofillField={creditConfirmPending?.kind === "autofill" ? creditConfirmPending.field : undefined}
        spyHref={workspaceId ? `/app/${workspaceId}/competitors` : undefined}
        onGoToSpy={() => setCreditConfirmPending(null)}
        synthesisContext={
          creditConfirmPending?.kind === "listing_generation"
            ? ((): SynthesisSignalContext => {
                const reviewItems = queuedImprovements
                  .filter((item) => !item.sentimentTag?.startsWith("market_spotlight:"))
                  .map((item) => ({
                    label: item.sentimentTag?.trim() || item.reviewText?.slice(0, 60) || "",
                  }));
                const marketItems = queuedImprovements
                  .filter((item) => item.sentimentTag?.startsWith("market_spotlight:"))
                  .map((item) => ({
                    keyword: item.sentimentTag!.replace(/^market_spotlight:/, "").trim(),
                  }));
                // ✅ INCLUDE STAGED COMPETITOR KEYWORDS (not just weaknesses)
                const competitorItems = [
                  ...stagedKeywords.map((kw) => kw.term),  // Add staged keywords from Competitor Spy
                  ...competitorWeaknesses.slice(0, 3),     // Add manual competitor weaknesses
                ];
                return { reviewItems, marketItems, competitorItems };
              })()
            : undefined
        }
      />

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        plan={limits.data?.plan ?? "free"}
        currentCount={limits.data?.currentCount ?? 0}
        appLimit={limits.data?.limit ?? 1}
        workspaceId={workspaceId}
        onSubscriptionSuccess={() => router.refresh()}
      />

      {workspaceId ? (
        <KeywordValidatorCard
          workspaceId={workspaceId}
          appId={selectedAppId.trim() || undefined}
          vaultLocale={locale}
          isOpen={validatorOpen}
          onClose={() => {
            setValidatorOpen(false);
            setValidatorPrefillKeyword("");
          }}
          initialKeyword={validatorPrefillKeyword}
          onKeywordStaged={() => void refreshOptimizerContext()}
        />
      ) : null}
      {result ? (
        <PlayConsoleExportDialog
          open={exportPlayOpen}
          onOpenChange={setExportPlayOpen}
          dir={isRtl ? "rtl" : "ltr"}
          clamped={clampedListing}
          disabled={resultsBusy}
          onCopy={(field, text) => void copyText("export", text, field)}
          onCopyAllPlayConsole={() =>
            void copyText(
              "play-console-all",
              copyListingAllBlocks(clampedListing),
              "all",
            )
          }
          onDownloadTxt={() => downloadPlayConsoleExport()}
          workspaceId={workspaceId}
          appId={selectedAppId || undefined}
          locale={locale}
          googlePlayConnected={googlePlayConnected ?? false}
          connectedEmail={connectedEmail}
        />
      ) : null}

      {workspaceId ? (
        <AddAppModal
          open={addAppOpen}
          onOpenChange={setAddAppOpen}
          workspaceId={workspaceId}
          limits={limits}
          onRequestUpgrade={() => setUpgradeOpen(true)}
          onSuccess={applyCreatedApp}
          suppressSuccessToast
        />
      ) : null}

      {workspaceId && selectedAppId ? (
        <LogoGeneratorDialog
          open={logoGenOpen}
          onOpenChange={setLogoGenOpen}
          workspaceId={workspaceId}
          appId={selectedAppId}
          appName={displayAppName}
          category={category.trim()}
          shortDescription={previewShortDesc}
          creditsRemaining={aiCreditsRemaining}
          onCreditsRemaining={setAiCreditsRemaining}
          plan={limits.data?.plan ?? "free"}
          onRequestUpgrade={() => setUpgradeOpen(true)}
          initialLogoGenerator={parseLogoGeneratorMetadata(selectedAppRow?.metadata ?? null)}
          onLogoGeneratorPersisted={() => {
            void appsQuery.refetch();
            void router.refresh();
          }}
          onLogoSelected={(url) => {
            setPreviewIconUrl(url);
            if (workspaceId && selectedAppId) {
              queryClient.setQueryData(
                workspaceAppsQueryKey(workspaceId),
                (prev) => {
                  if (!Array.isArray(prev)) return prev;
                  return prev.map((a) =>
                    a.id === selectedAppId
                      ? {
                          ...a,
                          icon_url: url,
                          metadata: {
                            ...(typeof a.metadata === "object" && a.metadata
                              ? a.metadata
                              : {}),
                            icon_url: url,
                          },
                        }
                      : a,
                  );
                },
              );
            }
            void appsQuery.refetch();
            void router.refresh();
          }}
        />
      ) : null}

      <header className="mb-10 space-y-3 sm:mb-14 sm:space-y-3.5">
        {!embedded ? (
          <p className="text-sm font-semibold tracking-wide text-[#4ade80]">{t("eyebrow")}</p>
        ) : null}
        <h1
          className={cn(
            "font-semibold tracking-tight text-white",
            embedded ? "text-2xl sm:text-[1.65rem]" : "text-3xl sm:text-[2.125rem]",
          )}
        >
          {t("title")}
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-white/55 sm:text-base">{t("subtitle")}</p>
        <p
          className="flex max-w-3xl flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium leading-relaxed text-[#86efac]/90 sm:text-[15px]"
          role="status"
          aria-label={[
            t("guidance.selectApp"),
            t("guidance.fillDetails"),
            t("guidance.aiAssist"),
            t("guidance.generate"),
          ].join(", ")}
        >
          <span>{t("guidance.selectApp")}</span>
          <span className="text-[#86efac]/45" aria-hidden>
            {isRtl ? t("guidance.sepRtl") : t("guidance.sepLtr")}
          </span>
          <span>{t("guidance.fillDetails")}</span>
          <span className="text-[#86efac]/45" aria-hidden>
            {isRtl ? t("guidance.sepRtl") : t("guidance.sepLtr")}
          </span>
          <span>{t("guidance.aiAssist")}</span>
          <span className="text-[#86efac]/45" aria-hidden>
            {isRtl ? t("guidance.sepRtl") : t("guidance.sepLtr")}
          </span>
          <span>{t("guidance.generate")}</span>
        </p>
      </header>

      <section
        dir={isRtl ? "rtl" : "ltr"}
        className="mb-11 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-[0_8px_28px_-16px_rgba(0,0,0,0.42)] backdrop-blur-sm sm:mb-14 sm:p-6"
        aria-label={t("appContext.label")}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4ade80]">
              {t("appContext.label")}
            </p>
            <p className="text-sm text-white/55">{t("appContext.hint")}</p>
          </div>
          {limits.data ? (
            <p className="text-xs text-white/45">
              {limits.data.limit === UNLIMITED_APP_SLOTS
                ? t("appContext.usageUnlimited", {
                    count: limits.data.currentCount,
                    plan: planLabelForLimits,
                  })
                : t("appContext.usage", {
                    count: limits.data.currentCount,
                    limit: limits.data.limit,
                    plan: planLabelForLimits,
                  })}
            </p>
          ) : limits.isLoading ? (
            <p className="text-xs text-white/40">{t("appContext.loadingLimits")}</p>
          ) : null}
        </div>

        {!workspaceId ? (
          <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
            {t("appContext.missingWorkspaceId")}
          </div>
        ) : null}

        {limits.isError ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100/90">
            <span>{t("appContext.limitsError")}</span>
            <button
              type="button"
              className="rounded-lg border border-white/15 px-3 py-1 text-xs font-medium text-white hover:bg-white/10"
              onClick={() => void limits.refetch()}
            >
              {t("appContext.retry")}
            </button>
          </div>
        ) : null}

        {appsQuery.isError ? (
          <div className="mt-4 space-y-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-4 text-sm text-red-100/90">
            <p className="font-medium">{t("appContext.appsError")}</p>
            {appsQuery.error instanceof Error && appsQuery.error.message ? (
              <p className="text-xs leading-relaxed text-red-200/75">{appsQuery.error.message}</p>
            ) : null}
            <button
              type="button"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
              onClick={() => void appsQuery.refetch()}
            >
              {t("appContext.retry")}
            </button>
          </div>
        ) : null}

        {appsBusy ? (
          <div className="mt-4 space-y-3" aria-busy="true">
            <p className="text-xs text-white/45">{t("appContext.loadingApps")}</p>
            <div className="h-4 w-40 animate-pulse rounded-md bg-white/10" />
            <div className="h-11 max-w-md animate-pulse rounded-xl bg-white/[0.08]" />
          </div>
        ) : null}

        {!appsQuery.isError && showAppsEmpty ? (
          <div className="mt-4 rounded-xl border border-white/[0.1] bg-[#05070c]/60 px-5 py-6 sm:px-6">
            <p className="text-sm font-semibold text-[#86efac]">{t("appContext.addFirstToOptimize")}</p>
            <p className="mt-2 text-sm leading-relaxed text-white/55">{t("appContext.emptyBody")}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={tryOpenAddApp}
                disabled={limits.isLoading || limits.isError}
                className="inline-flex items-center justify-center rounded-xl bg-[#22C55E] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("appContext.addAppCta")}
              </button>
              <button
                type="button"
                onClick={goToSettingsHome}
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white/85 transition hover:bg-white/10"
              >
                {t("appContext.manageSettings")}
              </button>
            </div>
          </div>
        ) : null}

        {(appsQuery.isError ? appsList.length > 0 : !showAppsEmpty) && !appsBusy ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <label className="text-xs font-medium text-white/70" htmlFor="workspace-app-select">
                {t("appContext.label")}
              </label>
              <select
                id="workspace-app-select"
                aria-invalid={pickAppGate ? true : undefined}
                aria-label={t("appContext.selectAria")}
                className={cn(
                  "w-full max-w-md rounded-xl border bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-[#22C55E]/25",
                  pickAppGate
                    ? "border-amber-400/45 focus:border-amber-400/55"
                    : "border-white/10 focus:border-[#22C55E]/50",
                )}
                value={selectedAppId}
                onChange={(e) => onWorkspaceAppChange(e.target.value)}
              >
                <option value="">—</option>
                {appsList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {pickAppGate ? (
                <p className="text-xs text-amber-200/90" role="status">
                  {t("appContext.needAppInline")}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={tryOpenAddApp}
                disabled={limits.isLoading || limits.isError}
                className="inline-flex items-center justify-center rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/10 px-4 py-2.5 text-sm font-semibold text-[#86efac] transition hover:bg-[#22C55E]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("appContext.addApp")}
              </button>
              <button
                type="button"
                onClick={goToSettingsHome}
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white/85 transition hover:bg-white/10"
              >
                {t("appContext.manageSettings")}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <OptimizerStepper
        currentStep={wizardStep}
        onStepChange={goWizardStep}
        labels={[
          t("workflow.step1"),
          t("workflow.step2"),
          t("workflow.step3"),
        ]}
        ariaLabel={t("workflow.stepperAria")}
        stepStatusLabels={{
          completed: t("workflow.stepCompleted"),
          current: t("workflow.stepCurrent"),
          upcoming: t("workflow.stepUpcoming"),
        }}
        isRtl={isRtl}
      />

      <div
        dir={isRtl ? "rtl" : "ltr"}
        className="grid grid-cols-1 overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-950/25 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.55)] md:grid-cols-[minmax(0,1fr)_320px] md:items-stretch md:overflow-visible lg:grid-cols-[minmax(0,1fr)_380px]"
      >
        <div className="flex min-h-0 min-w-0 flex-col gap-8 overflow-hidden p-6 pb-24 sm:p-8 md:overflow-visible md:border-e md:border-zinc-800/80 md:pb-8">
          <section dir={isRtl ? "rtl" : "ltr"}>
            <form id="listing-optimizer-form" className="space-y-8" onSubmit={onSubmit}>
              <div className="divide-y divide-zinc-800/80">
                <OptimizerWizardStepShell
                  title={t("workflow.step1")}
                  summary={identitySummary}
                  expanded={expandedWizardPanel(0)}
                  onToggle={() => toggleWizardPanelPeek(0)}
                  disabledToggle={wizardStep === 0}
                >
                  <p className="mb-4 text-xs leading-relaxed text-white/45">
                    {t("form.sectionStoreHelper")}
                  </p>
                  <div className="grid gap-8 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white/80" htmlFor="lo-app-name">
                        {t("form.appName")}
                      </label>
                      <input
                        id="lo-app-name"
                        aria-invalid={autofillGate.appName ? true : undefined}
                        className={cn(
                          fieldFocus,
                          "w-full",
                          autofillGate.appName
                            ? "border-red-400/45 focus-visible:border-red-400/55"
                            : "",
                        )}
                        value={displayAppName}
                        onChange={(e) => {
                          setAppName(e.target.value);
                          clearAutofillGate("appName");
                        }}
                        placeholder={t("form.appNamePlaceholder")}
                        autoComplete="off"
                      />
                      {autofillGate.appName ? (
                        <p className="text-xs text-red-300/90">{t("form.autofill.needAppName")}</p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white/80" htmlFor="lo-category">
                        {t("form.category")}
                      </label>
                      <input
                        id="lo-category"
                        aria-invalid={autofillGate.category ? true : undefined}
                        className={cn(
                          fieldFocus,
                          "w-full",
                          autofillGate.category
                            ? "border-red-400/45 focus-visible:border-red-400/55"
                            : "",
                        )}
                        value={category}
                        onChange={(e) => {
                          setCategory(e.target.value);
                          clearAutofillGate("category");
                        }}
                        placeholder={t("form.categoryPlaceholder")}
                        autoComplete="off"
                      />
                      {autofillGate.category ? (
                        <p className="text-xs text-red-300/90">{t("form.autofill.needCategory")}</p>
                      ) : null}
                    </div>
                  </div>
                  {wizardStep === 0 ? (
                    <div className={cn("mt-6 flex", isRtl ? "justify-start" : "justify-end")}>
                      <button
                        type="button"
                        onClick={() => advanceWizard()}
                        className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-emerald-600"
                      >
                        {t("workflow.continue")}
                      </button>
                    </div>
                  ) : null}
                </OptimizerWizardStepShell>

                <OptimizerWizardStepShell
                  title={t("workflow.step2")}
                  summary={discoverySummary}
                  expanded={expandedWizardPanel(1)}
                  onToggle={() => toggleWizardPanelPeek(1)}
                  disabledToggle={wizardStep === 1}
                >
                  <p className="mb-4 text-xs leading-relaxed text-white/45">
                    {t("form.sectionDiscoveryHelper")}
                  </p>
                  <div className="space-y-6 pt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400/95">
                      {t("workflow.discoveryCardTitle")}
                    </p>
                    <div className="space-y-1.5">
                      <OptimizerSparkleTextarea
                        id="lo-keywords"
                        label={t("form.keywords")}
                        labelTitle={t("form.keywordsFieldTitle")}
                        value={keywords}
                        onChange={setKeywords}
                        placeholder={t("form.keywordsPlaceholder")}
                        rows={4}
                        minHeightClass="min-h-[92px]"
                        disabled={Boolean(autofillBusy) || isProcessingCredits || !workspaceId}
                        busy={autofillBusy === "keywords"}
                        onAutofill={() => void runAutofill("keywords")}
                        onBeforeAutofill={() => requestAutofill("keywords")}
                        sparkleAriaLabel={t("form.autofill.sparkleAriaKeywords")}
                        sparkleTooltip={t("form.autofill.aiAssistTooltipKeywords")}
                        creditsNote={t("form.autofill.usesCredits", {
                          credits: AI_CREDIT_COSTS.listing_optimizer_autofill,
                        })}
                      />
                      {keywords.trim().length === 0 ? (
                        <p className={cn(
                          "text-[11px] leading-relaxed text-zinc-500",
                          isRtl && "font-arabic",
                        )}>
                          {t("smartWorkflow.keywordsHelper")}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <OptimizerSparkleTextarea
                        id="lo-features"
                        label={t("form.features")}
                        labelTitle={t("form.featuresFieldTitle")}
                        value={features}
                        onChange={setFeatures}
                        placeholder={t("form.featuresPlaceholder")}
                        rows={5}
                        minHeightClass="min-h-[144px]"
                        disabled={Boolean(autofillBusy) || isProcessingCredits || !workspaceId}
                        busy={autofillBusy === "features"}
                        onAutofill={() => void runAutofill("features")}
                        onBeforeAutofill={() => requestAutofill("features")}
                        sparkleAriaLabel={t("form.autofill.sparkleAriaFeatures")}
                        sparkleTooltip={t("form.autofill.aiAssistTooltipFeatures")}
                        creditsNote={t("form.autofill.usesCredits", {
                          credits: AI_CREDIT_COSTS.listing_optimizer_autofill,
                        })}
                      />
                      {features.trim().length === 0 ? (
                        <p className={cn(
                          "text-[11px] leading-relaxed text-zinc-500",
                          isRtl && "font-arabic",
                        )}>
                          {t("smartWorkflow.featuresHelper")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {wizardStep === 1 ? (
                    <div className="mt-6 flex flex-wrap justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => goWizardStep(0)}
                        className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white/85 hover:bg-zinc-800"
                      >
                        {t("workflow.back")}
                      </button>
                      <button
                        type="button"
                        onClick={() => advanceWizard()}
                        className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600"
                      >
                        {t("workflow.continue")}
                      </button>
                    </div>
                  ) : null}
                </OptimizerWizardStepShell>

                <OptimizerWizardStepShell
                  title={t("workflow.step3")}
                  summary={finalSummary}
                  expanded={expandedWizardPanel(2)}
                  onToggle={() => toggleWizardPanelPeek(2)}
                  disabledToggle={wizardStep === 2}
                >
                  <div className="space-y-6 border-t border-zinc-800/60 pt-5 sm:pt-6">

                    {/* ── Staging Workspace (Transparent Three-Pillar Control Center) ────────── */}
                    <StagingWorkspaceSection
                      workspaceId={workspaceId}
                      appId={selectedAppId.trim()}
                      reviewQueuePills={reviewQueuePills}
                      spotlightQueuePills={spotlightQueuePills}
                      stagedKeywords={stagedKeywords}
                      competitorWeaknesses={competitorWeaknesses}
                      locale={locale}
                      isRtl={isRtl}
                      loading={loading}
                      keywordSignalsLoading={keywordSignalsLoading}
                      keywordTrackerCount={keywordSignalsTotal}
                      vaultLocale={locale}
                      onRemoveReviewIssue={handleRemoveQueueItem}
                      onRemoveMarketOpportunity={handleRemoveFromStagingVault}
                      onRemoveCompetitorKeyword={handleRemoveKeyword}
                      onRemoveCompetitorWeakness={(idx) => {
                        const updated = competitorWeaknesses.filter((_, i) => i !== idx);
                        setCompetitorWeaknesses(updated);
                        competitorVulnerabilitiesRef.current = updated;
                      }}
                      onOpenKeywordValidator={handleOpenKeywordValidator}
                    />
                    {/* ─────────────────────────────────────────────────────────── */}

                    <p className="text-xs leading-relaxed text-white/45">
                      {t("form.sectionVoiceHelper", {
                        credits: AI_CREDIT_COSTS.listing_generation,
                      })}
                    </p>
                    <p
                      className={cn(
                        "text-[11px] leading-relaxed text-white/40",
                        isRtl && "font-arabic text-end",
                      )}
                    >
                      {t("form.keywordTrackerSynthesisHelper")}
                    </p>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white/80" htmlFor="lo-tone">
                        {t("form.tone")}
                      </label>
                      <select
                        id="lo-tone"
                        className={cn(fieldFocus, "w-full sm:max-w-md")}
                        value={toneStyle}
                        onChange={(e) => setToneStyle(e.target.value as ToneStyle)}
                      >
                        <option value="professional">{t("form.toneProfessional")}</option>
                        <option value="friendly">{t("form.toneFriendly")}</option>
                        <option value="bold">{t("form.toneBold")}</option>
                        <option value="minimal">{t("form.toneMinimal")}</option>
                      </select>
                    </div>

                    {error && !result && !loading ? (
                      <div
                        className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-white/80"
                        role="alert"
                      >
                        <p className="font-medium text-red-400">{t("form.generateError")}</p>
                        <p className="mt-2 text-sm text-white/70">{error}</p>
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-4 sm:gap-y-2">
                      <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-start">
                        <TooltipProvider>
                          <Tooltip
                            content={t("form.generateTooltip")}
                            side="top"
                            asChild
                          >
                            <button
                              type="submit"
                              disabled={!canSubmit || isProcessingCredits || loading}
                              aria-busy={loading ? true : undefined}
                              className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-emerald-500 px-8 py-4 text-base font-bold text-white shadow-[0_10px_32px_-10px_rgba(34,197,94,0.55)] ring-2 ring-emerald-500/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50 disabled:shadow-none disabled:ring-0 sm:w-auto sm:min-w-[300px]"
                            >
                              {loading ? (
                                <>
                                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                                  {isRtl ? "جارٍ التوليد…" : t("form.generating")}
                                </>
                              ) : (
                                <>
                                  <Sparkles className="size-4 shrink-0" aria-hidden />
                                  {isRtl
                                    ? `توليد القائمة الكاملة · ${AI_CREDIT_COSTS.listing_generation} رصيد`
                                    : `Generate Full Listing · ${AI_CREDIT_COSTS.listing_generation} credits`}
                                </>
                              )}
                            </button>
                          </Tooltip>
                        </TooltipProvider>
                        <p className="text-center text-sm font-medium text-emerald-300/90 sm:text-start">
                          {isRtl
                            ? "يوليف الذكاء الاصطناعي جميع الإشارات النشطة في قائمة واحدة محسّنة"
                            : "AI synthesises all active signals into one optimised listing"}
                        </p>
                        {!canSubmit && !loading && !isProcessingCredits &&
                          (displayAppName.trim().length === 0 || category.trim().length === 0) ? (
                          <p className="max-w-xl text-center text-xs leading-relaxed text-amber-400/80 sm:text-start">
                            {t("form.generateStepGateHint")}
                          </p>
                        ) : null}
                        {/* Pro-tip — always visible below the button, muted so it doesn't compete with the CTA */}
                        <p className="max-w-sm text-center text-[11px] leading-relaxed text-zinc-500 sm:text-start">
                          {isRtl
                            ? "💡 ستحصل على نتائج أفضل مع بيانات المراجعات + السوق + المنافسين. البيانات الجزئية تعمل، لكن التوليف يكون أقوى عند تفعيل جميع الإشارات."
                            : "💡 Pro-tip: You'll get better results with Reviews + Market + Competitor data. Partial data still works, but synthesis is strongest with all signals active."}
                        </p>
                      </div>
                    </div>
                  </div>
                  {wizardStep === 2 ? (
                    <div className={cn("mt-6 flex", isRtl ? "justify-end" : "justify-start")}>
                      <button
                        type="button"
                        onClick={() => goWizardStep(1)}
                        className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white/85 hover:bg-zinc-800"
                      >
                        {t("workflow.back")}
                      </button>
                    </div>
                  ) : null}
                </OptimizerWizardStepShell>
              </div>
            </form>
          </section>

          <AnimatePresence mode="wait">
          {result || localizedMarkets.length > 0 ? (
            <motion.div
              key="optimizer-results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
            {/* ── Quality Status badge ────────────────────────────────────── */}
            {result && meta && (meta.quality_status ?? meta.quality_warning) ? (
              <div className={cn(
                "mb-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm",
                meta.quality_status
                  ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-300"
                  : "border-amber-500/20 bg-amber-500/8 text-amber-300",
              )}>
                <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
                  {meta.quality_status ? "✦" : "◎"}
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="font-semibold text-[13px]">
                    {meta.quality_status
                      ? (isRtl ? "وضع التوليف الأقصى" : "Maximum Synthesis")
                      : (isRtl ? "بيانات جزئية" : "Partial Data")}
                  </p>
                  <p className="text-[11px] leading-relaxed opacity-80">
                    {meta.quality_status
                      ? (isRtl
                          ? "جميع الإشارات نشطة — المراجعات + السوق + المنافسون. هذا هو أعلى مستوى من التخصيص."
                          : "All signals active — Reviews + Market + Competitors. This is peak personalisation.")
                      : (isRtl
                          ? "تم التوليد ببيانات جزئية. أضف إشارات المراجعات أو السوق أو المنافسين للحصول على استراتيجية أكثر شمولاً."
                          : "Generated using partial data. Add Review, Market, or Competitor signals for a more comprehensive strategy.")}
                  </p>
                </div>
              </div>
            ) : null}
            {/* ─────────────────────────────────────────────────────────────── */}
            {result ? (
            <OptimizerResultsPanel
              result={result}
              meta={meta}
              resultsBusy={resultsBusy}
              lastGeneratedAtIso={lastGeneratedAtIso}
              lastGeneratedLabel={formatListingGeneratedAtLabel(
                lastGeneratedAtIso,
                lastGeneratedLabelFormatter,
              )}
              isRtl={isRtl}
              editedTitle={editedTitle}
              setEditedTitle={setEditedTitle}
              editedShort={editedShort}
              setEditedShort={setEditedShort}
              editedLong={editedLong}
              setEditedLong={setEditedLong}
              clampedListing={clampedListing}
              onCopyAllBlocks={() =>
                void copyText(
                  "all",
                  copyListingAllBlocks(clampedListing),
                )
              }
              onCopyKeywordsList={() =>
                void copyText(
                  "keywords",
                  result.keywordSuggestions.join(", "),
                )
              }
              onCopyCtasList={() =>
                void copyText("CTAs", result.ctaSuggestions.join("\n"))
              }
              onCopyTitle={() => void copyText("title", clampedListing.title)}
              onCopyShort={() =>
                void copyText("short", clampedListing.shortDescription)
              }
              onCopyLong={() =>
                void copyText("long", clampedListing.fullDescription)
              }
              onExportOpen={() => setExportPlayOpen(true)}
              canRegenerate={canRegenerate}
              onRegeneratePunchier={() =>
                void runListingGeneration({
                  mode: "regenerate",
                  userInstruction: REGENERATE_MODEL_INSTRUCTIONS.punchier,
                })
              }
              onRegenerateProfessional={() =>
                void runListingGeneration({
                  mode: "regenerate",
                  userInstruction: REGENERATE_MODEL_INSTRUCTIONS.professional,
                })
              }
              onRegenerateArabic={() =>
                void runListingGeneration({
                  mode: "regenerate",
                  userInstruction: REGENERATE_MODEL_INSTRUCTIONS.arabic,
                  targetArabicOverride: true,
                })
              }
              onRegenerateTone={() =>
                void runListingGeneration({
                  mode: "regenerate",
                  userInstruction: REGENERATE_MODEL_INSTRUCTIONS.tone,
                })
              }
              workspaceId={workspaceId}
              selectedAppId={selectedAppId}
              listingGenerationId={listingGenerationId}
              trackKwBusy={trackKwBusy}
              onTrackKeywords={() => void trackKeywordsInKeywordTracker()}
              logoGenTriggerDisabled={logoGenTriggerDisabled}
              logoGenTriggerTitle={logoGenTriggerTitle}
              onOpenLogoGen={() => setLogoGenOpen(true)}
              appsListLength={appsList.length}
              showGenerateSuccess={generateJustSucceeded}
              canSaveToTracker={canSaveKeywordsToTracker}
              generationQueueSnapshot={generationQueueSnapshot}
            />
            ) : null}

            {/* ── ASO Performance Attribution History ────────────────────── */}
            {workspaceId ? (
              <ListingHistory
                workspaceId={workspaceId}
                appId={selectedAppId.trim() || undefined}
                locale={locale}
              />
            ) : null}

            {/* ── Global Localization Expansion Grid ─────────────────────── */}
            <section
              dir={isRtl ? "rtl" : "ltr"}
              className={cn(
                "mt-6 rounded-2xl border border-white/[0.07] bg-[#0c1018] px-5 py-6 sm:px-7 sm:py-7",
                isRtl && "font-arabic",
              )}
            >
              {/* Header */}
              <div className="mb-1 flex items-center gap-2.5">
                <span className="text-base font-bold text-white/90">
                  🌍 {t("results.localize.sectionTitle")}
                </span>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-500/25">
                  Premium
                </span>
                <TooltipProvider>
                  <Tooltip
                    content={t("results.localize.headerTooltip")}
                    side="top"
                    className="max-w-[300px]"
                    asChild
                  >
                    <button
                      type="button"
                      className="cursor-help rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                      aria-label={t("results.localize.headerTooltip")}
                    >
                      <Info className="size-4 text-zinc-500 hover:text-zinc-300 transition-colors" aria-hidden />
                    </button>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p
                className={cn(
                  "text-sm leading-relaxed text-zinc-400",
                  hasLocalizedAssets ? "mb-3" : "mb-5",
                )}
              >
                {t("results.localize.sectionSubtitle")}
              </p>

              {hasLocalizedAssets && !showLocalizeMarketPicker ? (
                <button
                  type="button"
                  onClick={() => setLocalizeInputExpanded(true)}
                  className="mb-5 text-sm font-medium text-emerald-400/90 hover:text-emerald-300"
                >
                  {t("results.localize.addAnotherMarket")}
                </button>
              ) : null}

              {showLocalizeMarketPicker ? (
              <>
              <div className="mb-5 flex flex-wrap gap-3">
                {(
                  [
                    { code: "ae" as const, flag: "🇦🇪", name: t("results.localize.marketAe"), lang: t("results.localize.marketAeLanguage") },
                    { code: "in" as const, flag: "🇮🇳", name: t("results.localize.marketIn"), lang: t("results.localize.marketInLanguage") },
                    { code: "mx" as const, flag: "🇲🇽", name: t("results.localize.marketMx"), lang: t("results.localize.marketMxLanguage") },
                  ] satisfies { code: LocalizeMarket; flag: string; name: string; lang: string }[]
                ).map(({ code, flag, name, lang }) => {
                  const alreadySaved = savedMarketCodes.has(code);
                  const selected = localizeMarkets.has(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      disabled={alreadySaved || localizeBusy}
                      onClick={() => toggleLocalizeMarket(code)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm transition-all",
                        alreadySaved
                          ? "cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-zinc-600 opacity-60"
                          : selected
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-500/30"
                          : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:border-white/[0.15] hover:bg-white/[0.06]",
                      )}
                    >
                      <span className="text-base leading-none" aria-hidden>{flag}</span>
                      <span className="flex flex-col items-start gap-0.5 leading-tight">
                        <span className="font-semibold">{name}</span>
                        <span className={cn("text-[10px]", selected ? "text-emerald-400/70" : "text-zinc-500")}>
                          {lang}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "ms-1 flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold transition-all",
                          selected
                            ? "border-emerald-400 bg-emerald-500 text-white"
                            : "border-zinc-600 bg-transparent text-transparent",
                        )}
                        aria-hidden
                      >
                        ✓
                      </span>
                    </button>
                  );
                })}
              </div>

              {pendingLocalizeMarkets.length > 0 ? (
                <p className="mb-4 text-xs text-zinc-500">
                  {t("results.localize.creditsNote", {
                    total: localizeTotalCredits,
                    count: pendingLocalizeMarkets.length,
                  })}
                </p>
              ) : (
                <p className="mb-4 text-xs text-zinc-600">
                  {t("results.localize.selectHint")}
                </p>
              )}

              <button
                type="button"
                disabled={
                  pendingLocalizeMarkets.length === 0 ||
                  localizeBusy ||
                  !selectedAppId.trim()
                }
                onClick={() => setLocalizeConfirmOpen(true)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all",
                  pendingLocalizeMarkets.length > 0 && !localizeBusy
                    ? "bg-emerald-500 text-white shadow-[0_6px_20px_-6px_rgba(34,197,94,0.5)] ring-2 ring-emerald-500/30 hover:bg-emerald-400"
                    : "cursor-not-allowed bg-white/10 text-white/30",
                )}
              >
                {localizeBusy ? (
                  <>
                    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    {t("results.localize.ctaBusy")}
                  </>
                ) : pendingLocalizeMarkets.length === 0 ? (
                  t("results.localize.ctaSelectMarket")
                ) : (
                  t("results.localize.ctaDynamic", { credits: localizeTotalCredits })
                )}
              </button>

              {hasLocalizedAssets ? (
                <button
                  type="button"
                  onClick={() => {
                    setLocalizeInputExpanded(false);
                    setLocalizeMarkets(new Set());
                  }}
                  className="ms-3 text-xs text-zinc-500 hover:text-zinc-300"
                >
                  {t("results.localize.hideMarketPicker")}
                </button>
              ) : null}
              </>
              ) : null}

              {localizeError ? (
                <p
                  className={cn(
                    "rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300",
                    hasLocalizedAssets && !showLocalizeMarketPicker ? "mt-4" : "mb-4",
                  )}
                >
                  {localizeError}
                </p>
              ) : null}

              {localizedMarkets.length > 0 ? (
                <LocalizedResults
                  markets={localizedMarkets}
                  activeMarket={activeMarket}
                  onActiveMarketChange={setActiveMarket}
                  copiedKey={localizeCopied}
                  onCopy={copyLocalizeText}
                  marketActionBusy={localizeBusy}
                  regeneratingMarket={localizeRegeneratingMarket}
                  onRegenerateMarket={requestRegenerateLocalizedMarket}
                  onExportMarket={exportLocalizedMarket}
                  onDeleteMarket={(market) => void deleteLocalizedMarket(market)}
                />
              ) : null}
            </section>

            {/* Localization credits confirm dialog */}
            <OptimizerCreditsConfirmDialog
              open={localizeConfirmOpen}
              onOpenChange={(open) => {
                setLocalizeConfirmOpen(open);
              }}
              credits={localizeTotalCredits}
              isRtl={isRtl}
              onConfirm={() => {
                setLocalizeConfirmOpen(false);
                void runLocalize();
              }}
            />
            <OptimizerCreditsConfirmDialog
              open={localizeRegenerateConfirmOpen}
              onOpenChange={(open) => {
                setLocalizeRegenerateConfirmOpen(open);
                if (!open) setLocalizeRegenerateMarket(null);
              }}
              credits={localizeCreditCost}
              isRtl={isRtl}
              onConfirm={() => {
                const market = localizeRegenerateMarket;
                setLocalizeRegenerateConfirmOpen(false);
                setLocalizeRegenerateMarket(null);
                if (market) void regenerateLocalizedMarket(market);
              }}
            />

            </motion.div>
          ) : loading ? (
            // ── Active generation in flight: show full shimmer skeleton ────────
            <motion.section
              key="optimizer-loading"
              className="pt-4 sm:pt-6"
              aria-busy
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <OptimizerResultsGeneratingView isRtl={isRtl} />
            </motion.section>
          ) : purgedAwaitingGenerate ? (
            // ── Post-injection ready state: keywords loaded, no generation yet ──
            // Do NOT render the spinning skeleton — the user needs to explicitly
            // trigger a generation. Show a clean, actionable CTA instead.
            <motion.section
              key="optimizer-run-scan"
              dir={isRtl ? "rtl" : "ltr"}
              className={cn(
                "flex flex-col items-center gap-5 border-t border-dashed border-zinc-800/80 px-4 py-14 text-center sm:py-16",
                isRtl && "font-arabic",
              )}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <p className="max-w-md text-sm leading-relaxed text-white/55">
                {t("empty.runScanHint")}
              </p>
              <button
                type="submit"
                form="listing-optimizer-form"
                disabled={!canSubmit || isProcessingCredits || loading}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-7 py-3.5 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(34,197,94,0.5)] ring-2 ring-emerald-500/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50 disabled:shadow-none disabled:ring-0"
              >
                {t("empty.runScanCta")}
              </button>
            </motion.section>
          ) : (
            // ── Default empty state: no injection, no generation ───────────────
            <motion.section
              key="optimizer-empty"
              className="border-t border-dashed border-zinc-800/80 px-2 py-10 text-center text-sm leading-relaxed text-white/52 sm:py-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              {t("empty.body")}
            </motion.section>
          )}
          </AnimatePresence>
        </div>

        <OptimizerLivePreviewPane
          workspaceId={workspaceId}
          isRtl={isRtl}
          previewConnected={previewConnected}
          showChangeLogoBtn={showChangeLogoBtn}
          onOpenLogoGen={() => setLogoGenOpen(true)}
          appName={previewAppName}
          category={category}
          keywords={result ? keywords : ""}
          features={features}
          previewShortDesc={previewShortForPhone}
          livePreviewIconUrl={livePreviewIconUrl}
          clampedListing={previewFieldsForPhone}
          previewDir={phonePreviewDir}
          result={result}
          loading={loading}
          isGenerating={loading && !result}
          scanActive={loading || autofillBusy !== null}
          showEmptyIconAsoHint={!hasValidHttpsPreviewIcon(livePreviewIconUrl)}
          logoGenTriggerDisabled={logoGenTriggerDisabled}
        />
      </div>
    </div>
    </div>
  );
}
