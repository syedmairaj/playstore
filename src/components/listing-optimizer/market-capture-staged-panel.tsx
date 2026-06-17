"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  patchStagedChangeStatus,
  requestMarketCaptureProposals,
} from "@/lib/client/market-capture-client";
import { applyApprovedStagedChanges } from "@/lib/market-capture/market-capture-engine";
import type {
  MarketCaptureListingField,
  MarketCaptureReport,
  MarketCaptureStagedChange,
} from "@/lib/market-capture/market-capture.types";
import type { OptimizationQueueItem } from "@/lib/optimization-queue/optimization-queue.types";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";

export type MarketCaptureStagedPanelProps = {
  workspaceId: string;
  locale: "en" | "ar";
  isRtl?: boolean;
  competitorName: string;
  appName: string;
  category: string;
  appFeatures: string;
  queueItems: OptimizationQueueItem[];
  seedKeywords?: string[];
  currentListing?: {
    title?: string;
    shortDescription?: string;
    fullDescription?: string;
  };
  onApplyToDraft: (fields: {
    title?: string;
    shortDescription?: string;
    fullDescription?: string;
    whatsNew?: string;
  }) => void;
};

function fieldLabel(
  field: MarketCaptureListingField,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (field) {
    case "title":
      return t("fieldTitle");
    case "shortDescription":
      return t("fieldShort");
    case "fullDescription":
      return t("fieldLong");
    case "whatsNew":
      return t("fieldWhatsNew");
  }
}

function StagedChangeRow({
  change,
  isRtl,
  onStatus,
  t,
}: {
  change: MarketCaptureStagedChange;
  isRtl?: boolean;
  onStatus: (id: string, status: MarketCaptureStagedChange["status"]) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const statusTone =
    change.status === "approved"
      ? "border-emerald-500/25 bg-emerald-500/[0.06]"
      : change.status === "rejected"
        ? "border-white/[0.06] bg-white/[0.02] opacity-60"
        : "border-white/[0.08] bg-white/[0.03]";

  return (
    <article
      className={cn("rounded-lg border p-3", statusTone, isRtl && "font-arabic text-end")}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div
        className={cn(
          "mb-2 flex flex-wrap items-center gap-2",
          isRtl && "flex-row-reverse justify-end",
        )}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
          {change.version === "A" ? t("versionA") : t("versionB")} · {fieldLabel(change.field, t)}
        </span>
        <span className="text-[10px] tabular-nums text-white/30">
          {t("chars", { count: change.charCount })}
          {change.keywordDensityPercent != null
            ? ` · ${t("density", { percent: change.keywordDensityPercent })}`
            : null}
        </span>
        <span
          className={cn(
            "ms-auto rounded-full px-2 py-0.5 text-[9px] font-medium uppercase",
            change.status === "approved" && "bg-emerald-500/15 text-emerald-300/80",
            change.status === "rejected" && "bg-white/5 text-white/35",
            change.status === "pending" && "bg-amber-500/10 text-amber-300/70",
          )}
        >
          {t(change.status)}
        </span>
      </div>

      {change.currentValue ? (
        <p className="mb-1 text-[11px] text-white/28">
          <span className="font-medium text-white/40">{t("current")}: </span>
          {change.currentValue}
        </p>
      ) : null}

      <p className="mb-2 text-[13px] font-medium leading-snug text-white/90">{change.proposedValue}</p>

      <p className="mb-3 text-[11px] leading-relaxed text-white/40">
        <span className="font-medium text-white/50">{t("rationale")}: </span>
        {change.rationale}
      </p>

      {change.status === "pending" ? (
        <div className={cn("flex gap-2", isRtl && "flex-row-reverse justify-end")}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-emerald-500/30 text-emerald-300/90 hover:bg-emerald-500/10"
            onClick={() => onStatus(change.id, "approved")}
          >
            <Check className="size-3.5" aria-hidden />
            {t("approve")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-white/45 hover:text-white/70"
            onClick={() => onStatus(change.id, "rejected")}
          >
            <X className="size-3.5" aria-hidden />
            {t("reject")}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

export function MarketCaptureStagedPanel({
  workspaceId,
  locale,
  isRtl = false,
  competitorName,
  appName,
  category,
  appFeatures,
  queueItems,
  seedKeywords,
  currentListing,
  onApplyToDraft,
}: MarketCaptureStagedPanelProps) {
  const t = useTranslations("optimizer.marketCapture");
  const [report, setReport] = useState<MarketCaptureReport | null>(null);
  const [busy, setBusy] = useState(false);
  const credits = AI_CREDIT_COSTS.listing_generation;

  const handleGenerate = useCallback(async () => {
    setBusy(true);
    try {
      const res = await requestMarketCaptureProposals({
        workspaceId,
        locale,
        competitorName: competitorName.trim() || t("competitorPlaceholder"),
        appName,
        category,
        appFeatures,
        queueItems,
        seedKeywords,
        currentListing,
      });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setReport(res.data);
    } catch {
      toast.error("Network error");
    } finally {
      setBusy(false);
    }
  }, [
    workspaceId,
    locale,
    competitorName,
    appName,
    category,
    appFeatures,
    queueItems,
    seedKeywords,
    currentListing,
    t,
  ]);

  const handleStatus = useCallback((id: string, status: MarketCaptureStagedChange["status"]) => {
    setReport((prev) => (prev ? patchStagedChangeStatus(prev, id, status) : prev));
  }, []);

  const handleApply = useCallback(() => {
    if (!report) return;
    const merged = applyApprovedStagedChanges(report.stagedChanges, currentListing ?? {});
    onApplyToDraft(merged);
    toast.success(t("appliedToast"));
  }, [report, currentListing, onApplyToDraft, t]);

  const approvedCount = useMemo(
    () => report?.stagedChanges.filter((c) => c.status === "approved").length ?? 0,
    [report],
  );

  return (
    <section
      className={cn("space-y-4", isRtl && "font-arabic")}
      dir={isRtl ? "rtl" : "ltr"}
      aria-labelledby="market-capture-heading"
    >
      <div className={cn("space-y-1", isRtl ? "text-end" : "text-start")}>
        <h2 id="market-capture-heading" className="text-sm font-bold text-white/95">
          {t("title")}
        </h2>
        <p className="text-[11px] leading-relaxed text-white/35">
          {t("subtitle", {
            competitor: competitorName.trim() || t("competitorPlaceholder"),
          })}
        </p>
      </div>

      <Button
        type="button"
        size="sm"
        disabled={busy || !appName.trim() || !appFeatures.trim()}
        className="gap-2 bg-indigo-600/90 text-white hover:bg-indigo-500"
        onClick={() => void handleGenerate()}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
        {busy ? t("generating") : t("generateCta", { credits })}
      </Button>

      {!report ? (
        <p className="text-[11px] text-white/30">{t("noReport")}</p>
      ) : (
        <>
          <p className="text-[11px] text-white/35">{t("stagedHint")}</p>
          <div className="space-y-3">
            {report.stagedChanges.map((change) => (
              <StagedChangeRow
                key={change.id}
                change={change}
                isRtl={isRtl}
                onStatus={handleStatus}
                t={t}
              />
            ))}
          </div>
          {approvedCount > 0 ? (
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={handleApply}
            >
              {t("applyApproved")} ({approvedCount})
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
