"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  FlaskConical,
  LineChart,
  Monitor,
  Sparkles,
  Target,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { ToneAbDeployPlan } from "@/lib/listing/tone-ab-deploy-plan";
import type { ListingVersion } from "@/lib/listing/listing-version.types";

type Props = {
  plan: ToneAbDeployPlan;
  workspaceId?: string;
  selectedAppId?: string;
  listingGenerationId?: string;
  listingVersionId?: string;
  activeVariant: "aggressive" | "growth";
  onSelectVariant: (variant: "aggressive" | "growth") => void;
  isRtl?: boolean;
};

const STEP_IDS = ["create", "control", "copyA", "copyB", "significance"] as const;
type StepId = (typeof STEP_IDS)[number];

function ProTipCard({
  icon: Icon,
  label,
  text,
  tone,
  isRtl,
}: {
  icon: typeof AlertTriangle;
  label: string;
  text: string;
  tone: "amber" | "violet";
  isRtl: boolean;
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-400/55 bg-amber-500/15 text-amber-50 shadow-[0_0_24px_-12px_rgba(251,191,36,0.45)]"
      : "border-violet-400/55 bg-violet-500/15 text-violet-50 shadow-[0_0_24px_-12px_rgba(139,92,246,0.45)]";

  const labelClass =
    tone === "amber" ? "text-amber-300" : "text-violet-300";

  return (
    <div
      className={cn(
        "rounded-xl border-2 px-3.5 py-3",
        toneClass,
        isRtl && "text-end",
      )}
    >
      <p
        className={cn(
          "mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest",
          labelClass,
          isRtl && "flex-row-reverse justify-end",
        )}
      >
        <Sparkles className="size-3 shrink-0" aria-hidden />
        {label}
      </p>
      <p
        className={cn(
          "flex gap-2 text-[11px] font-medium leading-relaxed",
          isRtl && "flex-row-reverse",
        )}
      >
        <Icon className="mt-0.5 size-3.5 shrink-0 opacity-95" aria-hidden />
        <span>{text}</span>
      </p>
    </div>
  );
}

function ChecklistStep({
  stepIndex,
  stepId,
  action,
  checked,
  expanded,
  onToggleChecked,
  onToggleExpanded,
  isRtl,
  armA,
  armB,
  t,
}: {
  stepIndex: number;
  stepId: StepId;
  action: string;
  checked: boolean;
  expanded: boolean;
  onToggleChecked: () => void;
  onToggleExpanded: () => void;
  isRtl: boolean;
  armA: string;
  armB: string;
  t: ReturnType<typeof useTranslations<"optimizer.results.toneAbExperiment">>;
}) {
  const stepT = (key: string) =>
    t(`steps.${stepId}.${key}` as Parameters<typeof t>[0], { armA, armB });

  const detailCallout =
    stepId === "create"
      ? stepT("tip")
      : stepId === "control"
        ? stepT("controlTip")
        : null;

  return (
    <li
      className={cn(
        "rounded-xl border transition-colors",
        checked
          ? "border-violet-500/25 bg-violet-500/5"
          : "border-zinc-800/80 bg-black/20",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2.5 px-3 py-2.5",
          isRtl && "flex-row-reverse",
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={`${t("checklist.heading")} ${stepIndex + 1}: ${action}`}
          onClick={onToggleChecked}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-md border transition",
            checked
              ? "border-violet-400 bg-violet-500 text-white"
              : "border-zinc-600 bg-zinc-900 hover:border-zinc-500",
          )}
        >
          {checked ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}
        </button>

        <div className={cn("min-w-0 flex-1", isRtl && "text-end")}>
          <p
            className={cn(
              "text-[11px] font-semibold text-zinc-500",
              isRtl && "text-end",
            )}
          >
            {t("checklist.heading")} {stepIndex + 1}
          </p>
          <p
            className={cn(
              "text-xs font-semibold leading-snug",
              checked ? "text-zinc-400 line-through" : "text-zinc-100",
            )}
          >
            {action}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-2 py-1 text-[10px] font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200",
            isRtl && "flex-row-reverse",
          )}
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" aria-hidden />
              {t("checklist.hideDetails")}
            </>
          ) : (
            <>
              <ChevronDown className="size-3" aria-hidden />
              {t("checklist.expandDetails")}
            </>
          )}
        </button>
      </div>

      {expanded ? (
        <div
          className={cn(
            "space-y-2 border-t border-zinc-800/70 px-3 py-3",
            isRtl && "text-end",
          )}
        >
          <p className="text-[11px] font-semibold text-zinc-300">{stepT("title")}</p>
          <p className="text-[11px] leading-relaxed text-zinc-500">{stepT("body")}</p>

          {detailCallout ? (
            <p
              className={cn(
                "rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-2.5 py-2 text-[10px] leading-relaxed text-zinc-400",
                isRtl && "text-end",
              )}
            >
              {detailCallout}
            </p>
          ) : null}

          {stepId === "copyA" || stepId === "copyB" ? (
            <p
              className={cn(
                "flex items-center gap-1.5 text-[10px] text-emerald-400/90",
                isRtl && "flex-row-reverse justify-end",
              )}
            >
              <Monitor className="size-3 shrink-0" aria-hidden />
              <span>
                {t("checklist.playstorePrefix")} {stepT("playstoreHint")}
              </span>
            </p>
          ) : null}

          <p
            className={cn(
              "flex items-center gap-1.5 text-[10px] text-sky-400/90",
              isRtl && "flex-row-reverse justify-end",
            )}
          >
            <ArrowRight className="size-3 shrink-0" aria-hidden />
            <span>
              {t("checklist.playConsolePrefix")} {stepT("playConsoleHint")}
            </span>
          </p>
        </div>
      ) : null}
    </li>
  );
}

export function ToneAbDeployPlanCard({
  plan,
  workspaceId,
  selectedAppId,
  listingGenerationId,
  listingVersionId,
  activeVariant,
  onSelectVariant,
  isRtl = false,
}: Props) {
  const t = useTranslations("optimizer.results.toneAbExperiment");
  const attributionHref = workspaceId
    ? `/app/${workspaceId}/performance-attribution`
    : undefined;

  const armADisplay = plan.arms[0].label.replace(" · 50%", "");
  const armBDisplay = plan.arms[1].label.replace(" · 50%", "");
  const labelParams = { armA: armADisplay, armB: armBDisplay };

  const storageKey = workspaceId
    ? `tone-ab-checklist:${workspaceId}:${plan.experimentId}`
    : null;

  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployed, setDeployed] = useState(false);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as number[];
      if (Array.isArray(parsed)) {
        setCheckedSteps(new Set(parsed.filter((n) => n >= 0 && n < STEP_IDS.length)));
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, [storageKey]);

  const persistChecked = useCallback(
    (next: Set<number>) => {
      if (!storageKey || typeof window === "undefined") return;
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    },
    [storageKey],
  );

  const toggleStepChecked = useCallback(
    (index: number) => {
      setCheckedSteps((prev) => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        persistChecked(next);
        return next;
      });
    },
    [persistChecked],
  );

  const toggleStepExpanded = useCallback((index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const completedCount = checkedSteps.size;
  const totalSteps = STEP_IDS.length;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);
  const setupComplete = completedCount === totalSteps;

  const stepActions = useMemo(
    () =>
      STEP_IDS.map((id) =>
        t(`steps.${id}.action` as Parameters<typeof t>[0], labelParams),
      ),
    [t, armADisplay, armBDisplay],
  );

  const resolveVersionId = useCallback(async (): Promise<string | null> => {
    if (listingVersionId) return listingVersionId;
    if (!workspaceId) return null;

    const params = new URLSearchParams({ limit: "50" });
    if (selectedAppId?.trim()) params.set("appId", selectedAppId.trim());

    const res = await fetch(
      `/api/workspaces/${workspaceId}/listing-versions?${params}`,
    );
    if (!res.ok) return null;

    const json = (await res.json()) as { versions?: ListingVersion[] };
    const versions = json.versions ?? [];
    if (listingGenerationId) {
      const match = versions.find(
        (v) => v.sourceGenerationId === listingGenerationId,
      );
      if (match) return match.id;
    }
    return versions[0]?.id ?? null;
  }, [listingVersionId, workspaceId, selectedAppId, listingGenerationId]);

  const patchVersion = useCallback(
    async (versionId: string, action: string) => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/listing-versions/${versionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as { version: ListingVersion };
    },
    [workspaceId],
  );

  const handleMarkWinnerLive = useCallback(async () => {
    if (!workspaceId) {
      toast.error(t("cta.toastSaveFirst"));
      return;
    }

    setDeployBusy(true);
    try {
      const versionId = await resolveVersionId();
      if (!versionId) {
        toast.error(t("cta.toastNoVersion"));
        return;
      }

      const getRes = await fetch(
        `/api/workspaces/${workspaceId}/listing-versions/${versionId}`,
      );
      if (!getRes.ok) throw new Error(await getRes.text());
      const { version } = (await getRes.json()) as { version: ListingVersion };

      if (version.status === "deployed") {
        setDeployed(true);
        toast.success(t("cta.toastAlreadyLive"));
        return;
      }

      if (version.status === "draft") {
        await patchVersion(versionId, "publish");
      }

      await patchVersion(versionId, "deploy");
      setDeployed(true);
      toast.success(t("cta.toastSuccess"));
    } catch {
      toast.error(t("cta.toastError"));
    } finally {
      setDeployBusy(false);
    }
  }, [workspaceId, resolveVersionId, patchVersion, t]);

  const canMarkLive = Boolean(workspaceId);

  return (
    <div
      className={cn(
        "rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-950/40 via-[#0a0c12] to-[#07120e] p-6",
        "shadow-[0_10px_36px_-18px_rgba(139,92,246,0.35)] ring-1 ring-violet-500/15",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300",
        isRtl && "font-arabic text-end",
      )}
    >
      <div className={cn("mb-4 flex flex-wrap items-start gap-3", isRtl && "flex-row-reverse")}>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10">
          <FlaskConical className="size-4 text-violet-300" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-violet-300/90">
            {t("kicker")}
          </p>
          <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-white/95">
            {t("title", labelParams)}
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{t("subtitle")}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        {plan.arms.map((arm) => {
          const selected = activeVariant === arm.metadataVariant;
          return (
            <button
              key={arm.tone}
              type="button"
              onClick={() => onSelectVariant(arm.metadataVariant)}
              className={cn(
                "rounded-xl border p-3 text-start transition-colors",
                selected
                  ? "border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/25"
                  : "border-zinc-800/80 bg-white/[0.02] hover:border-zinc-700",
                isRtl && "text-end",
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-400">
                {arm.metadataVariant === "aggressive" ? t("variantA") : t("variantB")}
              </p>
              <p className="mt-1 text-xs font-bold text-zinc-100">{arm.label}</p>
              <p
                className={cn(
                  "mt-1.5 flex items-center gap-1 text-[10px] text-zinc-500",
                  isRtl && "flex-row-reverse justify-end",
                )}
              >
                <ClipboardCopy className="size-3 shrink-0" aria-hidden />
                {t("previewHint")}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <ProTipCard
          icon={AlertTriangle}
          label={t("proTipLabel")}
          text={t("proTips.noOverlap")}
          tone="amber"
          isRtl={isRtl}
        />
        <ProTipCard
          icon={LineChart}
          label={t("proTipLabel")}
          text={t("proTips.significance")}
          tone="violet"
          isRtl={isRtl}
        />
      </div>

      <div className="mb-4 rounded-xl border border-zinc-800/80 bg-black/25 px-4 py-3">
        <div
          className={cn(
            "mb-3 flex flex-wrap items-center justify-between gap-2",
            isRtl && "flex-row-reverse",
          )}
        >
          <p className="text-[11px] font-semibold text-zinc-300">{t("checklist.heading")}</p>
          <p className="text-[10px] font-medium text-violet-300/90">
            {t("checklist.progress", {
              done: completedCount,
              total: totalSteps,
            })}
          </p>
        </div>

        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-violet-400/80 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("checklist.progress", {
              done: completedCount,
              total: totalSteps,
            })}
          />
        </div>

        <ol className="space-y-2">
          {STEP_IDS.map((stepId, i) => (
            <ChecklistStep
              key={stepId}
              stepIndex={i}
              stepId={stepId}
              action={stepActions[i]}
              checked={checkedSteps.has(i)}
              expanded={expandedSteps.has(i)}
              onToggleChecked={() => toggleStepChecked(i)}
              onToggleExpanded={() => toggleStepExpanded(i)}
              isRtl={isRtl}
              armA={armADisplay}
              armB={armBDisplay}
              t={t}
            />
          ))}
        </ol>
      </div>

      <div
        className={cn(
          "mb-4 rounded-2xl border px-4 py-4 transition-all duration-300 sm:px-5 sm:py-5",
          setupComplete
            ? "border-emerald-400/50 bg-gradient-to-br from-emerald-500/20 via-emerald-950/30 to-[#07120e] ring-2 ring-emerald-500/35 shadow-[0_0_48px_-14px_rgba(34,197,94,0.55)]"
            : "border-emerald-500/25 bg-emerald-500/5",
        )}
      >
        <p
          className={cn(
            "flex items-center gap-2 text-[11px] font-semibold",
            setupComplete ? "text-emerald-100" : "text-emerald-200",
            isRtl && "flex-row-reverse justify-end",
          )}
        >
          <Upload className="size-3.5 shrink-0" aria-hidden />
          {setupComplete ? t("cta.headingReady") : t("cta.heading")}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{t("cta.body")}</p>
        <div className={cn("mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", isRtl && "sm:flex-row-reverse")}>
          <button
            type="button"
            disabled={!canMarkLive || deployBusy || deployed}
            onClick={() => void handleMarkWinnerLive()}
            className={cn(
              "inline-flex w-full items-center justify-center gap-2 rounded-xl font-semibold transition sm:w-auto",
              setupComplete ? "min-h-[52px] px-8 text-sm sm:text-base" : "min-h-[44px] px-5 text-xs",
              deployed
                ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                : "bg-emerald-600 text-white shadow-[0_8px_28px_-8px_rgba(34,197,94,0.45)] hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45",
            )}
          >
            {deployed ? (
              <>
                <CheckCircle2 className="size-4" aria-hidden />
                {t("cta.markedLive")}
              </>
            ) : deployBusy ? (
              t("cta.updating")
            ) : (
              <>
                <Upload className="size-4" aria-hidden />
                {t("cta.markLive")}
              </>
            )}
          </button>
          {!listingGenerationId && !listingVersionId ? (
            <p className="text-[10px] text-amber-200/80">{t("cta.saveFirstHint")}</p>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-black/20 px-4 py-3">
        <p
          className={cn(
            "flex items-center gap-2 text-[11px] font-semibold text-zinc-300",
            isRtl && "flex-row-reverse justify-end",
          )}
        >
          <Target className="size-3.5 text-violet-400" aria-hidden />
          {t("whileRunning.heading")}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
          {t("whileRunning.body", labelParams)}
        </p>
        {attributionHref ? (
          <Link
            href={attributionHref}
            className="mt-2 inline-flex text-xs font-medium text-violet-300 underline-offset-2 hover:text-violet-200 hover:underline"
          >
            {t("whileRunning.attributionLink")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
