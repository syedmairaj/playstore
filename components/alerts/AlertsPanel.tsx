"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, KeyRound, Loader2, ScanLine, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AlertRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: string;
  read_at: string | null;
  created_at: string;
  keyword_id: string | null;
  meta: unknown;
};

type AsoImprovementMeta = {
  listing_generation_id?: string;
  fromRank?: number;
  toRank?: number;
  positions?: number;
  keywordTerm?: string;
};

function parseAsoMeta(meta: unknown): AsoImprovementMeta | null {
  if (!meta || typeof meta !== "object") return null;
  return meta as AsoImprovementMeta;
}

type FilterKey = "all" | "keyword" | "competitor" | "sentiment";

const FILTER_PILLS: { key: FilterKey; emoji: string }[] = [
  { key: "all", emoji: "" },
  { key: "keyword", emoji: "📉" },
  { key: "competitor", emoji: "⚔️" },
  { key: "sentiment", emoji: "🚨" },
];

const SEVERITY_STYLES = {
  critical: {
    card: "border-rose-500/25 bg-rose-500/[0.06]",
    badge: "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/20",
    dot: "bg-rose-400",
  },
  warning: {
    card: "border-amber-500/25 bg-amber-500/[0.05]",
    badge: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20",
    dot: "bg-amber-400",
  },
  info: {
    card: "border-blue-500/20 bg-blue-500/[0.04]",
    badge: "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20",
    dot: "bg-blue-400",
  },
} as const;

function LiveAlertCard({
  alert,
  t,
}: {
  alert: AlertRow;
  t: ReturnType<typeof useTranslations<"workspaceAlerts">>;
}) {
  const asoMeta = alert.type === "aso_rank_improvement" ? parseAsoMeta(alert.meta) : null;
  const title =
    asoMeta?.keywordTerm != null && asoMeta.fromRank != null && asoMeta.toRank != null
      ? t("asoRankImprovement.title")
      : alert.title;
  const body =
    asoMeta?.keywordTerm != null && asoMeta.fromRank != null && asoMeta.toRank != null
      ? t("asoRankImprovement.body", {
          keyword: asoMeta.keywordTerm,
          from: asoMeta.fromRank,
          to: asoMeta.toRank,
        })
      : alert.body;

  const isUnread = !alert.read_at;

  return (
    <li
      className={cn(
        "rounded-2xl border p-5 transition-[box-shadow,border-color] duration-200",
        "hover:shadow-[0_4px_24px_-8px_rgba(0,0,0,0.35)]",
        isUnread
          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
          : "border-zinc-800/70 bg-zinc-900/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
            {alert.type.replace(/_/g, " ")}
          </p>
          <h3 className="text-sm font-semibold leading-snug text-white">{title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isUnread && (
            <span
              aria-hidden
              className="size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_1px_rgba(52,211,153,0.6)]"
            />
          )}
          <span className="text-[11px] text-zinc-600">
            {new Date(alert.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{body}</p>
    </li>
  );
}

type ScanState = "idle" | "confirm" | "running";

type ScanResult =
  | {
      ok: true;
      alertsWritten: number;
      creditsRemaining: number;
    }
  | {
      ok: false;
      error: { code: string; message: string; remaining?: number; required?: number };
    };

export function AlertsPanel({
  workspaceId,
  initialAlerts,
  trackedKeywordsCount = 0,
}: {
  workspaceId: string;
  initialAlerts: AlertRow[];
  trackedKeywordsCount?: number;
}) {
  const router = useRouter();
  const t = useTranslations("workspaceAlerts");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);

  const unreadIds = useMemo(
    () => initialAlerts.filter((a) => !a.read_at).map((a) => a.id),
    [initialAlerts],
  );

  const hasLiveAlerts = initialAlerts.length > 0;
  const isSetupEmpty = trackedKeywordsCount === 0;

  async function runScan() {
    setScanState("running");
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/alerts/scan`, {
        method: "POST",
        credentials: "same-origin",
      });
      const json = (await res.json()) as ScanResult;

      if (!json.ok) {
        setScanState("idle");
        if (json.error.code === "insufficient_credits") {
          setError(t("page.scan.insufficientCredits"));
        } else {
          setError(json.error.message ?? t("page.scan.errorRefunded"));
        }
        return;
      }

      // ── Success: update local credit display + refresh server data ───────
      setCreditsRemaining(json.creditsRemaining);
      setScanState("idle");

      if (json.alertsWritten > 0) {
        toast.success(t("page.scan.successToast", { count: json.alertsWritten }));
      } else {
        toast.info(t("page.scan.noNewAlerts"));
      }

      // Trigger Next.js server component re-fetch so new alerts appear
      router.refresh();
    } catch (_err) {
      setScanState("idle");
      setError(t("page.scan.errorRefunded"));
    }
  }

  async function markAllRead() {
    if (unreadIds.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/alerts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertIds: unreadIds }),
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      router.refresh();
    } catch (_err) {
      setError("Could not update alerts.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTER_PILLS.map(({ key, emoji }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveFilter(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-[background-color,border-color,color] duration-150",
              activeFilter === key
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
            )}
          >
            {emoji && <span aria-hidden>{emoji}</span>}
            {t(`page.filters.${key}`)}
          </button>
        ))}

        {/* Right-side action group */}
        <div className="ms-auto flex shrink-0 items-center gap-2">
          {hasLiveAlerts && unreadIds.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={markAllRead}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-[background-color,border-color,color] duration-150 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
            >
              {busy ? t("page.updating") : t("page.markAllRead")}
            </button>
          )}

          {/* Scan Now CTA — locked when no keywords are tracked */}
          <button
            type="button"
            disabled={isSetupEmpty || scanState === "running"}
            onClick={() => !isSetupEmpty && setScanState("confirm")}
            title={isSetupEmpty ? "Add tracked keywords before scanning" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-[background-color,box-shadow,opacity] duration-150",
              isSetupEmpty
                ? "cursor-not-allowed border border-zinc-700/50 bg-zinc-800/40 text-zinc-600"
                : cn(
                    "border border-emerald-500/35 bg-emerald-500/12 text-emerald-300",
                    "hover:border-emerald-500/55 hover:bg-emerald-500/20 hover:shadow-[0_2px_12px_-4px_rgba(52,211,153,0.3)]",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  ),
            )}
          >
            {isSetupEmpty ? (
              <KeyRound className="size-3.5" aria-hidden />
            ) : scanState === "running" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <ScanLine className="size-3.5" aria-hidden />
            )}
            {isSetupEmpty
              ? "Scan Locked"
              : scanState === "running"
                ? t("page.scan.ctaRunning")
                : t("page.scan.cta")}
            {!isSetupEmpty && scanState !== "running" && (
              <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                {t("page.scan.creditCost")}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Credit balance update indicator */}
      {creditsRemaining !== null && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2">
          <Zap className="size-3.5 shrink-0 text-emerald-400" aria-hidden />
          <p className="text-xs text-emerald-400/80">
            Credits remaining after scan:{" "}
            <span className="font-semibold text-emerald-300">{creditsRemaining}</span>
          </p>
        </div>
      )}

      {/* Scan confirm dialog */}
      {scanState === "confirm" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setScanState("idle")}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#0c1018] p-6 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.7)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10">
              <ScanLine className="size-5 text-emerald-400" aria-hidden />
            </div>
            <h2 className="text-base font-semibold text-white">
              {t("page.scan.confirmTitle")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              This scan will use 1 credit to query live App Store &amp; Google Play indexing
              positions across your {trackedKeywordsCount} tracked keyword
              {trackedKeywordsCount !== 1 ? "s" : ""}.
            </p>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-400" aria-hidden />
              <p className="text-[12px] leading-relaxed text-amber-400/80">
                If your tracked keywords or app storefront metadata haven&apos;t changed since
                your last check, this scan may return 0 new alerts.
              </p>
            </div>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setScanState("idle")}
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/80 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
              >
                {t("page.scan.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  void runScan();
                }}
                className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white shadow-[0_2px_12px_-4px_rgba(34,197,94,0.5)] transition-[background-color,box-shadow] hover:bg-emerald-500 hover:shadow-[0_4px_18px_-4px_rgba(34,197,94,0.55)]"
              >
                {t("page.scan.confirmCta")}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p
          className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Live alerts (when they exist) */}
      {hasLiveAlerts && (
        <ul className="space-y-3">
          {initialAlerts.map((a) => (
            <LiveAlertCard key={a.id} alert={a} t={t} />
          ))}
        </ul>
      )}

      {/* Empty state — two cases */}
      {!hasLiveAlerts && (
        <>
          {/* ── CASE A: No keywords tracked yet ──────────────────────────── */}
          {isSetupEmpty && (
            <div className="relative overflow-hidden rounded-2xl border border-dashed border-amber-500/30 bg-[#0c1018]">
              {/* Ambient amber glow */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(245,158,11,0.08)_0%,transparent_70%)]"
              />
              {/* Grid overlay */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.025]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.6) 1px,transparent 1px)",
                  backgroundSize: "32px 32px",
                }}
              />

              <div className="relative flex flex-col items-center px-6 py-16 text-center">
                {/* Icon lockup */}
                <div className="relative mb-6">
                  <div
                    aria-hidden
                    className="absolute inset-0 scale-[1.6] rounded-full bg-amber-500/10 blur-xl"
                  />
                  <div className="relative flex size-14 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] shadow-[0_0_24px_-4px_rgba(245,158,11,0.2)]">
                    <AlertTriangle className="size-6 text-amber-400" strokeWidth={1.5} />
                  </div>
                </div>

                {/* Headline */}
                <h3 className="text-base font-semibold tracking-tight text-white">
                  ⚠️ Setup Required Before Scanning
                </h3>

                {/* Body copy */}
                <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-zinc-500">
                  You haven&apos;t configured any tracking keywords for this workspace yet.
                  The scan engine has no assets to monitor — add at least one tracked keyword
                  to activate your alert infrastructure.
                </p>

                {/* CTA to keywords page */}
                <a
                  href={`/app/${workspaceId}/keywords`}
                  className={cn(
                    "mt-7 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold",
                    "bg-amber-500 text-zinc-950 shadow-[0_2px_16px_-4px_rgba(245,158,11,0.4)]",
                    "transition-[background-color,box-shadow] duration-150",
                    "hover:bg-amber-400 hover:shadow-[0_4px_20px_-4px_rgba(245,158,11,0.55)]",
                  )}
                >
                  <KeyRound className="size-4" aria-hidden />
                  Configure Keyword Tracking
                </a>

                {/* Footer note */}
                <p className="mt-6 text-[11px] tracking-wide text-zinc-600">
                  🔒 Each manual scan instantly checks live App Store &amp; Google Play indexing metrics.
                </p>
              </div>
            </div>
          )}

          {/* ── CASE B: Keywords exist, zero alerts yet ───────────────────── */}
          {!isSetupEmpty && (
            <div className="relative overflow-hidden rounded-2xl border border-dashed border-zinc-700/50 bg-zinc-900/30">
              {/* Ambient emerald glow */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(52,211,153,0.07)_0%,transparent_70%)]"
              />
              {/* Grid overlay */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.6) 1px,transparent 1px)",
                  backgroundSize: "32px 32px",
                }}
              />

              <div className="relative flex flex-col items-center px-6 py-16 text-center">
                {/* Icon lockup */}
                <div className="relative mb-6">
                  <div
                    aria-hidden
                    className="absolute inset-0 scale-[1.6] rounded-full bg-emerald-500/10 blur-xl"
                  />
                  <div className="relative flex size-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] shadow-[0_0_24px_-4px_rgba(52,211,153,0.15)]">
                    <ScanLine className="size-6 text-emerald-400" strokeWidth={1.5} />
                  </div>
                  {/* Live pulse dot */}
                  <span
                    aria-hidden
                    className="absolute -end-1 -top-1 flex size-3.5 items-center justify-center rounded-full border border-zinc-900 bg-emerald-400"
                  >
                    <span className="absolute size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  </span>
                </div>

                {/* Headline */}
                <h3 className="text-base font-semibold tracking-tight text-white">
                  Your alert infrastructure is active
                </h3>

                {/* Body copy */}
                <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-zinc-500">
                  No major rank drops have been detected across your{" "}
                  <span className="font-semibold text-zinc-400">{trackedKeywordsCount}</span>{" "}
                  tracked keyword{trackedKeywordsCount !== 1 ? "s" : ""} yet. Alerts surface
                  automatically as storefront signals change — or trigger a live check below.
                </p>

                {/* Divider */}
                <div className="my-6 flex w-full max-w-xs items-center gap-3">
                  <span className="h-px flex-1 bg-zinc-800" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    or trigger manually
                  </span>
                  <span className="h-px flex-1 bg-zinc-800" />
                </div>

                {/* Scan CTA */}
                <button
                  type="button"
                  disabled={scanState === "running"}
                  onClick={() => setScanState("confirm")}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold",
                    "border border-emerald-500/35 bg-emerald-500/12 text-emerald-300",
                    "shadow-[0_2px_16px_-4px_rgba(52,211,153,0.2)]",
                    "transition-[background-color,box-shadow,border-color] duration-150",
                    "hover:border-emerald-500/55 hover:bg-emerald-500/20 hover:shadow-[0_4px_20px_-4px_rgba(52,211,153,0.35)]",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  {scanState === "running" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <ScanLine className="size-4" aria-hidden />
                  )}
                  {scanState === "running" ? t("page.scan.ctaRunning") : "Run Marketplace Scan Now"}
                  {scanState !== "running" && (
                    <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                      1 credit
                    </span>
                  )}
                </button>

                {/* Footer note */}
                <p className="mt-6 text-[11px] tracking-wide text-zinc-500/80">
                  🔒 Each manual scan instantly checks live App Store &amp; Google Play indexing metrics.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
