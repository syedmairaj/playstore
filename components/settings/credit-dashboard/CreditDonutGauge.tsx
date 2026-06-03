"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SVG donut geometry — all values derived from `SIZE` and `STROKE` so the
 * component scales cleanly by changing a single constant.
 *
 *   cx / cy     — centre of the SVG viewport
 *   r           — radius of the arc path (centre of the stroke band)
 *   circumference — full-circle arc length: 2π r
 *
 * The arc starts at the 12 o'clock position (–90° rotation applied via
 * `transform="rotate(-90, cx, cy)"`).  stroke-dasharray is fixed at the full
 * circumference; stroke-dashoffset drives the fill percentage.
 *
 *   offset = circumference × (1 − pct)
 *
 * A CSS transition on stroke-dashoffset produces the smooth fill animation
 * whenever `pct` changes.
 */
const SIZE   = 160;
const STROKE = 14;
const cx     = SIZE / 2;
const cy     = SIZE / 2;
const r      = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * r;

// ─────────────────────────────────────────────────────────────────────────────
// Severity colour bands
// ─────────────────────────────────────────────────────────────────────────────

// Fixed amber colour — matches the horizontal progress bar's amber band
const TRACK_COLOR = "#f59e0b"; // amber-500
const GLOW_COLOR  = "rgba(245,158,11,0.18)";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type CreditDonutGaugeProps = {
  /** Credits still available. */
  remaining: number;
  /** Total credit allocation for this billing period. */
  total: number;
  /** Optional extra label rendered below the centre number (e.g. "of 200"). */
  sublabel?: string;
  className?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CreditDonutGauge — pure SVG credit-consumption arc gauge.
 *
 * ## Why pure SVG?
 * No charting library dependency means zero extra JS weight on the billing
 * page.  The entire visual is ~60 SVG nodes; the browser paints it in a single
 * GPU compositing pass.
 *
 * ## Animation strategy
 * `stroke-dashoffset` is driven by a CSS `transition` rather than a JS
 * animation frame loop.  The browser's compositor thread handles the easing
 * natively — smooth 60 fps with zero main-thread overhead.
 *
 * The arc element gets a `ref` so we can imperatively set the initial offset
 * to `CIRCUMFERENCE` (empty) before the first paint, then immediately queue
 * the animated offset in a `useEffect`.  This creates the "fill from empty"
 * entrance animation every time `remaining` or `total` changes.
 */
export function CreditDonutGauge({
  remaining,
  total,
  sublabel,
  className,
}: CreditDonutGaugeProps) {
  const arcRef = useRef<SVGCircleElement>(null);

  const safeTotal     = Math.max(1, total);
  const safeRemaining = Math.max(0, Math.min(remaining, safeTotal));
  const usedFraction  = 1 - (safeRemaining / safeTotal);
  const displayPct    = Math.round(usedFraction * 100);

  // Target dashoffset: arc fills proportionally to credits used.
  // dashoffset = 0 → full arc; dashoffset = CIRCUMFERENCE → empty arc.
  // We want the arc to show the used portion, so offset = CIRCUMFERENCE * (1 − usedFraction).
  const targetOffset = CIRCUMFERENCE * (1 - usedFraction);

  // Animate: start at CIRCUMFERENCE (arc fully offset = no fill) → target offset.
  // targetOffset = CIRCUMFERENCE * (1 - usedFraction):
  //   0% used  → targetOffset = CIRCUMFERENCE (empty, arc invisible)
  //   100% used → targetOffset = 0 (full arc)
  // Entrance always plays from CIRCUMFERENCE (empty) so the arc "fills in" from zero.
  useEffect(() => {
    const el = arcRef.current;
    if (!el) return;

    // Force-reset to empty (no fill) before the transition plays.
    el.style.transition = "none";
    el.style.strokeDashoffset = String(CIRCUMFERENCE);

    const raf = requestAnimationFrame(() => {
      el.style.transition = "stroke-dashoffset 1.1s cubic-bezier(0.4, 0, 0.2, 1)";
      el.style.strokeDashoffset = String(targetOffset);
    });

    return () => cancelAnimationFrame(raf);
  }, [targetOffset]);

  return (
    <div className={cn("relative flex flex-col items-center gap-3", className)}>
      {/* ── SVG donut ─────────────────────────────────────────────────────── */}
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-label={`Credit usage: ${displayPct}% used`}
        role="img"
      >
        <defs>
          {/* Soft glow filter applied to the progress arc */}
          <filter id="donut-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor={GLOW_COLOR} result="colour" />
            <feComposite in="colour" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background track — full circle, very muted */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={STROKE}
        />

        {/* Progress arc — animated dashoffset, fixed amber colour, glow */}
        <circle
          ref={arcRef}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={TRACK_COLOR}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE} /* JS overrides this post-mount */
          transform={`rotate(-90, ${cx}, ${cy})`}
          filter="url(#donut-glow)"
          style={{ willChange: "stroke-dashoffset" }}
        />

        {/* Centre content — percentage used + label */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="28"
          fontWeight="700"
          fontFamily="inherit"
          fill="#f59e0b" /* amber-500 — matches arc stroke */
        >
          {displayPct}%
        </text>
        <text
          x={cx}
          y={cy + 18}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="11"
          fill="rgba(161,161,170,0.8)" /* zinc-400/80 */
          fontFamily="inherit"
        >
          used
        </text>
      </svg>

      {/* Sub-label beneath the SVG (e.g. "13 of 100 credits") */}
      {sublabel && (
        <p className="text-center text-xs tabular-nums text-zinc-500">{sublabel}</p>
      )}
    </div>
  );
}
