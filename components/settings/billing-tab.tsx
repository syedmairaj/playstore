"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PricingModal } from "@/components/ui/pricing-modal";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CreditsLedgerEntry } from "@/components/settings/settings-types";
import { normalizePlan, PLAN_META, type PlanId } from "@/lib/plan-limits";
import { cn } from "@/lib/utils";

type TimeHorizon = "7days" | "30days" | "thisMonth" | "lastMonth";

const TIME_HORIZON_OPTIONS: TimeHorizon[] = ["7days", "30days", "thisMonth", "lastMonth"];

const LEDGER_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
type LedgerPageSize = (typeof LEDGER_PAGE_SIZE_OPTIONS)[number];

function formatLedgerDate(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function getRangeBounds(horizon: TimeHorizon): { start: Date; end: Date } {
  const now = new Date();
  switch (horizon) {
    case "7days": {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { start, end: now };
    }
    case "30days": {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      return { start, end: now };
    }
    case "thisMonth":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
    case "lastMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }
  }
}

function filterLedgerByHorizon(entries: CreditsLedgerEntry[], horizon: TimeHorizon) {
  const { start, end } = getRangeBounds(horizon);
  return entries.filter((entry) => {
    const created = new Date(entry.created_at);
    return created >= start && created <= end;
  });
}

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function ledgerFeatureLabel(entry: CreditsLedgerEntry, t: ReturnType<typeof useTranslations>) {
  const meta = entry.meta;
  if (meta && typeof meta.tool === "string") return meta.tool;
  if (meta && typeof meta.route === "string") {
    const route = meta.route as string;
    if (route.includes("serper")) return t("billing.ledger.features.serper");
    if (route.includes("localize")) return t("billing.ledger.features.localize");
    if (route.includes("sentiment")) return t("billing.ledger.features.sentiment");
    if (route.includes("generate")) return t("billing.ledger.features.listing");
  }
  return entry.description || entry.source_type;
}

function ledgerTargetIdentity(entry: CreditsLedgerEntry): string {
  const meta = entry.meta;
  if (!meta || typeof meta !== "object") return "—";
  if (typeof meta.keyword === "string" && meta.keyword.trim()) return meta.keyword;
  if (typeof meta.package_name === "string" && meta.package_name.trim()) return meta.package_name;
  if (typeof meta.appId === "string" && meta.appId.trim()) return meta.appId;
  if (Array.isArray(meta.countries) && meta.countries.length > 0) {
    return meta.countries.slice(0, 3).join(", ");
  }
  return "—";
}

function ledgerCreditsCharged(entry: CreditsLedgerEntry): string {
  const spent = entry.amount < 0;
  const magnitude = Math.abs(entry.amount);
  return spent ? `-${magnitude}` : `+${magnitude}`;
}

export function BillingTab({
  workspaceId,
  plan,
  creditsRemaining,
  creditsAllocation,
  keywordCount,
  keywordLimit,
  ledgerEntries,
  isOwner,
  busy,
  onChangePlan,
}: {
  workspaceId: string;
  plan: string;
  creditsRemaining: number;
  creditsAllocation: number;
  keywordCount: number;
  keywordLimit: number;
  ledgerEntries: CreditsLedgerEntry[];
  isOwner: boolean;
  busy: boolean;
  onChangePlan: (plan: "free" | "pro" | "growth") => void;
}) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const normalized = normalizePlan(plan) as PlanId;
  const meta = PLAN_META[normalized];

  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>("30days");
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState<LedgerPageSize>(10);
  const [pricingModalOpen, setPricingModalOpen] = useState(false);

  const creditsPct = useMemo(() => {
    if (creditsAllocation <= 0) return 0;
    return Math.round((creditsRemaining / creditsAllocation) * 100);
  }, [creditsRemaining, creditsAllocation]);

  const keywordsPct = useMemo(() => {
    if (keywordLimit <= 0) return 0;
    return Math.round((keywordCount / keywordLimit) * 100);
  }, [keywordCount, keywordLimit]);

  const filteredEntries = useMemo(
    () => filterLedgerByHorizon(ledgerEntries, timeHorizon),
    [ledgerEntries, timeHorizon],
  );

  const totalFiltered = filteredEntries.length;
  const ledgerPageCount = Math.max(1, Math.ceil(totalFiltered / ledgerPageSize));
  const safeLedgerPage = Math.min(ledgerPage, ledgerPageCount);

  const paginatedEntries = useMemo(() => {
    const start = (safeLedgerPage - 1) * ledgerPageSize;
    return filteredEntries.slice(start, start + ledgerPageSize);
  }, [filteredEntries, safeLedgerPage, ledgerPageSize]);

  const rangeStart = totalFiltered === 0 ? 0 : (safeLedgerPage - 1) * ledgerPageSize + 1;
  const rangeEnd = Math.min(safeLedgerPage * ledgerPageSize, totalFiltered);

  useEffect(() => {
    setLedgerPage(1);
  }, [timeHorizon]);

  useEffect(() => {
    setLedgerPage(1);
  }, [ledgerPageSize]);

  useEffect(() => {
    if (ledgerPage !== safeLedgerPage) {
      setLedgerPage(safeLedgerPage);
    }
  }, [ledgerPage, safeLedgerPage]);

  function handleExportCSV() {
    const headers = [
      t("billing.columns.date"),
      t("billing.columns.feature"),
      t("billing.columns.target"),
      t("billing.columns.credits"),
    ];
    const rows = filteredEntries.map((entry) => [
      formatLedgerDate(entry.created_at, locale),
      ledgerFeatureLabel(entry, t),
      ledgerTargetIdentity(entry),
      ledgerCreditsCharged(entry),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(","))
      .join("\n");
    const dateStamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `credit_ledger_${dateStamp}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-white/[0.08] bg-zinc-950/60 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-zinc-100">
              {t("billing.aiCredits")}
            </CardTitle>
            <CardDescription className="text-zinc-500">
              {t("billing.aiCreditsHint")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-semibold tabular-nums text-white">
              {creditsRemaining}
              <span className="text-base font-normal text-zinc-500"> / {creditsAllocation}</span>
            </p>
            <Progress value={creditsPct} />
            <p className="text-xs text-zinc-500">{t("billing.creditsRemaining", { pct: creditsPct })}</p>
            <Button
              type="button"
              variant="outline"
              className="w-full border-white/[0.12] bg-transparent text-zinc-200 hover:bg-white/[0.06] hover:text-white sm:w-auto"
              onClick={() => setPricingModalOpen(true)}
            >
              {t("billing.upgradeManagePlan")}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-white/[0.08] bg-zinc-950/60 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-zinc-100">
              {t("billing.trackedKeywords")}
            </CardTitle>
            <CardDescription className="text-zinc-500">
              {t("billing.keywordsHint", { plan: meta.label })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-semibold tabular-nums text-white">
              {keywordCount}
              <span className="text-base font-normal text-zinc-500"> / {keywordLimit}</span>
            </p>
            <Progress value={keywordsPct} />
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-zinc-950/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-zinc-400">{t("billing.currentPlan")}</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {meta.label}{" "}
              <span className="text-sm font-normal text-zinc-500">
                (${meta.priceMonthly}/mo)
              </span>
            </p>
          </div>
          <Button
            type="button"
            className="bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
            onClick={() => setPricingModalOpen(true)}
          >
            {t("billing.upgradeManagePlan")}
          </Button>
        </div>
        {isOwner ? (
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {t("billing.changePlanOwner")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["free", "pro", "growth"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={busy || normalized === p}
                  onClick={() => onChangePlan(p)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition",
                    normalized === p
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                      : "border-white/[0.1] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">{t("billing.ledgerTitle")}</h3>
          <p className="mt-1 text-xs text-zinc-500">{t("billing.ledgerHint")}</p>
        </div>

        <div className="mb-4 flex w-full flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5 sm:max-w-xs sm:flex-1">
            <span className="text-xs font-medium text-zinc-500">{t("billing.timeRange.label")}</span>
            <Select value={timeHorizon} onValueChange={(v) => setTimeHorizon(v as TimeHorizon)}>
              <SelectTrigger
                aria-label={t("billing.timeRange.label")}
                className="border-white/[0.12] bg-zinc-950/80 text-zinc-200"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/[0.12] bg-zinc-950 text-zinc-200">
                {TIME_HORIZON_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`billing.timeRange.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            className="inline-flex items-center gap-2 border-white/[0.12] bg-transparent text-zinc-200 hover:bg-white/[0.06] hover:text-white"
            disabled={filteredEntries.length === 0}
            onClick={handleExportCSV}
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            {t("billing.exportLedger")}
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/[0.08]">
          {filteredEntries.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">{t("billing.ledgerEmpty")}</p>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("billing.columns.date")}</TableHead>
                  <TableHead>{t("billing.columns.feature")}</TableHead>
                  <TableHead>{t("billing.columns.target")}</TableHead>
                  <TableHead className="text-end">{t("billing.columns.credits")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEntries.map((entry) => {
                  const spent = entry.amount < 0;
                  const magnitude = Math.abs(entry.amount);
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-start text-zinc-400">
                        {formatLedgerDate(entry.created_at, locale)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-start font-medium text-zinc-200">
                        {ledgerFeatureLabel(entry, t)}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-start text-zinc-500">
                        {ledgerTargetIdentity(entry)}
                      </TableCell>
                      <TableCell className="text-end">
                        {spent ? (
                          <Badge
                            variant="outline"
                            className="border-orange-500/30 bg-orange-500/10 font-semibold text-orange-300"
                          >
                            -{magnitude} {t("billing.creditUnit")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/10 font-semibold text-emerald-300"
                          >
                            +{magnitude} {t("billing.creditUnit")}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
              <div className="flex flex-col gap-3 border-t border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-500">
                  {t("billing.ledgerPagination.showingRange", {
                    from: rangeStart,
                    to: rangeEnd,
                    total: totalFiltered,
                  })}
                </p>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-400">
                    <span>{t("billing.ledgerPagination.rowsPerPage")}</span>
                    <select
                      value={ledgerPageSize}
                      onChange={(e) =>
                        setLedgerPageSize(Number(e.target.value) as LedgerPageSize)
                      }
                      aria-label={t("billing.ledgerPagination.rowsPerPage")}
                      className="h-9 rounded-md border border-white/[0.1] bg-zinc-950 ps-2 pe-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                    >
                      {LEDGER_PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={safeLedgerPage <= 1}
                      onClick={() => setLedgerPage(safeLedgerPage - 1)}
                      className="h-9 border-white/[0.1] bg-transparent text-zinc-300 hover:bg-white/[0.05]"
                    >
                      {t("billing.ledgerPagination.prevPage")}
                    </Button>
                    <span className="min-w-[7rem] text-center text-xs tabular-nums text-zinc-400">
                      {t("billing.ledgerPagination.pageOf", {
                        page: safeLedgerPage,
                        total: ledgerPageCount,
                      })}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={safeLedgerPage >= ledgerPageCount}
                      onClick={() => setLedgerPage(safeLedgerPage + 1)}
                      className="h-9 border-white/[0.1] bg-transparent text-zinc-300 hover:bg-white/[0.05]"
                    >
                      {t("billing.ledgerPagination.nextPage")}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <PricingModal
        open={pricingModalOpen}
        onOpenChange={setPricingModalOpen}
        currentPlan={normalized}
        workspaceId={workspaceId}
      />
    </div>
  );
}
