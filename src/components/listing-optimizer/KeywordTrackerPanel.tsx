"use client";

/**
 * Keyword Tracker — minimal Active Context overview panel.
 * Quick scan: keyword + difficulty. Details live in Validator / Tracker.
 */

import { useCallback, useMemo, useState } from "react";
import { Hash, Loader2, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ActiveContextSlot,
  ActiveContextSlotEmpty,
} from "@/components/staging-workspace/active-context-slot";
import { ActiveContextSignalList } from "@/components/staging-workspace/active-context-signal-list";
import {
  difficultyBadge,
  type KeywordSignal,
} from "@/lib/staging/keyword-signals";
import {
  KEYWORD_SIGNALS_KEY,
  useKeywordSignals,
  patchKeywordSignalsCache,
  type VaultLocale,
} from "@/hooks/useOptimizerSync";

const T = {
  border: "rgba(255, 255, 255, 0.06)",
  help: "rgba(148, 163, 184, 0.42)",
  rowHover: "rgba(255, 255, 255, 0.04)",
  accent: "#a5b4fc",
} as const;

const ROW_H = 30;

export interface KeywordTrackerPanelProps {
  workspaceId: string;
  appId: string;
  vaultLocale: VaultLocale;
  isRtl?: boolean;
  onOpenValidator: (keyword: string, signal?: KeywordSignal) => void;
  isLoading?: boolean;
  /** Queue-backed tracker category signals (SSOT). Falls back to vault keyword-signals API. */
  trackerSignals?: KeywordSignal[];
}

function DifficultyPill({
  difficulty,
  label,
  isRtl,
}: {
  difficulty: number;
  label: string;
  isRtl?: boolean;
}) {
  const d = difficultyBadge(difficulty);
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-px text-[8px] font-semibold ${
        isRtl ? "font-arabic" : "uppercase tracking-wide"
      }`}
      style={{ color: d.color, backgroundColor: d.bg, borderColor: d.border }}
    >
      {label}
    </span>
  );
}

function KeywordRow({
  signal,
  isRtl,
  isRemoving,
  difficultyText,
  onRowClick,
  onRemove,
  removeLabel,
}: {
  signal: KeywordSignal;
  isRtl?: boolean;
  isRemoving: boolean;
  difficultyText: string;
  onRowClick: () => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onRowClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRowClick();
        }
      }}
      className={`group flex cursor-pointer items-center gap-2.5 px-1 py-0.5 transition-colors duration-150 ${
        isRtl ? "flex-row-reverse" : ""
      }`}
      style={{ minHeight: ROW_H }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = T.rowHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <span
        className="min-w-0 flex-1 truncate text-start text-[12px] font-medium text-white/90"
        dir="auto"
      >
        {signal.keyword}
      </span>

      <DifficultyPill difficulty={signal.difficulty} label={difficultyText} isRtl={isRtl} />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        disabled={isRemoving}
        className="shrink-0 rounded p-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
        style={{ color: "rgba(148, 163, 184, 0.4)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#f87171";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "rgba(148, 163, 184, 0.4)";
        }}
        aria-label={removeLabel}
      >
        {isRemoving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <X className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

export default function KeywordTrackerPanel({
  workspaceId,
  appId,
  vaultLocale,
  isRtl: isRtlProp,
  onOpenValidator,
  isLoading: externalLoading,
  trackerSignals,
}: KeywordTrackerPanelProps) {
  const isRtl = isRtlProp ?? vaultLocale === "ar";
  const t = useTranslations("optimizer.activeContext");
  const queryClient = useQueryClient();
  const { signals: vaultSignals, isLoading, isFetching } = useKeywordSignals(
    workspaceId,
    appId,
    vaultLocale
  );
  const [removingKeyword, setRemovingKeyword] = useState<string | null>(null);

  const signals = trackerSignals !== undefined ? trackerSignals : vaultSignals;
  const total = signals.length;

  const sortedSignals = useMemo(
    () => [...signals].sort((a, b) => b.confidence - a.confidence),
    [signals]
  );

  const difficultyText = useCallback(
    (value: number) => {
      const d = difficultyBadge(value);
      const key =
        d.label === "Easy"
          ? "difficultyEasy"
          : d.label === "Medium"
            ? "difficultyMedium"
            : "difficultyHard";
      const label = t(key);
      // Uppercase only for English badges — Arabic has no case transforms
      return vaultLocale === "en" ? label.toUpperCase() : label;
    },
    [t, vaultLocale]
  );

  const removeMutation = useMutation({
    mutationFn: async (keyword: string) => {
      const res = await fetch(`/api/workspaces/${workspaceId}/staging-vault/keywords`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, locale: vaultLocale, keyword }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? t("keywordTrackerRemoveFailed"));
      }
      return keyword;
    },
    onMutate: async (keyword) => {
      setRemovingKeyword(keyword);
      patchKeywordSignalsCache(
        queryClient,
        workspaceId,
        appId,
        (prev) => prev.filter((s) => s.keyword !== keyword),
        vaultLocale
      );
    },
    onSuccess: (keyword) => {
      toast.success(t("keywordTrackerRemoved", { keyword }));
    },
    onError: (err: Error) => {
      toast.error(err.message ?? t("keywordTrackerRemoveFailed"));
      void queryClient.invalidateQueries({
        queryKey: KEYWORD_SIGNALS_KEY(workspaceId, appId, vaultLocale),
      });
    },
    onSettled: () => {
      setRemovingKeyword(null);
    },
  });

  const hasSignals = total > 0;

  return (
    <div dir={isRtl ? "rtl" : "ltr"} lang={vaultLocale}>
      <ActiveContextSlot
        id="active-context-keyword-tracker"
        icon={Hash}
        title={t("keywordTracker")}
        description={t("keywordTrackerHelp")}
        count={total}
        isRtl={isRtl}
        headerBorderClass="border-indigo-400/20"
        iconClassName="text-indigo-300/80"
        bodyClassName="bg-white/[0.02]"
      >
        {!hasSignals ? (
          <ActiveContextSlotEmpty
            message={t("noActiveSignals")}
            ctaLabel={t("openValidatorCta")}
            onCtaClick={() => onOpenValidator("")}
            ctaClassName="border-indigo-500/20 bg-indigo-500/[0.06] text-indigo-200/70 hover:border-indigo-400/35 hover:bg-indigo-500/10 hover:text-indigo-100/90"
            isRtl={isRtl}
          />
        ) : (
          <ActiveContextSignalList rowHeight={ROW_H}>
            {sortedSignals.map((signal) => (
              <KeywordRow
                key={signal.keyword}
                signal={signal}
                isRtl={isRtl}
                isRemoving={removingKeyword === signal.keyword}
                difficultyText={difficultyText(signal.difficulty)}
                onRowClick={() => onOpenValidator(signal.keyword, signal)}
                onRemove={() => removeMutation.mutate(signal.keyword)}
                removeLabel={t("removeKeyword", { keyword: signal.keyword })}
              />
            ))}
          </ActiveContextSignalList>
        )}
      </ActiveContextSlot>
    </div>
  );
}

/** Persistent Keyword Tracker slot when no app is selected. */
export function KeywordTrackerEmptySlot({ isRtl = false }: { isRtl?: boolean }) {
  const t = useTranslations("optimizer.activeContext");

  return (
    <ActiveContextSlot
      id="active-context-keyword-tracker"
      icon={Hash}
      title={t("keywordTracker")}
      description={t("keywordTrackerHelp")}
      count={0}
      isRtl={isRtl}
      headerBorderClass="border-indigo-400/20"
      iconClassName="text-indigo-300/80"
      bodyClassName="bg-white/[0.02]"
    >
      <ActiveContextSlotEmpty
        message={t("noActiveSignals")}
        isRtl={isRtl}
      />
    </ActiveContextSlot>
  );
}
