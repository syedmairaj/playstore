"use client";

import { cn } from "@/lib/utils";

/** Inner display corner radius — keep in sync with laser / overlay masks. */
export const PIXEL_MOCK_INNER_RADIUS = "rounded-[0.92rem]";

/** Bottom radius for overlays inside the screen (slightly inset vs. full inner). */
export const PIXEL_MOCK_LASER_BOTTOM = "rounded-b-[0.86rem]";

type PixelPhoneFrameProps = {
  children: React.ReactNode;
  className?: string;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  /** Shown in the faux status bar (Latin numerals; neutral demo time). */
  statusTime?: string;
};

/**
 * Google Pixel 9–style device mock: flat rails, modest corner radius,
 * centered punch-hole (not iPhone / Dynamic Island).
 */
export function PixelPhoneFrame({
  children,
  className,
  onPointerEnter,
  onPointerLeave,
  statusTime = "9:41",
}: PixelPhoneFrameProps) {
  return (
    <div
      className={cn("relative overflow-visible", className)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {/* Flat-side hardware rails (volume left, power right — physical sides for RTL-safe layout) */}
      <div
        className="pointer-events-none absolute left-0 top-[30%] z-0 h-16 w-[3px] -translate-x-full rounded-s-[2px] bg-gradient-to-b from-zinc-500/90 via-zinc-600 to-zinc-700/90 shadow-sm"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-0 top-[46%] z-0 h-10 w-[3px] -translate-x-full rounded-s-[2px] bg-gradient-to-b from-zinc-500/90 via-zinc-600 to-zinc-700/90 shadow-sm"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-0 top-[36%] z-0 h-11 w-[3px] translate-x-full rounded-e-[2px] bg-gradient-to-b from-zinc-500/90 via-zinc-600 to-zinc-700/90 shadow-sm"
        aria-hidden
      />

      {/* Chassis: matte metal, flatter corners than rounded “iPhone” mocks */}
      <div
        className={cn(
          "relative rounded-[1.06rem] border border-zinc-600/40 bg-gradient-to-b from-[#35383f] via-[#252830] to-[#16181c]",
          "p-[6px] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.07)]",
          "ring-1 ring-white/[0.05]",
        )}
      >
        <div
          className={cn(
            "relative overflow-hidden border border-black/50 bg-black",
            PIXEL_MOCK_INNER_RADIUS,
          )}
        >
          {/* Status strip + centered punch-hole camera */}
          <div
            className="relative flex h-7 shrink-0 items-center border-b border-white/[0.06] bg-[#0c0e12]"
            dir="ltr"
          >
            <span className="flex-1 ps-3 text-[10px] font-semibold tabular-nums text-white/45">
              {statusTime}
            </span>
            <span
              className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              aria-hidden
            >
              <span className="relative flex h-[11px] w-[11px] items-center justify-center rounded-full bg-[#07080a] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] ring-1 ring-zinc-700/90">
                <span className="h-[3px] w-[3px] rounded-full bg-zinc-600/80 opacity-80" />
              </span>
            </span>
            <span className="flex flex-1 items-center justify-end gap-1 pe-3" aria-hidden>
              <span className="h-2 w-3 rounded-[1px] bg-white/25" />
              <span className="h-2 w-2 rounded-full border border-white/30 bg-transparent" />
              <span className="relative h-2.5 w-[18px] rounded-[2px] border border-white/25 bg-white/[0.08]">
                <span className="absolute inset-y-0 start-0 w-[60%] rounded-[1px] bg-[#22C55E]/90" />
              </span>
            </span>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
