"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  disabledToggle?: boolean;
};

export function OptimizerWizardStepShell({
  title,
  summary,
  expanded,
  onToggle,
  children,
  disabledToggle,
}: Props) {
  return (
    <section className="border-b border-zinc-800/80 last:border-b-0">
      <button
        type="button"
        disabled={disabledToggle}
        onClick={onToggle}
        className={cn(
          "flex w-full items-center justify-between gap-3 py-4 text-start transition sm:py-5",
          disabledToggle ? "cursor-default" : "hover:bg-white/[0.02]",
        )}
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
            {title}
          </p>
          {!expanded && summary ? (
            <p className="mt-1 truncate text-sm text-white/65">{summary}</p>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-white/40 transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div className="pb-8 pt-2">{children}</div>
      ) : null}
    </section>
  );
}
