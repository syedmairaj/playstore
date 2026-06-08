"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type MarginRow = {
  plan: string;
  planLabel: string;
  workspaceCount: number;
  assumedRevenueUsd: number;
  apiCostUsd: number;
  marginUsd: number;
  marginPercent: number | null;
};

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function marginColorClass(plan: string, marginUsd: number): string {
  // Free tier always has $0 revenue → cost is always a net loss display
  if (plan === "free") return "text-rose-400";
  if (marginUsd > 0) return "text-emerald-400";
  if (marginUsd === 0) return "text-slate-400";
  return "text-rose-400";
}

function marginBadgeClass(plan: string, marginUsd: number): string {
  if (plan === "free") return "bg-rose-500/10 ring-rose-500/20 text-rose-300";
  if (marginUsd > 0) return "bg-emerald-500/10 ring-emerald-500/20 text-emerald-300";
  if (marginUsd === 0) return "bg-slate-700/40 ring-slate-600/30 text-slate-400";
  return "bg-rose-500/10 ring-rose-500/20 text-rose-300";
}

export function PlanMarginCheckerPanel() {
  const t = useTranslations("admin.analytics");
  const [rows, setRows] = useState<MarginRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/ai-analytics/plan-margin");
        const data = (await res.json()) as
          | { ok: true; rows: MarginRow[] }
          | { ok: false; error?: { message?: string } };
        if (cancelled) return;
        if (!data.ok) {
          setError(data.error?.message ?? t("loadError"));
          return;
        }
        setRows(data.rows);
      } catch {
        if (!cancelled) setError(t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const totalRevenue = rows.reduce((s, r) => s + r.assumedRevenueUsd, 0);
  const totalApiCost = rows.reduce((s, r) => s + r.apiCostUsd, 0);
  const totalMargin = totalRevenue - totalApiCost;
  const totalMarginPercent = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{t("planMarginTitle")}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{t("planMarginSubtitle")}</p>
        </div>
        {!loading && !error && rows.length > 0 && (
          <div className="shrink-0 rounded-lg border border-slate-700/60 bg-slate-800/50 px-3 py-1.5 text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Net Margin</p>
            <p className={`font-mono text-sm font-bold ${totalMargin >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {fmtUsd(totalMargin)}
            </p>
          </div>
        )}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-slate-400">{t("loading")}</p>
      ) : error ? (
        <p className="mt-6 text-sm text-rose-300">{error}</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{t("empty")}</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[580px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] uppercase tracking-widest text-slate-500">
                <th className="pb-2 pe-3 font-medium">{t("colPlan")}</th>
                <th className="pb-2 px-2 font-medium text-right">{t("colWorkspaces")}</th>
                <th className="pb-2 px-2 font-medium text-right">{t("colRevenue")}</th>
                <th className="pb-2 px-2 font-medium text-right">{t("colApiUsd")}</th>
                <th className="pb-2 ps-3 font-medium text-right">{t("colMargin")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {rows.map((row) => {
                const isFree = row.plan === "free";
                const colorClass = marginColorClass(row.plan, row.marginUsd);
                const badgeClass = marginBadgeClass(row.plan, row.marginUsd);

                return (
                  <tr
                    key={row.plan}
                    className="group transition-colors hover:bg-slate-800/30"
                  >
                    {/* Plan name */}
                    <td className="py-3 pe-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-100">{row.planLabel}</p>
                        {isFree && (
                          <span className="rounded-full bg-slate-700/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-500 ring-1 ring-slate-700">
                            $0 MRR
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Workspace count */}
                    <td className="px-2 py-3 text-right tabular-nums text-slate-300">
                      {row.workspaceCount.toLocaleString()}
                    </td>

                    {/* Revenue */}
                    <td className="px-2 py-3 text-right tabular-nums">
                      {isFree ? (
                        <span className="text-slate-600">$0.00</span>
                      ) : (
                        <span className="text-slate-300">{fmtUsd(row.assumedRevenueUsd)}</span>
                      )}
                    </td>

                    {/* API cost */}
                    <td className="px-2 py-3 text-right tabular-nums text-orange-300">
                      {fmtUsd(row.apiCostUsd)}
                    </td>

                    {/* Margin */}
                    <td className="ps-3 py-3 text-right">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 font-mono text-sm font-semibold ring-1 ${badgeClass}`}
                      >
                        {isFree && row.apiCostUsd > 0
                          ? `−${fmtUsd(row.apiCostUsd)}`
                          : fmtUsd(row.marginUsd)}
                      </span>
                      {!isFree && row.marginPercent != null && (
                        <p className={`mt-0.5 text-[10px] ${colorClass} opacity-70`}>
                          {row.marginPercent.toFixed(1)}%
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-700">
                <td className="py-2.5 pe-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Totals
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-xs font-semibold text-slate-400">
                  {rows.reduce((s, r) => s + r.workspaceCount, 0).toLocaleString()}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-xs font-semibold text-slate-400">
                  {fmtUsd(totalRevenue)}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-xs font-semibold text-orange-300">
                  {fmtUsd(totalApiCost)}
                </td>
                <td className="ps-3 py-2.5 text-right">
                  <span
                    className={`inline-block rounded-md px-2 py-0.5 font-mono text-sm font-bold ring-1 ${
                      totalMargin > 0
                        ? "bg-emerald-500/15 ring-emerald-500/30 text-emerald-200"
                        : totalMargin === 0
                          ? "bg-slate-700/40 ring-slate-600/30 text-slate-300"
                          : "bg-rose-500/15 ring-rose-500/30 text-rose-200"
                    }`}
                  >
                    {fmtUsd(totalMargin)}
                  </span>
                  {totalMarginPercent != null && (
                    <p className={`mt-0.5 text-[10px] ${totalMargin >= 0 ? "text-emerald-400" : "text-rose-400"} opacity-70`}>
                      {totalMarginPercent.toFixed(1)}%
                    </p>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
