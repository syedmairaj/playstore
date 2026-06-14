"use client";

/**
 * Keyword Tracker — minimal Active Context overview panel.
 * Quick scan: keyword + difficulty. Details live in Validator / Tracker.
 */

import { useCallback, useMemo, useState } from "react";
import { Hash, KeyRound, Loader2, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
const MAX_VISIBLE = 6;

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

  const loading = externalLoading || isLoading || isFetching;
  const hasSignals = total > 0;

  return (
    <div
      className={`space-y-2 ${isRtl ? "text-right" : ""}`}
      dir={isRtl ? "rtl" : "ltr"}
      lang={vaultLocale}
    >
      {/* Header — matches other Active Context pillars */}
      <div
        className={`flex items-center gap-2 border-b pb-2 ${isRtl ? "flex-row-reverse" : ""}`}
        style={{ borderColor: "rgba(129, 140, 248, 0.18)" }}
      >
        <Hash className="h-4 w-4 shrink-0" style={{ color: T.accent }} aria-hidden />
        <h3
          className={`flex-1 text-[11px] font-semibold text-white/90 ${
            isRtl ? "font-arabic" : "uppercase tracking-[0.12em]"
          }`}
        >
          {t("keywordTracker")}
        </h3>
        <span className="text-[10px] font-medium text-white/40 tabular-nums">
          {hasSignals ? total : "—"}
        </span>
      </div>

      <p
        className={`text-[8px] leading-relaxed ${isRtl ? "font-arabic" : ""}`}
        style={{ color: T.help }}
      >
        {t("keywordTrackerHelp")}
      </p>

      {loading && !hasSignals ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-white/25" />
        </div>
      ) : !hasSignals ? (
        <div className="flex flex-col items-center gap-3 py-5 text-center">
          <KeyRound className="h-5 w-5 text-white/20" aria-hidden />
          <p
            className={`max-w-[220px] text-[10px] leading-relaxed ${isRtl ? "font-arabic" : ""}`}
            style={{ color: "rgba(148, 163, 184, 0.45)" }}
          >
            {t("keywordTrackerEmpty")}
          </p>
          <button
            type="button"
            onClick={() => onOpenValidator("")}
            className={`text-[10px] font-medium underline-offset-2 hover:underline ${
              isRtl ? "font-arabic" : ""
            }`}
            style={{ color: T.accent }}
          >
            {t("openValidatorCta")}
          </button>
        </div>
      ) : (
        <div
          className="space-y-0.5 overflow-y-auto rounded-lg border px-2 py-1.5"
          style={{
            borderColor: T.border,
            maxHeight: MAX_VISIBLE * (ROW_H + 2),
          }}
        >
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
        </div>
      )}
    </div>
  );
}
