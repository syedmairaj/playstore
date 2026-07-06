"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type BreakdownRow = {
  phase: "title" | "short" | "long" | "full";
  totalTokens: number;
  totalCredits: number;
};

const PHASE_ORDER: BreakdownRow["phase"][] = ["title", "short", "long", "full"];

const PHASE_LABEL_KEYS = {
  title: "phaseTitle",
  short: "phaseShort",
  long: "phaseLong",
  full: "phaseFull",
} as const;

function PhaseBreakdownBars({
  rows,
  phaseLabels,
}: {
  rows: BreakdownRow[];
  phaseLabels: Record<BreakdownRow["phase"], string>;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const byPhase = new Map(rows.map((r) => [r.phase, r]));
  const credits = PHASE_ORDER.map((phase) => byPhase.get(phase)?.totalCredits ?? 0);
  const maxVal = Math.max(...credits, 1);

  return (
    <div className="space-y-3" aria-label="Credit consumption by listing phase">
      {PHASE_ORDER.map((phase, i) => {
        const value = credits[i];
        const widthPct = Math.round((value / maxVal) * 100);
        const delay = `${i * 70}ms`;
        return (
          <div key={phase} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {phaseLabels[phase]}
            </span>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                role="presentation"
                title={`${value} credits`}
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full bg-emerald-500/80 ring-1 ring-emerald-400/20 transition-[width] ease-out",
                )}
                style={{
                  width: mounted ? `${widthPct}%` : "0%",
                  transitionDuration: "0.55s",
                  transitionDelay: delay,
                }}
              />
            </div>
            <span className="text-end text-xs font-semibold tabular-nums text-zinc-300">
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export type PhaseBreakdownChartProps = {
  workspaceId: string;
};

export function PhaseBreakdownChart({ workspaceId }: PhaseBreakdownChartProps) {
  const t = useTranslations("settings.billing.phaseBreakdown");
  const [rows, setRows] = useState<BreakdownRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const phaseLabels: Record<BreakdownRow["phase"], string> = {
    title: t("phaseTitle"),
    short: t("phaseShort"),
    long: t("phaseLong"),
    full: t("phaseFull"),
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `/api/billing/usage-breakdown?workspaceId=${encodeURIComponent(workspaceId)}`,
          { credentials: "same-origin" },
        );
        const json = (await res.json()) as {
          ok: boolean;
          breakdown?: BreakdownRow[];
          error?: { message: string };
        };

        if (!cancelled) {
          if (json.ok && json.breakdown) {
            setRows(json.breakdown);
          } else {
            setError(json.error?.message ?? t("loadError"));
          }
        }
      } catch {
        if (!cancelled) setError(t("networkError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, t]);

  const hasData = rows != null && rows.some((r) => r.totalCredits > 0 || r.totalTokens > 0);

  return (
    <Card className="border-white/[0.08] bg-zinc-950/60 shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-zinc-100">
          <BarChart3 className="size-4 text-emerald-400" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription className="text-zinc-500">{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-zinc-500">{error}</p>
        ) : loading ? (
          <div className="space-y-3">
            {PHASE_ORDER.map((phase) => (
              <Skeleton key={phase} className="h-2.5 w-full rounded-full" />
            ))}
          </div>
        ) : !hasData ? (
          <p className="text-[11px] italic text-zinc-600">{t("empty")}</p>
        ) : (
          <PhaseBreakdownBars rows={rows ?? []} phaseLabels={phaseLabels} />
        )}
      </CardContent>
    </Card>
  );
}
