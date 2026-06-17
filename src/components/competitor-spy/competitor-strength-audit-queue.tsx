"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Shield, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  isActiveContextCompetitorStrength,
} from "@/lib/competitor-spy/competitor-strength-lifecycle";
import {
  filterQueueForAuditQueueDisplay,
} from "@/lib/competitor-spy/strength-audit-ssot";
import type { CompetitorStrengthAuditItem } from "@/lib/competitor-spy/praise-signal-curation";
import { updateStrengthAuditItem } from "@/lib/client/competitor-strength-audit-store";
import { marketDominatingStrengthToQueueInputs } from "@/lib/client/optimization-queue-client";
import { validateAndQueue } from "@/lib/client/validate-and-queue";
import type { OptimizationQueueItem } from "@/lib/optimization-queue";

function queueRowToAuditItem(row: OptimizationQueueItem): CompetitorStrengthAuditItem {
  const meta = row.metadata ?? {};
  return {
    id: String(meta.audit_item_id ?? row.id),
    term: row.content,
    conversionImpactScore:
      typeof meta.conversion_impact_score === "number" ? meta.conversion_impact_score : 0,
    competitorId: String(meta.competitor_id ?? row.sourceContextId ?? ""),
    competitorName: String(meta.competitor_name ?? row.sourceContext ?? ""),
    status: "pending",
    coreDifferentiator: meta.core_differentiator === true,
    capturedAt: row.stagedAt,
  };
}

type Props = {
  workspaceId: string;
  appId?: string;
  locale: string;
  items: CompetitorStrengthAuditItem[];
  /** Full vault queue (includes AUDIT + ACTIVE strengths). */
  queueItems: OptimizationQueueItem[];
  onQueueChanged: () => void;
  onAuditChanged: () => void;
  addItems: (batch: Parameters<typeof validateAndQueue>[0]["items"]) => Promise<{
    addedCount?: number;
    skippedCount?: number;
  }>;
  isRtl?: boolean;
};

export function CompetitorStrengthAuditQueue({
  workspaceId,
  appId,
  locale,
  items,
  queueItems,
  onQueueChanged,
  onAuditChanged,
  addItems,
  isRtl = false,
}: Props) {
  const t = useTranslations("competitorSpy.strengthAudit");
  const vaultAuditItems = filterQueueForAuditQueueDisplay(queueItems).map(queueRowToAuditItem);
  const pending = vaultAuditItems.length > 0 ? vaultAuditItems : items.filter((item) => item.status === "pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  const isStaged = useCallback(
    (term: string) =>
      queueItems.some(
        (row) =>
          row.content.trim().toLowerCase() === term.trim().toLowerCase() &&
          isActiveContextCompetitorStrength(row),
      ),
    [queueItems],
  );

  const approve = useCallback(
    async (item: CompetitorStrengthAuditItem, coreDifferentiator: boolean) => {
      if (busyId || isStaged(item.term)) return;
      setBusyId(item.id);
      try {
        const inputs = marketDominatingStrengthToQueueInputs(
          [
            {
              term: item.term,
              conversionImpactScore: item.conversionImpactScore,
              coreDifferentiator,
              auditItemId: item.id,
            },
          ],
          item.competitorName,
          item.competitorId,
        );
        const result = await validateAndQueue({
          source: "competitor_spy_strength_audit",
          workspaceId,
          workspaceLocale: locale,
          appId,
          items: inputs,
          existingQueue: queueItems,
          addItems: async (batch) => {
            const response = await addItems(batch);
            return {
              addedCount: response.addedCount ?? 0,
              skippedCount: response.skippedCount,
            };
          },
          navigate: false,
        });

        if (!result.ok) {
          toast.error(result.error ?? t("approveError"));
          return;
        }
        if (result.alreadyQueued) {
          toast.info(t("alreadyStaged"));
        } else {
          toast.success(t("approveSuccess"));
        }

        updateStrengthAuditItem(workspaceId, item.id, {
          status: "approved",
          coreDifferentiator,
        });
        await onQueueChanged();
        onAuditChanged();
      } catch {
        toast.error(t("approveError"));
      } finally {
        setBusyId(null);
      }
    },
    [
      addItems,
      appId,
      busyId,
      isStaged,
      locale,
      onAuditChanged,
      onQueueChanged,
      queueItems,
      t,
      workspaceId,
    ],
  );

  const dismiss = useCallback(
    (item: CompetitorStrengthAuditItem) => {
      updateStrengthAuditItem(workspaceId, item.id, { status: "dismissed" });
      onAuditChanged();
    },
    [onAuditChanged, workspaceId],
  );

  if (pending.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-4"
      aria-labelledby="strength-audit-heading"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className={cn("mb-3 flex items-center gap-2", isRtl && "flex-row-reverse")}>
        <Shield className="size-4 text-amber-300" aria-hidden />
        <div className={isRtl ? "text-end font-arabic" : ""}>
          <h3 id="strength-audit-heading" className="text-sm font-semibold text-amber-100">
            {t("title")}
          </h3>
          <p className="text-[11px] text-amber-200/70">{t("subtitle")}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {pending.map((item) => {
          const staged = isStaged(item.term);
          const busy = busyId === item.id;

          return (
            <li
              key={item.id}
              className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2.5"
            >
              <div
                className={cn(
                  "flex flex-wrap items-start justify-between gap-3",
                  isRtl && "flex-row-reverse",
                )}
              >
                <div className={isRtl ? "text-end font-arabic" : ""}>
                  <p className="text-sm font-medium text-white/90">{item.term}</p>
                  <p className="text-[10px] tabular-nums text-zinc-500">
                    {t("impactMeta", { score: item.conversionImpactScore })}
                  </p>
                </div>

                {staged ? (
                  <span className="rounded border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    {t("stagedBadge")}
                  </span>
                ) : (
                  <div className={cn("flex flex-wrap gap-2", isRtl && "flex-row-reverse")}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void approve(item, true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/35 bg-emerald-600/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-600/30 disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                      ) : (
                        <Check className="size-3" aria-hidden />
                      )}
                      {t("approveCore")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void approve(item, false)}
                      className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-600/15 px-2.5 py-1 text-[11px] font-semibold text-sky-100 hover:bg-sky-600/25 disabled:opacity-50"
                    >
                      {t("approveStandard")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => dismiss(item)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800"
                    >
                      <X className="size-3" aria-hidden />
                      {t("dismiss")}
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
