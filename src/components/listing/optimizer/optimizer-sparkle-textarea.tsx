"use client";

import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { TooltipProvider } from "@radix-ui/react-tooltip";

type Props = {
  id: string;
  label: ReactNode;
  labelTitle?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows: number;
  minHeightClass?: string;
  disabled: boolean;
  /** When set, only the ✦ control is disabled (textarea can still be edited). */
  sparkleDisabled?: boolean;
  busy: boolean;
  onAutofill: () => void;
  /** When set, called before `onAutofill` (e.g. credit confirmation). */
  onBeforeAutofill?: () => void;
  sparkleAriaLabel: string;
  /** Context-aware tooltip shown on hover — should describe what this specific field does. */
  sparkleTooltip: string;
  creditsNote: string;
};

export function OptimizerSparkleTextarea({
  id,
  label,
  labelTitle,
  value,
  onChange,
  placeholder,
  rows,
  minHeightClass,
  disabled,
  sparkleDisabled,
  busy,
  onAutofill,
  onBeforeAutofill,
  sparkleAriaLabel,
  sparkleTooltip,
  creditsNote,
}: Props) {
  function handleSparkleClick() {
    if (onBeforeAutofill) {
      onBeforeAutofill();
      return;
    }
    onAutofill();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          className="min-w-0 max-w-[min(100%,28rem)] text-sm font-medium text-white/80"
          htmlFor={id}
          title={labelTitle}
        >
          {label}
        </label>
      </div>
      <div className="relative">
        <textarea
          id={id}
          aria-busy={busy ? true : undefined}
          rows={rows}
          className={cn(
            "w-full resize-y rounded-2xl border border-zinc-800 bg-white/[0.04] py-2.5 ps-3 pe-12 text-sm text-white outline-none transition placeholder:text-white/35",
            "focus-visible:border-emerald-500/35 focus-visible:shadow-[0_0_0_3px_rgba(52,211,153,0.12)] focus-visible:ring-[0.5px] focus-visible:ring-emerald-400/55",
            "disabled:opacity-60",
            minHeightClass ?? "min-h-[92px]",
          )}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        {/* Radix Tooltip wrapping the sparkle button — asChild merges onto the button
            so there is no nested interactive element. Muted opacity on the icon signals
            "secondary / suggestion" role vs the primary Generate button. */}
        <TooltipProvider>
          <Tooltip content={sparkleTooltip} side="left" asChild>
            <button
              type="button"
              aria-label={sparkleAriaLabel}
              disabled={disabled || sparkleDisabled || busy}
              onClick={handleSparkleClick}
              className={cn(
                "absolute top-2.5 end-2.5 inline-flex size-9 items-center justify-center rounded-xl border border-zinc-700/70 bg-zinc-900/80 text-emerald-200/60 shadow-sm backdrop-blur-sm transition",
                "hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-50",
                "focus-visible:outline-none focus-visible:ring-[0.5px] focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              {/* Slightly smaller icon + reduced opacity reinforces secondary / suggestion role */}
              <Sparkles className="size-3.5 shrink-0 opacity-75" aria-hidden />
            </button>
          </Tooltip>
        </TooltipProvider>
      </div>
      <p className="text-xs leading-snug text-white/45">{creditsNote}</p>
    </div>
  );
}
