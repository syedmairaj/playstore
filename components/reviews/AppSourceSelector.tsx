"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type AppSourceOption = {
  /** Unique identifier — use packageId for competitors, "my-app" for own app */
  id: string;
  label: string;
  packageId: string;
  iconUrl: string | null;
};

type Props = {
  selected: string;
  onSelect: (id: string) => void;
  competitors: AppSourceOption[];
  loading?: boolean;
};

export function AppSourceSelector({ selected, onSelect, competitors, loading = false }: Props) {
  const t = useTranslations("reviews.appSelector");

  return (
    <div className="space-y-2">
      {/* Section label */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {t("sectionLabel")}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t("loadingCompetitors")}
        </div>
      ) : (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={t("sectionLabel")}
        >
          {/* Own app — always first */}
          <AppTab
            id="my-app"
            label={t("myApp")}
            subtitle={t("myAppSubtitle")}
            isSelected={selected === "my-app"}
            variant="defensive"
            onSelect={onSelect}
          />

          {/* Competitor tabs */}
          {competitors.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-700/60 px-3 py-2">
              <span className="text-xs text-zinc-600">{t("noCompetitors")}</span>
            </div>
          ) : (
            competitors.map((c) => (
              <AppTab
                key={c.id}
                id={c.id}
                label={`${t("competitorPrefix")} ${c.label}`}
                subtitle={t("competitorSubtitle")}
                isSelected={selected === c.id}
                variant="offensive"
                iconUrl={c.iconUrl}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

type AppTabProps = {
  id: string;
  label: string;
  subtitle: string;
  isSelected: boolean;
  variant: "defensive" | "offensive";
  iconUrl?: string | null;
  onSelect: (id: string) => void;
};

function AppTab({ id, label, subtitle, isSelected, variant, iconUrl, onSelect }: AppTabProps) {
  const isDefensive = variant === "defensive";

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={isSelected}
      className={cn(
        "group flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-start transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090c12]",
        isSelected
          ? isDefensive
            ? "border-sky-500/40 bg-sky-500/10 ring-1 ring-inset ring-sky-500/20 focus-visible:ring-sky-500"
            : "border-orange-500/40 bg-orange-500/10 ring-1 ring-inset ring-orange-500/20 focus-visible:ring-orange-500"
          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900 focus-visible:ring-zinc-500",
      )}
    >
      {/* Icon */}
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt=""
          aria-hidden
          className="size-7 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg text-base",
            isSelected
              ? isDefensive
                ? "bg-sky-500/20"
                : "bg-orange-500/20"
              : "bg-zinc-800",
          )}
        >
          {isDefensive ? "🛡️" : "⚔️"}
        </span>
      )}

      {/* Text */}
      <span className="min-w-0">
        <span
          className={cn(
            "block text-xs font-semibold leading-tight",
            isSelected
              ? isDefensive
                ? "text-sky-200"
                : "text-orange-200"
              : "text-zinc-300 group-hover:text-white",
          )}
        >
          {label}
        </span>
        <span className="block truncate text-[10px] leading-tight text-zinc-500">
          {subtitle}
        </span>
      </span>
    </button>
  );
}
