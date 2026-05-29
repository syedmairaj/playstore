"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ExternalLink, Info, Loader2, Rocket, Star, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ListingImprovementItem } from "@/components/reviews/review-improvements-queue";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { ActiveQueueExploitConfirmDialog } from "@/components/optimizer/active-queue-exploit-confirm-dialog";
import { cn } from "@/lib/utils";

export function queueImprovementBadgeLabel(item: ListingImprovementItem): string {
  const tag = item.sentimentTag?.trim();
  if (tag) return tag;
  const text = item.reviewText.trim();
  if (text.length <= 20) return text;
  return `${text.slice(0, 20)}...`;
}

/**
 * Encodes queued improvement items into a URL-safe `exploit_targets` param value.
 */
export function buildExploitTargetsParam(items: ListingImprovementItem[]): string {
  const labels = items
    .map((item) => queueImprovementBadgeLabel(item))
    .filter(Boolean);
  return encodeURIComponent(labels.join(","));
}

/**
 * Converts an ISO 3166-1 alpha-2 country code to its emoji flag character.
 * e.g. "US" → "🇺🇸", "GB" → "🇬🇧"
 */
function getFlagEmoji(countryCode: string): string {
  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split("")
      .map((c) => 127397 + c.charCodeAt(0)),
  );
}

/** Filled star row — always renders 5 stars, highlights the first `score` in amber. */
function StarRow({ score }: { score: number }) {
  const clamped = Math.min(5, Math.max(0, Math.round(score)));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${clamped} stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "size-3",
            i < clamped ? "fill-amber-400 text-amber-400" : "fill-zinc-700 text-zinc-700",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}

/** Rich tooltip popup shown on pill hover — reviewer name, stars, full review text. */
function PillTooltipContent({ item, ownPackageName, t }: { item: ListingImprovementItem; ownPackageName?: string | null; t: ReturnType<typeof useTranslations<"optimizer.activeQueue">> }) {
  const name = item.userName?.trim() || "Anonymous";
  const appLabel = item.packageName ?? item.appId ?? null;
  // country_code is not currently in the ListingImprovementItem schema but may be
  // added later — read it defensively so the flag renders automatically when present.
  const countryCode = (item as unknown as Record<string, unknown>)["country_code"];
  const flagEmoji =
    typeof countryCode === "string" && countryCode.length === 2
      ? getFlagEmoji(countryCode)
      : null;

  // Derive source classification using the workspace's own package name as ground truth.
  // This is reliable even for legacy rows where app_id was incorrectly stored:
  // - If ownPackageName is known: own app iff packageName matches it exactly.
  // - Fallback (ownPackageName not provided): own app iff appId is non-null AND packageName
  //   is either null or matches appId (legacy heuristic).
  const isOwnApp = ownPackageName
    ? item.packageName?.trim() === ownPackageName.trim()
    : item.appId !== null && (item.packageName === null || item.packageName === item.appId);

  return (
    <div className="space-y-2 text-start">
      {/* Strategy badge — dynamically resolved from item source fields */}
      <span
        className={cn(
          "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold",
          isOwnApp
            ? "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/25"
            : "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/25",
        )}
      >
        {isOwnApp ? t("infoTooltip.pillDefensive") : t("infoTooltip.pillOffensive")}
      </span>

      {/* Header: name • flag+country (if known) • app • stars */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-white/90">
          👤 {name}
        </span>
        {flagEmoji && typeof countryCode === "string" && (
          <>
            <span className="text-zinc-600">•</span>
            <span className="text-[11px] text-zinc-400">
              {flagEmoji} {countryCode.toUpperCase()}
            </span>
          </>
        )}
        {appLabel && (
          <>
            <span className="text-zinc-600">•</span>
            <span className="max-w-[120px] truncate font-mono text-[10px] text-zinc-500">
              📍 {appLabel}
            </span>
          </>
        )}
        {item.score > 0 && (
          <>
            <span className="text-zinc-600">•</span>
            <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-400">
              <StarRow score={item.score} />
              <span className="ms-1 font-semibold">{item.score}</span>
              <span className="text-zinc-500"> Stars</span>
            </span>
          </>
        )}
      </div>
      {/* Review snippet */}
      {item.reviewText.trim() && (
        <p className="text-[11px] italic leading-relaxed text-zinc-400">
          &ldquo;{item.reviewText.trim().slice(0, 240)}
          {item.reviewText.trim().length > 240 ? "…" : ""}&rdquo;
        </p>
      )}
    </div>
  );
}

export type ActiveOptimizationQueuePanelProps = {
  items: ListingImprovementItem[];
  loading?: boolean;
  className?: string;
  isRtl?: boolean;
  /** Credit cost shown in the confirm modal. Defaults to 5. */
  credits?: number;
  /**
   * Called when the user confirms the modal while already on the optimizer page.
   * Triggers a fresh listing generation directly.
   */
  onGenerate?: () => void;
  /**
   * Called when the user confirms the modal from outside the optimizer page.
   * Receives the encoded `exploit_targets` query param value.
   */
  onNavigateToOptimizer?: (exploitTargetsParam: string) => void;
  /**
   * Called when the user clicks the delete (×) button on a pill.
   * The parent should remove the item from state and call the DELETE API.
   */
  onRemoveItem?: (itemId: string) => void;
  /**
   * The workspace app's own package name (e.g. "com.myapp.android").
   * Used as ground truth to classify pills as defensive (own app) vs offensive (competitor).
   * Without this, classification falls back to the less reliable appId heuristic.
   */
  ownPackageName?: string | null;
  /**
   * The workspace ID — required when rendering outside the optimizer page so the
   * navigation CTA can build the correct `/app/[workspaceId]/listing-optimizer` URL.
   */
  workspaceId?: string;
  /**
   * When true, the queue is locked in "Processing…" mode — all pills are dimmed
   * and the delete button is hidden. Use this while the Gemini generation is running
   * to prevent the user from modifying the queue mid-flight (which can cause
   * state duplication bugs).
   */
  isGenerating?: boolean;
};

export function ActiveOptimizationQueuePanel({
  items,
  loading = false,
  className,
  isRtl = false,
  credits = 5,
  onGenerate,
  onNavigateToOptimizer,
  onRemoveItem,
  ownPackageName,
  workspaceId,
  isGenerating = false,
}: ActiveOptimizationQueuePanelProps) {
  const t = useTranslations("optimizer.activeQueue");
  const pathname = usePathname();
  const isOptimizerPage =
    pathname.includes("/listing-optimizer") || pathname.includes("/optimizer");

  const [confirmOpen, setConfirmOpen] = useState(false);
  // Track which item IDs are mid-delete for visual feedback
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const hasItems = !loading && items.length > 0;
  // Show CTA whenever there are items — handlers are optional; clicking with neither wired is a no-op
  const hasCta = hasItems;

  function handleConfirm() {
    if (onGenerate) {
      onGenerate();
      return;
    }
    if (onNavigateToOptimizer) {
      onNavigateToOptimizer(buildExploitTargetsParam(items));
    }
  }

  function handleRemove(itemId: string) {
    if (!onRemoveItem || deletingIds.has(itemId)) return;
    setDeletingIds((prev) => new Set(prev).add(itemId));
    // Optimistic removal is handled by the parent; we just signal
    onRemoveItem(itemId);
    // Clear loading indicator after a tick (parent state update clears the pill entirely)
    setTimeout(() => {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }, 600);
  }

  return (
    <>
      <motion.div
        layout
        className={cn(
          "mb-6 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950 shadow-lg shadow-black/30",
          className,
        )}
      >
        {/* Header */}
        <div className="border-b border-slate-800/70 bg-slate-900/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight text-slate-100">
              {t("title")}
            </h3>
            {/* Educational info icon — explains what the queue does and why */}
            <TooltipProvider>
              <Tooltip
                side="right"
                className="max-w-sm"
                asChild
                content={
                  <div className="space-y-3 text-start">
                    <p className="text-[12px] font-semibold text-white/90">
                      {t("infoTooltip.heading")}
                    </p>
                    <div className="space-y-2.5">
                      {/* WHAT IT IS */}
                      <p className="text-[11px] leading-relaxed text-zinc-300">
                        <span className="font-semibold text-white/80">
                          {t("infoTooltip.whatItIsLabel")}
                        </span>{" "}
                        {t("infoTooltip.whatItIsBody")}
                      </p>
                      {/* DEFENSIVE VS. OFFENSIVE */}
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-white/80">
                          {t("infoTooltip.strategyLabel")}
                        </p>
                        <p className="text-[11px] leading-relaxed text-zinc-300">
                          <span className="font-semibold text-sky-400">
                            {t("infoTooltip.strategyOwnLabel")}
                          </span>{" "}
                          {t("infoTooltip.strategyOwnBody")}
                        </p>
                        <p className="text-[11px] leading-relaxed text-zinc-300">
                          <span className="font-semibold text-orange-400">
                            {t("infoTooltip.strategyCompetitorLabel")}
                          </span>{" "}
                          {t("infoTooltip.strategyCompetitorBody")}
                        </p>
                      </div>
                      {/* EXPECTED RESULT */}
                      <p className="text-[11px] leading-relaxed text-zinc-300">
                        <span className="font-semibold text-white/80">
                          {t("infoTooltip.expectedResultLabel")}
                        </span>{" "}
                        {t("infoTooltip.expectedResultBody")}
                      </p>
                    </div>
                  </div>
                }
              >
                <span
                  role="img"
                  aria-label={t("infoTooltip.ariaLabel")}
                  tabIndex={0}
                  className="flex shrink-0 cursor-default items-center justify-center rounded-full text-slate-500 transition-colors hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                >
                  <Info className="size-3.5" aria-hidden />
                </span>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {t("subtext")}
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {loading ? (
            <motion.div
              className="flex items-center gap-2 text-xs text-slate-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t("loading")}
            </motion.div>
          ) : items.length > 0 ? (
            <TooltipProvider>
              {/* Optimistic "Processing" banner — shown while Gemini generation is running.
                  Locks the entire pill list so the user can't mutate the queue mid-flight. */}
              {isGenerating && (
                <motion.div
                  className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                  <span>{t("processingBanner")}</span>
                </motion.div>
              )}
              <motion.div
                layout
                className={cn(
                  "flex flex-wrap gap-2",
                  isGenerating && "pointer-events-none opacity-50",
                )}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <AnimatePresence initial={false}>
                  {items.map((item) => {
                    const isDeleting = deletingIds.has(item.id);
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: isDeleting ? 0.4 : 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
                      >
                        <Tooltip
                          side="top"
                          className="max-w-[300px]"
                          content={<PillTooltipContent item={item} ownPackageName={ownPackageName} t={t} />}
                          asChild
                        >
                          {/* Pill wrapper — no native `title` attr to avoid double tooltip */}
                          <span
                            tabIndex={0}
                            className={cn(
                              "group inline-flex cursor-default items-center gap-1.5 rounded-lg border bg-slate-800/70 ps-3 pe-1.5 py-1.5 text-xs font-medium ring-1 ring-inset ring-slate-700/40 transition-colors",
                              isGenerating
                                ? "border-amber-500/20 text-amber-300/70"
                                : "border-emerald-500/20 text-slate-200 hover:border-emerald-500/30 hover:bg-slate-800",
                            )}
                          >
                            {isGenerating ? (
                              <Loader2 className="size-3 shrink-0 animate-spin text-amber-400/70" aria-hidden />
                            ) : (
                              <CheckCircle2
                                className="size-3 shrink-0 text-emerald-400"
                                aria-hidden
                              />
                            )}
                            {queueImprovementBadgeLabel(item)}

                            {/* Delete (×) button — hidden during generation to prevent mid-flight mutations */}
                            {onRemoveItem && !isGenerating && (
                              <button
                                type="button"
                                disabled={isDeleting}
                                aria-label={t("pillRemoveAriaLabel")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemove(item.id);
                                }}
                                className={cn(
                                  "ms-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                                  "text-slate-600 transition-colors",
                                  "hover:bg-rose-500/20 hover:text-rose-400",
                                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500/50",
                                  isDeleting && "pointer-events-none",
                                )}
                              >
                                {isDeleting ? (
                                  <Loader2 className="size-2.5 animate-spin" aria-hidden />
                                ) : (
                                  <X className="size-2.5" aria-hidden />
                                )}
                              </button>
                            )}
                          </span>
                        </Tooltip>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            </TooltipProvider>
          ) : (
            <p className="text-xs leading-relaxed text-slate-500">{t("empty")}</p>
          )}
        </div>

        {/* CTA — context-aware: generate in-place on the optimizer page, navigate from elsewhere */}
        {hasCta && (
          <div className="border-t border-slate-800/70 bg-slate-900/40 px-5 py-4 space-y-2">
            {isOptimizerPage ? (
              /* ── On the optimizer page: trigger the confirm modal directly ── */
              <motion.button
                type="button"
                onClick={() => setConfirmOpen(true)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "group relative w-full overflow-hidden rounded-lg px-4 py-2.5",
                  "bg-emerald-600 text-sm font-medium text-white",
                  "transition-colors duration-150 hover:bg-emerald-500",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                  "shadow-[0_0_16px_rgba(16,185,129,0.25)] hover:shadow-[0_0_24px_rgba(16,185,129,0.40)]",
                )}
              >
                {/* Shimmer sweep */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-white/10 transition-transform duration-700 group-hover:translate-x-[200%]"
                />
                <span className="relative inline-flex items-center justify-center gap-2">
                  <Rocket className="size-4 shrink-0" aria-hidden />
                  {t("ctaGenerate")}
                </span>
              </motion.button>
            ) : (
              /* ── Off the optimizer page: navigate there with exploit_targets pre-loaded ── */
              <Link
                href={
                  workspaceId
                    ? `/app/${workspaceId}/listing-optimizer?exploit_targets=${buildExploitTargetsParam(items)}`
                    : "/listing-optimizer"
                }
                className={cn(
                  "group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg px-4 py-2.5",
                  "border border-emerald-500/40 bg-emerald-500/10 text-sm font-medium text-emerald-300",
                  "transition-colors duration-150 hover:border-emerald-400/60 hover:bg-emerald-500/20 hover:text-emerald-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                )}
              >
                <ExternalLink className="size-4 shrink-0" aria-hidden />
                {t("ctaNavigate")}
              </Link>
            )}
            {/* Hint shown only when off the optimizer page */}
            {!isOptimizerPage && (
              <p className="text-center text-[11px] leading-relaxed text-slate-500">
                {t("ctaNavigateHint")}
              </p>
            )}
          </div>
        )}
      </motion.div>

      {/* Confirm modal — portals outside the card */}
      <ActiveQueueExploitConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        items={items}
        credits={credits}
        isRtl={isRtl}
        onConfirm={handleConfirm}
      />
    </>
  );
}
