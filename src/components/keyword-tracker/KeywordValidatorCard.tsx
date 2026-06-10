'use client';

/**
 * KeywordValidatorCard — Keyword Validator slide-over panel
 *
 * ─── LOCALE ARCHITECTURE ────────────────────────────────────────────────────
 * This component is English-only by design. The authenticated Growth Hub
 * dashboard always renders in English. Arabic users switch locale on the
 * landing page (via LocaleHtmlBootstrap) before logging in — that locale
 * does not carry into the dashboard shell.
 *
 * workspace_staging_vault dual-branch writes:
 *   • state_en.keywords.*  ← written HERE (KeywordValidatorProducer, en)
 *   • state_ar.keywords.*  ← written by the Arabic-locale listing flow
 *                            (separate producer, separate user session)
 *
 * Do NOT add useLocale() or Arabic branching to this file.
 * If the dashboard ever becomes bilingual, create a separate
 * KeywordValidatorCardAr.tsx and compose them at the page level.
 *
 * ─── TAILWIND PURGE NOTE ────────────────────────────────────────────────────
 * This file lives in ./src/components — OUTSIDE Tailwind's content scan
 * (tailwind.config.ts scans ./pages, ./components, ./app only).
 * All arbitrary bg-[...] / border-[...] values MUST use inline style props.
 * Standard utilities that exist in scanned files (flex, rounded, text-*) are safe.
 *
 * ─── CSS DIRECTION NOTE ─────────────────────────────────────────────────────
 * Internal layout uses logical padding (ps-* / pe-*) so this component
 * is direction-agnostic by default. The panel anchor (right: 0) is physical
 * because fixed-position elements resolve against the viewport — logical
 * inset-inline-* on a fixed element is unreliable across browsers.
 */

import { useState, useCallback, useId, useRef, useEffect } from 'react';
import {
  X, Loader2, TrendingUp, Shield, Zap,
  CheckCircle2, Search, BarChart3, Sparkles, ArrowUpRight,
  Radio,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Query key used by useOptimizerSync — must match exactly so invalidation
// triggers a refetch in the AI Listing Optimizer's Active Context panel.
const OPTIMIZER_CONTEXT_KEY = (wid: string) => ['optimizer-context', wid];

// ─── Colour tokens (inline — purge-safe) ─────────────────────────────────────
const C = {
  panelBg:      '#080c11',
  cardBg:       '#0d1117',
  inputBg:      '#0d1117',
  metricBg:     'rgba(15,18,26,0.85)',
  trackBg:      'rgba(255,255,255,0.06)',
  headerBorder: 'rgba(255,255,255,0.07)',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape the component works with internally — flat, normalised. */
export interface KeywordScore {
  keyword: string;
  difficulty: number;       // 0-10  (flat — normalised from API's nested difficulty.difficulty)
  confidence: number;       // 0-100
  searchVolume: number;
  competition: number;      // 0-100
  monthlyInstalls: { low: number; realistic: number; high: number };
  recommendation: 'HIGH_CONFIDENCE' | 'MEDIUM_OPPORTUNITY' | 'SKIP';
  // Multi-market live rank results — keyed by market code, e.g. { us: { rank: 1 }, in: { rank: null } }
  liveRanks?: Record<string, { rank: number | null; fetched_at: string; error?: string }>;
}

/** Convenience: count how many markets have been fetched for a keyword */
function countFetchedMarkets(score: KeywordScore): number {
  return Object.keys(score.liveRanks ?? {}).length;
}

/**
 * Raw shape returned by POST /api/…/validator/validate-keyword
 * recommendation comes as lowercase snake_case; difficulty is a nested object.
 */
interface RawApiResponse {
  ok: boolean;
  data?: {
    keyword: string;
    confidence: number;
    recommendation: 'high_confidence' | 'medium_opportunity' | 'skip_this';
    difficulty: {
      difficulty: number;
      searchVolume: number;
      competition: number;
      confidenceScore?: number;
    };
    monthlyInstalls: {
      low: number;
      medium?: number;   // API uses "medium", not "realistic"
      realistic?: number;
      high: number;
    };
  };
  error?: { message?: string };
}

/** Maps the raw API response → internal KeywordScore. Throws on bad shape. */
function normaliseApiResponse(raw: RawApiResponse): KeywordScore {
  const d = raw?.data;
  if (!d) throw new Error('Empty response from validator');

  // Map recommendation: API uses lowercase snake_case, TIER map uses SCREAMING_SNAKE
  const recMap: Record<string, KeywordScore['recommendation']> = {
    high_confidence:    'HIGH_CONFIDENCE',
    medium_opportunity: 'MEDIUM_OPPORTUNITY',
    skip_this:          'SKIP',
    // Handle already-normalised values in case the API is updated
    HIGH_CONFIDENCE:    'HIGH_CONFIDENCE',
    MEDIUM_OPPORTUNITY: 'MEDIUM_OPPORTUNITY',
    SKIP:               'SKIP',
  };
  const recommendation: KeywordScore['recommendation'] =
    recMap[d.recommendation] ?? 'SKIP';

  return {
    keyword:      d.keyword,
    difficulty:   d.difficulty.difficulty,        // unnest
    confidence:   d.confidence,
    searchVolume: d.difficulty.searchVolume,       // unnest
    competition:  d.difficulty.competition,        // unnest
    monthlyInstalls: {
      low:       d.monthlyInstalls.low,
      realistic: d.monthlyInstalls.realistic ?? d.monthlyInstalls.medium ?? 0,
      high:      d.monthlyInstalls.high,
    },
    recommendation,
  };
}

export interface KeywordValidatorCardProps {
  workspaceId: string;
  /** UUID of the app whose vault receives live rank writes. */
  appId?: string;
  /**
   * Markets selected in the Keyword Tracker CountrySelector.
   * Drives the multi-market live rank fetch and pre-click credit cost display.
   * Defaults to ["us"] if not provided.
   */
  selectedCountries?: string[];
  isOpen: boolean;
  onClose: () => void;
  onKeywordStaged?: (keyword: string, score: KeywordScore) => void;
}

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER = {
  HIGH_CONFIDENCE: {
    label: 'High Opportunity', Icon: Shield,
    pillCls: 'text-emerald-300 border-emerald-500/30',
    pillBg:  'rgba(16,185,129,0.12)',
    glow:    '0 0 20px -6px rgba(16,185,129,0.45)',
    accent:  '#10b981',
    trackCl: '#10b981',
  },
  MEDIUM_OPPORTUNITY: {
    label: 'Medium Opportunity', Icon: TrendingUp,
    pillCls: 'text-amber-300 border-amber-500/30',
    pillBg:  'rgba(245,158,11,0.12)',
    glow:    '0 0 20px -6px rgba(245,158,11,0.35)',
    accent:  '#f59e0b',
    trackCl: '#f59e0b',
  },
  SKIP: {
    label: 'Low Priority', Icon: Zap,
    pillCls: 'text-zinc-400 border-zinc-600/40',
    pillBg:  'rgba(113,113,122,0.12)',
    glow:    'none',
    accent:  '#71717a',
    trackCl: '#71717a',
  },
} as const;

// ─── SVG Viability Gauge ──────────────────────────────────────────────────────

function ViabilityGauge({ value, size = 72 }: { value: number; size?: number }) {
  const pct    = Math.min(value / 10, 1);
  const stroke = 6;
  const r      = (size - stroke) / 2;
  const cx     = size / 2;
  const cy     = size / 2;
  const toRad  = (d: number) => (d * Math.PI) / 180;
  const s      = 195;
  const sweep  = 150;

  const start  = { x: cx + r * Math.cos(toRad(s)),         y: cy + r * Math.sin(toRad(s)) };
  const end    = { x: cx + r * Math.cos(toRad(s + sweep)), y: cy + r * Math.sin(toRad(s + sweep)) };
  const fillEnd= { x: cx + r * Math.cos(toRad(s + sweep * pct)), y: cy + r * Math.sin(toRad(s + sweep * pct)) };
  const large  = sweep * pct > 180 ? 1 : 0;
  const color  = value <= 4 ? '#10b981' : value <= 7 ? '#f59e0b' : '#f87171';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      {/* Track */}
      <path
        d={`M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${end.x} ${end.y}`}
        fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} strokeLinecap="round"
      />
      {/* Fill */}
      {pct > 0 && (
        <path
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${fillEnd.x} ${fillEnd.y}`}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}
        />
      )}
      <text x={cx} y={cy + 5}  textAnchor="middle" fontSize="16" fontWeight="700" fill="white"               fontFamily="inherit">{value.toFixed(1)}</text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="8"  fill="rgba(255,255,255,0.35)" fontFamily="inherit" letterSpacing="0.04em">/10</text>
    </svg>
  );
}

// ─── Difficulty badge ─────────────────────────────────────────────────────────

function DifficultyBadge({ value }: { value: number }) {
  const t = value <= 3
    ? { label: 'Easy',   color: '#6ee7b7', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)' }
    : value <= 6
    ? { label: 'Medium', color: '#fcd34d', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)' }
    : { label: 'Hard',   color: '#fca5a5', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)'  };

  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: t.color, backgroundColor: t.bg, borderColor: t.border }}
    >
      {t.label}
    </span>
  );
}

// ─── Estimated tag + tooltip ──────────────────────────────────────────────────
// Strings come from messages/en.json keywordValidator.estimatedBadge/Tooltip.
// The component is English-only so we embed the en values directly — the full
// string set is also present in messages/ar.json for bilingual parity if this
// component is ever composed into an Arabic context in the future.

const ESTIMATED_BADGE  = 'Est.';
const ESTIMATED_TOOLTIP =
  'Estimated based on historical model. Live data available in the Keyword Tracker.';

function EstimatedTag() {
  return (
    <span
      className="group/est relative inline-flex items-center gap-0.5 cursor-default select-none"
      aria-label={ESTIMATED_TOOLTIP}
    >
      {/* Badge */}
      <span
        className="inline-flex items-center rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wider"
        style={{
          color: 'rgba(161,161,170,0.9)',
          backgroundColor: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {ESTIMATED_BADGE}
      </span>

      {/* Info icon */}
      <svg
        width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
        style={{ color: 'rgba(113,113,122,0.7)', flexShrink: 0 }}
      >
        <circle cx="5" cy="5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1" />
        <text x="5" y="7.5" textAnchor="middle" fontSize="6" fill="currentColor" fontWeight="700">i</text>
      </svg>

      {/* Tooltip — appears on hover, positioned above */}
      <span
        className="pointer-events-none absolute bottom-full mb-1.5 z-[60] hidden group-hover/est:flex"
        style={{ insetInlineStart: '50%', transform: 'translateX(-50%)', width: '220px' }}
      >
        <span
          className="w-full rounded-lg px-3 py-2 text-[11px] leading-relaxed shadow-xl"
          style={{
            backgroundColor: '#1a1f2b',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(212,212,216,0.95)',
          }}
        >
          {ESTIMATED_TOOLTIP}
        </span>
      </span>
    </span>
  );
}

// ─── Volume formatter ─────────────────────────────────────────────────────────

function fmtVol(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('en-US');
}

// ─── Confidence ring ──────────────────────────────────────────────────────────

function ConfidenceRing({ pct }: { pct: number }) {
  const r     = 10;
  const circ  = 2 * Math.PI * r;
  const color = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#f87171';

  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden className="shrink-0">
      <circle cx="14" cy="14" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" />
      <circle
        cx="14" cy="14" r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${circ * pct / 100} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 14 14)"
        style={{ filter: `drop-shadow(0 0 3px ${color}88)` }}
      />
      <text x="14" y="18" textAnchor="middle" fontSize="7" fontWeight="700" fill={color}>{pct}</text>
    </svg>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  const steps = [
    { Icon: Search,    text: 'Type any keyword in the field above' },
    { Icon: BarChart3, text: 'Press Analyze to get the viability score' },
    { Icon: Sparkles,  text: 'Hit Stage to push it to the tracker' },
  ];

  return (
    <div
      className="mx-1 rounded-xl border px-5 py-6 select-none"
      style={{ borderColor: 'rgba(255,255,255,0.07)', backgroundColor: 'rgba(255,255,255,0.02)' }}
    >
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        How it works
      </p>
      <ol className="space-y-3.5">
        {steps.map(({ Icon, text }, i) => (
          <li key={i} className="flex items-center gap-3">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
              style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', color: '#10b981' }}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs leading-snug text-zinc-400">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Result row ───────────────────────────────────────────────────────────────

function ResultRow({
  score, staged, onStage, onFetchLiveRank, liveRankState, selectedCountries, onRemove,
}: {
  score: KeywordScore;
  staged: 'pending' | 'done' | undefined;
  onStage: () => void;
  /** Remove this individual result from the list */
  onRemove: () => void;
  /** Called when user clicks Fetch Live Rank — server handles credit deduction */
  onFetchLiveRank?: (countries: string[]) => void;
  liveRankState?: 'pending' | 'done' | 'error';
  /** Markets selected in the Keyword Tracker — drives cost display + fetch */
  selectedCountries?: string[];
}) {
  const tier    = TIER[score.recommendation];
  const TierIcon = tier.Icon;

  return (
    <article
      className="group relative overflow-hidden rounded-xl border transition-all duration-200"
      style={{
        backgroundColor: C.cardBg,
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: tier.glow,
      }}
    >
      {/* Accent line */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${tier.accent}55, transparent)` }}
        aria-hidden
      />

      {/* Top row */}
      <div className="flex items-start gap-4 p-4 pb-3">
        {/* Gauge + badge */}
        <div className="flex flex-col items-center gap-1 pt-0.5">
          <ViabilityGauge value={score.difficulty} />
          <DifficultyBadge value={score.difficulty} />
        </div>

        {/* Meta */}
        <div className="min-w-0 flex-1">
          {/* Keyword + remove button + tier pill */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[15px] font-semibold text-white">{score.keyword}</p>
                {/* Per-card remove button */}
                <button
                  type="button"
                  onClick={onRemove}
                  className="shrink-0 rounded p-0.5 transition-colors focus-visible:outline-none"
                  style={{ color: 'rgba(113,113,122,0.6)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(113,113,122,0.6)')}
                  aria-label={`Remove ${score.keyword}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: '#71717a' }}>
                Search vol · {fmtVol(score.searchVolume)}/mo
                <EstimatedTag />
              </p>
            </div>
            <span
              className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold', tier.pillCls)}
              style={{ backgroundColor: tier.pillBg }}
            >
              <TierIcon className="h-3 w-3" />
              {tier.label}
            </span>
          </div>

          {/* Metrics — 2-column grid to prevent overflow at 400px panel width */}
          <div className="mt-3 grid grid-cols-2 gap-2">

            {/* Confidence */}
            <div
              className="flex flex-col gap-1.5 rounded-lg p-2.5"
              style={{ backgroundColor: C.metricBg }}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Conf. <EstimatedTag />
                </span>
                <ConfidenceRing pct={score.confidence} />
              </div>
              <p className="text-xs font-semibold text-white">{score.confidence}%</p>
            </div>

            {/* Competition */}
            <div
              className="flex flex-col justify-between rounded-lg p-2.5"
              style={{ backgroundColor: C.metricBg }}
            >
              <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Comp. <EstimatedTag />
              </span>
              <div className="mt-2 space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${score.competition}%`, backgroundColor: '#3b82f6' }}
                    role="presentation"
                  />
                </div>
                <p className="text-xs font-semibold" style={{ color: '#93c5fd' }}>{score.competition}%</p>
              </div>
            </div>

            {/* Installs — spans full width so range has room to breathe */}
            <div
              className="col-span-2 flex items-center justify-between rounded-lg p-2.5"
              style={{ backgroundColor: C.metricBg }}
            >
              <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Installs/mo <EstimatedTag />
              </span>
              <div className="flex items-center gap-1.5 text-xs">
                <span style={{ color: '#a1a1aa' }}>{fmtVol(score.monthlyInstalls.low)}</span>
                <span style={{ color: '#52525b' }}>–</span>
                <span className="font-bold text-white">{fmtVol(score.monthlyInstalls.realistic)}</span>
                <span style={{ color: '#52525b' }}>–</span>
                <span className="font-semibold" style={{ color: '#fcd34d' }}>{fmtVol(score.monthlyInstalls.high)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action footer — two-step progressive disclosure ─────────────────
          Step 1 (always visible): Stage = free, saves to tracker
          Step 2 (unlocks after staging): Fetch Live Rank = 1 credit/market
          All explanations are inline — never rely on hover or toasts          */}
      <div
        className="space-y-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* ── STEP 1: Stage ─────────────────────────────────────────────── */}
        <div className="px-4 pt-3 pb-2.5 space-y-2">

          {/* Step label — always visible, tells user where they are */}
          <div className="flex items-center gap-2">
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
              style={{
                backgroundColor: staged === 'done' ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)',
                color: staged === 'done' ? '#6ee7b7' : 'rgba(255,255,255,0.35)',
              }}
            >
              {staged === 'done' ? '✓' : '1'}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: staged === 'done' ? '#6ee7b7' : 'rgba(255,255,255,0.35)' }}>
              Stage to tracker
            </span>
            <span className="ms-auto text-[10px]" style={{ color: 'rgba(113,113,122,0.8)' }}>Free</span>
          </div>

          {/* What staging does — always visible, not a tooltip */}
          {staged !== 'done' && (
            <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(161,161,170,0.7)' }}>
              Saves this keyword to your Keyword Tracker watchlist. From there you can preview live Play Store ranks (1 credit/market) and build a rank history over time.
            </p>
          )}

          <button
            type="button"
            onClick={onStage}
            disabled={Boolean(staged)}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none"
            style={
              staged === 'done'
                ? { backgroundColor: 'rgba(16,185,129,0.12)', color: '#6ee7b7', cursor: 'default' }
                : staged === 'pending'
                ? { backgroundColor: 'rgba(255,255,255,0.04)', color: '#52525b', cursor: 'not-allowed' }
                : {
                    backgroundColor: 'rgba(16,185,129,0.08)',
                    color: '#6ee7b7',
                    border: '1px solid rgba(16,185,129,0.3)',
                  }
            }
            aria-label={staged === 'done' ? 'Already staged' : `Stage "${score.keyword}" to tracker`}
          >
            {staged === 'pending' ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Staging…</>
            ) : staged === 'done' ? (
              <><CheckCircle2 className="h-3.5 w-3.5" /> Staged to tracker</>
            ) : (
              <><ArrowUpRight className="h-3.5 w-3.5" /> Stage to Keyword Tracker</>
            )}
          </button>
        </div>

        {/* ── STEP 2: Fetch Live Rank — visible always, actionable after staging ── */}
        {(() => {
          const markets    = selectedCountries?.length ? selectedCountries : ['us'];
          const cost       = markets.length;
          const hasFetched = countFetchedMarkets(score) > 0;
          const isLocked   = staged !== 'done';

          return (
            <div
              className="px-4 pt-2.5 pb-3 space-y-2"
              style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
            >
              {/* Step label */}
              <div className="flex items-center gap-2">
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                  style={{
                    backgroundColor: hasFetched ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.1)',
                    color: hasFetched ? '#93c5fd' : isLocked ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.7)',
                  }}
                >
                  {hasFetched ? '✓' : '2'}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: hasFetched ? '#93c5fd' : isLocked ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.7)' }}>
                  Fetch live rank
                </span>
                {/* Credit cost badge — always visible so user knows upfront */}
                <span
                  className="ms-auto inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: isLocked ? 'rgba(255,255,255,0.05)' : 'rgba(59,130,246,0.12)',
                    color: isLocked ? 'rgba(161,161,170,0.5)' : '#93c5fd',
                    border: `1px solid ${isLocked ? 'rgba(255,255,255,0.08)' : 'rgba(59,130,246,0.2)'}`,
                  }}
                >
                  {cost} credit{cost !== 1 ? 's' : ''}
                </span>
              </div>

              {/* What live rank means — always visible at readable contrast */}
              <p className="text-[11px] leading-relaxed"
                style={{ color: isLocked ? 'rgba(161,161,170,0.55)' : 'rgba(212,212,216,0.75)' }}>
                {isLocked
                  ? <>Stage first (free) to unlock. Then fetch your app&apos;s real-time position in Google Play search results for this keyword — ranked against every other app in the store.</>
                  : <>Checks where <em>your app</em> ranks in Google Play search results for &ldquo;{score.keyword}&rdquo; in {markets.map(m => m.toUpperCase()).join(', ')}. Results are point-in-time snapshots — ranks shift daily based on installs, ratings &amp; listing relevance.</>
                }
              </p>

              {/* Per-market rank results — shown once fetched */}
              {hasFetched && (
                <div
                  className="grid gap-1"
                  style={{ gridTemplateColumns: `repeat(${Math.min(markets.length, 3)}, 1fr)` }}
                >
                  {markets.map((market) => {
                    const entry = score.liveRanks?.[market];
                    if (!entry) return null;
                    const rankColor = entry.error ? '#fca5a5' : entry.rank ? '#6ee7b7' : '#71717a';
                    return (
                      <div
                        key={market}
                        className="flex flex-col items-center rounded-lg py-2"
                        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                      >
                        <span className="text-[9px] font-semibold uppercase tracking-wider"
                          style={{ color: 'rgba(161,161,170,0.5)' }}>
                          {market}
                        </span>
                        <span className="mt-0.5 text-sm font-bold" style={{ color: rankColor }}>
                          {entry.error ? 'Err' : entry.rank ? `#${entry.rank}` : '100+'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Fetch / Refresh button — always rendered so layout is consistent */}
              <button
                type="button"
                onClick={() => {
                  if (isLocked || !onFetchLiveRank || liveRankState === 'pending') return;
                  onFetchLiveRank(markets);
                }}
                disabled={isLocked || !onFetchLiveRank || liveRankState === 'pending'}
                className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none"
                style={
                  isLocked
                    ? { backgroundColor: 'rgba(255,255,255,0.03)', color: 'rgba(161,161,170,0.4)', cursor: 'not-allowed', border: '1px solid rgba(255,255,255,0.07)' }
                    : !onFetchLiveRank
                    ? { backgroundColor: 'rgba(255,255,255,0.03)', color: 'rgba(161,161,170,0.35)', cursor: 'not-allowed', border: '1px solid rgba(255,255,255,0.06)' }
                    : liveRankState === 'pending'
                    ? { backgroundColor: 'rgba(255,255,255,0.04)', color: '#52525b', cursor: 'not-allowed' }
                    : liveRankState === 'error'
                    ? { backgroundColor: 'rgba(239,68,68,0.08)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }
                    : { backgroundColor: 'rgba(59,130,246,0.08)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.25)' }
                }
                aria-label={
                  isLocked ? 'Stage first to unlock live rank'
                  : !onFetchLiveRank ? 'Select an app to enable live rank'
                  : `Fetch live rank for "${score.keyword}" — ${cost} credit${cost !== 1 ? 's' : ''}`
                }
              >
                {liveRankState === 'pending' ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching ranks…</>
                ) : isLocked ? (
                  <><Radio className="h-3.5 w-3.5" /> Stage first · then fetch rank</>
                ) : !onFetchLiveRank ? (
                  <><Radio className="h-3.5 w-3.5" /> Select an app to fetch rank</>
                ) : hasFetched ? (
                  <><Radio className="h-3.5 w-3.5" /> Refresh · {markets.length} market{markets.length !== 1 ? 's' : ''} · {cost} credit{cost !== 1 ? 's' : ''}</>
                ) : (
                  <><Radio className="h-3.5 w-3.5" /> Fetch rank · {markets.length} market{markets.length !== 1 ? 's' : ''} · {cost} credit{cost !== 1 ? 's' : ''}</>
                )}
              </button>
            </div>
          );
        })()}
      </div>
    </article>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── localStorage persistence helpers ────────────────────────────────────────
// Key is workspace-scoped so switching workspaces shows the correct history.

function storageKey(workspaceId: string) {
  return `kv_results_${workspaceId}`;
}

function loadResults(workspaceId: string): KeywordScore[] {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as KeywordScore[];
  } catch {
    return [];
  }
}

function saveResults(workspaceId: string, results: KeywordScore[]) {
  try {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(results));
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

function loadStagingState(workspaceId: string): Record<string, 'pending' | 'done'> {
  try {
    const raw = localStorage.getItem(`${storageKey(workspaceId)}_staged`);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, 'pending' | 'done'>;
  } catch {
    return {};
  }
}

function saveStagingState(workspaceId: string, state: Record<string, 'pending' | 'done'>) {
  try {
    localStorage.setItem(`${storageKey(workspaceId)}_staged`, JSON.stringify(state));
  } catch {
    // fail silently
  }
}

export function KeywordValidatorCard({
  workspaceId, appId, selectedCountries, isOpen, onClose, onKeywordStaged,
}: KeywordValidatorCardProps) {
  const headingId   = useId();
  const inputRef    = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const [keyword,        setKeyword]        = useState('');
  // Start empty on both server and client to avoid SSR/hydration mismatch.
  // localStorage is read in a useEffect after mount (client-only).
  const [results,        setResults]        = useState<KeywordScore[]>([]);
  const [stagingState,   setStagingState]   = useState<Record<string, 'pending' | 'done'>>({});
  const [liveRankStates, setLiveRankStates] = useState<Record<string, 'pending' | 'done' | 'error'>>({});
  const [hydrated,       setHydrated]       = useState(false);

  // ── Hydration-safe localStorage load ─────────────────────────────────────
  // Runs once after mount (client only). Server always starts with empty state
  // so SSR HTML matches the initial client render — no hydration mismatch.
  useEffect(() => {
    setResults(loadResults(workspaceId));
    setStagingState(loadStagingState(workspaceId));
    setHydrated(true);
  }, [workspaceId]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 310);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Persist results to localStorage whenever they change (after hydration)
  useEffect(() => {
    if (hydrated) saveResults(workspaceId, results);
  }, [results, workspaceId, hydrated]);

  // Persist staging state to localStorage whenever it changes (after hydration)
  useEffect(() => {
    if (hydrated) saveStagingState(workspaceId, stagingState);
  }, [stagingState, workspaceId, hydrated]);

  // ── Validate ──────────────────────────────────────────────────────────────
  // Dashboard is English-only. language is always 'en'.
  // The API accepts 'ar' too, but that locale is only active on the landing page
  // (set via LocaleHtmlBootstrap) — not inside the authenticated dashboard.
  const validateMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch(`/api/workspaces/${workspaceId}/validator/validate-keyword`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: q, language: 'en' }),
      });
      const raw = (await res.json().catch(() => ({}))) as RawApiResponse;
      if (!res.ok) {
        throw new Error(raw?.error?.message ?? 'Validation failed');
      }
      // Normalise: flattens nested difficulty, maps recommendation casing
      return normaliseApiResponse(raw);
    },
    onSuccess: (data) => {
      // Deduplicate by keyword so re-validating the same term replaces the old result
      setResults((prev) => [data, ...prev.filter((r) => r.keyword !== data.keyword)]);
      setKeyword('');
      toast.success('Keyword validated');
    },
    onError: (err: Error) => toast.error(err.message ?? 'Validation failed'),
  });

  const handleValidate = useCallback(() => {
    const q = keyword.trim();
    if (!q || validateMutation.isPending) return;
    validateMutation.mutate(q);
  }, [keyword, validateMutation]);

  // ── Stage ─────────────────────────────────────────────────────────────────
  const stageMutation = useMutation({
    mutationFn: async (score: KeywordScore) => {
      const res = await fetch(`/api/workspaces/${workspaceId}/staging-vault/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: 'en', ...score }),
      });
      if (!res.ok && res.status !== 404) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'Staging failed');
      }
      return score;
    },
    onMutate:  (s) => setStagingState((p) => ({ ...p, [s.keyword]: 'pending' })),
    onSuccess: (s) => {
      setStagingState((p) => ({ ...p, [s.keyword]: 'done' }));
      onKeywordStaged?.(s.keyword, s);
      toast.success(`"${s.keyword}" staged to tracker`);
      // Invalidate optimizer context so AI Listing Optimizer Active Context re-renders
      void queryClient.invalidateQueries({ queryKey: OPTIMIZER_CONTEXT_KEY(workspaceId) });
    },
    onError: (err: Error, s) => {
      setStagingState((p) => { const n = { ...p }; delete n[s.keyword]; return n; });
      toast.error(err.message ?? 'Staging failed');
    },
  });

  const handleStage = useCallback((score: KeywordScore) => {
    if (stagingState[score.keyword]) return;
    stageMutation.mutate(score);
  }, [stagingState, stageMutation]);

  // ── Multi-market live rank fetch ──────────────────────────────────────────
  // Client sends keyword + countries[] + appId. Zero billing logic here.
  // Server: auth → balance check → consume N credits RPC (SELECT FOR UPDATE) →
  //         parallel Serper fetches → market-indexed vault write → refund on total failure.
  const liveRankMutation = useMutation({
    mutationFn: async ({ kw, countries }: { kw: string; countries: string[] }) => {
      if (!appId) throw new Error('No app selected — cannot write rank to vault');
      const res = await fetch(`/api/workspaces/${workspaceId}/validator/live-rank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, countries, appId, locale: 'en' }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        keyword?: string;
        results?: Array<{ country: string; rank: number | null; error?: string }>;
        creditsCharged?: number;
        balanceAfter?: number;
        rankedAt?: string;
        error?: { code?: string; message?: string; required?: number; remaining?: number };
      };
      if (!res.ok || !json.ok) {
        if (res.status === 402) {
          const req = json.error?.required;
          const rem = json.error?.remaining;
          throw new Error(
            typeof req === 'number' && typeof rem === 'number'
              ? `Not enough credits (need ${req}, have ${rem})`
              : 'Insufficient AI credits',
          );
        }
        if (json.error?.code === 'no_package_name') {
          throw new Error('Add your app\'s Android package name in workspace settings first.');
        }
        throw new Error(json.error?.message ?? 'Live rank fetch failed');
      }
      return {
        kw,
        marketResults: json.results ?? [],
        rankedAt: json.rankedAt ?? new Date().toISOString(),
      };
    },
    onMutate: ({ kw }) => {
      setLiveRankStates((p) => ({ ...p, [kw]: 'pending' }));
    },
    onSuccess: ({ kw, marketResults, rankedAt }) => {
      setLiveRankStates((p) => ({ ...p, [kw]: 'done' }));

      // Build market-indexed liveRanks and patch in-memory results
      const newRanks: KeywordScore['liveRanks'] = {};
      for (const { country, rank, error } of marketResults) {
        newRanks[country] = { rank, fetched_at: rankedAt, ...(error ? { error } : {}) };
      }
      setResults((prev) => prev.map((r) =>
        r.keyword === kw
          ? { ...r, liveRanks: { ...(r.liveRanks ?? {}), ...newRanks } }
          : r,
      ));

      const succeeded = marketResults.filter((r) => !r.error);
      const failed    = marketResults.filter((r) => r.error);

      // ── Educational rich toasts ────────────────────────────────────────
      // Teaches users what live rank means (industry-standard ASO context).
      // Uses toast.message(title, { description }) for title + detail line.

      if (succeeded.length === 0) {
        // All markets failed
        toast.error('Rank fetch failed — no results returned');
        return;
      }

      if (succeeded.length === 1 && marketResults.length === 1) {
        // Single market — give the most specific, educational message
        const { country, rank } = succeeded[0];
        if (rank) {
          toast.message(`#${rank} in ${country.toUpperCase()} for "${kw}"`, {
            description:
              'Your app\'s organic position in Google Play search results right now. ' +
              'Ranks are point-in-time snapshots — they shift based on algorithm signals, installs, and listing relevance.',
          });
        } else {
          toast.message(`Not in top 100 in ${country.toUpperCase()} for "${kw}"`, {
            description:
              'Your app wasn\'t surfaced in the first page of results for this keyword in this market right now. ' +
              'Consider optimising your listing or targeting a lower-competition keyword.',
          });
        }
      } else if (succeeded.length > 1 && failed.length === 0) {
        // All markets succeeded — show summary with education
        toast.message(`"${kw}" ranked across ${succeeded.length} markets`, {
          description:
            'Each result is an independent point-in-time snapshot. Markets are compared separately — ' +
            'US rank and IN rank are driven by different algorithm signals and user bases.',
        });
      } else {
        // Partial success — note which markets failed and no charge for them
        toast.message(`${succeeded.length} of ${marketResults.length} markets returned`, {
          description:
            `${failed.map((r) => r.country.toUpperCase()).join(', ')} could not be fetched. ` +
            'Successful markets were charged; failed markets were not.',
        });
      }

      void queryClient.invalidateQueries({ queryKey: OPTIMIZER_CONTEXT_KEY(workspaceId) });
    },
    onError: (err: Error, { kw }) => {
      setLiveRankStates((p) => ({ ...p, [kw]: 'error' }));

      // Map specific server error codes to educational messages
      if (err.message.includes('package name')) {
        toast.message('Package name required', {
          description:
            'Add your app\'s Android package name (e.g. com.yourapp.id) in workspace Settings → App ' +
            'to enable live rank checks. No credits were charged.',
        });
      } else if (err.message.includes('credits') || err.message.includes('Credits')) {
        toast.message('Not enough credits', {
          description:
            `Live rank uses 1 credit per market. Top up in workspace settings.`,
        });
      } else if (err.message.includes('not configured')) {
        toast.message('Live rank unavailable', {
          description: 'The live search service is not configured for this workspace.',
        });
      } else {
        toast.error(err.message ?? 'Live rank fetch failed');
      }
    },
  });

  const handleFetchLiveRank = useCallback((kw: string, countries: string[]) => {
    if (liveRankStates[kw] === 'pending') return;
    liveRankMutation.mutate({ kw, countries });
  }, [liveRankStates, liveRankMutation]);

  const handleRemove = useCallback((kw: string) => {
    setResults((prev) => prev.filter((r) => r.keyword !== kw));
    setStagingState((prev) => { const n = { ...prev }; delete n[kw]; return n; });
    setLiveRankStates((prev) => { const n = { ...prev }; delete n[kw]; return n; });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 transition-opacity duration-300',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onClick={isOpen ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Panel — all structural colours via inline style (purge-safe) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-hidden={!isOpen}
        className="fixed top-0 z-50 flex h-full w-full flex-col"
        style={{
          right: 0,
          maxWidth: '420px',
          backgroundColor: C.panelBg,
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '-8px 0 40px -8px rgba(0,0,0,0.9)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 300ms ease-in-out',
          willChange: 'transform',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="relative shrink-0 px-6 py-4"
          style={{
            backgroundColor: C.panelBg,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(16,185,129,0.1), transparent)',
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'rgba(16,185,129,0.8)' }}>
                Analysis Tool
              </p>
              <h2 id={headingId} className="text-base font-semibold text-white">
                Keyword Validator
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Viability · Difficulty · Search volume
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-zinc-400 transition-colors hover:text-white focus-visible:outline-none"
              style={{ '--hover-bg': 'rgba(255,255,255,0.06)' } as React.CSSProperties}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-5"
          style={{ backgroundColor: C.panelBg }}
        >

          {/* Pro-command input */}
          <div>
            <div
              className="rounded-xl p-px transition-all duration-300"
              style={{
                background: validateMutation.isPending
                  ? 'linear-gradient(90deg, rgba(16,185,129,0.4), rgba(16,185,129,0.7), rgba(16,185,129,0.4))'
                  : 'rgba(255,255,255,0.08)',
              }}
            >
              <div
                className="flex items-center overflow-hidden rounded-[11px]"
                style={{ backgroundColor: C.inputBg }}
              >
                {/* ps-* / pe-* = logical padding-inline-start/end — direction-agnostic */}
                <span className="flex shrink-0 items-center ps-4 pe-2" style={{ color: '#52525b' }}>
                  {validateMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#10b981' }} />
                    : <Search className="h-4 w-4" />}
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleValidate()}
                  placeholder="e.g., photo editor"
                  disabled={validateMutation.isPending}
                  className="min-w-0 flex-1 bg-transparent py-3 ps-1 pe-3 text-sm text-white placeholder-zinc-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={validateMutation.isPending || !keyword.trim()}
                  className="flex shrink-0 items-center gap-2 px-5 py-3 text-sm font-semibold transition-all duration-150 focus-visible:outline-none disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: keyword.trim() && !validateMutation.isPending ? '#059669' : 'rgba(255,255,255,0.05)',
                    color:           keyword.trim() && !validateMutation.isPending ? '#ffffff' : '#52525b',
                  }}
                  onMouseEnter={(e) => { if (keyword.trim() && !validateMutation.isPending) e.currentTarget.style.backgroundColor = '#10b981'; }}
                  onMouseLeave={(e) => { if (keyword.trim() && !validateMutation.isPending) e.currentTarget.style.backgroundColor = '#059669'; }}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Analyze
                </button>
              </div>
            </div>
            {!validateMutation.isPending && (
              <p className="mt-1.5 px-1 text-[10px]" style={{ color: '#3f3f46' }}>
                Press Enter to analyze
              </p>
            )}
          </div>

          {/* Results */}
          {results.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="flex items-center justify-between px-0.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </p>
                {results.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setResults([]);
                      setStagingState({});
                      saveResults(workspaceId, []);
                      saveStagingState(workspaceId, {});
                    }}
                    className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {results.map((score, idx) => {
                  const safeScore: KeywordScore = TIER[score.recommendation]
                    ? score
                    : { ...score, recommendation: 'SKIP' };
                  return (
                    <ResultRow
                      key={`${safeScore.keyword}__${idx}`}
                      score={safeScore}
                      staged={stagingState[safeScore.keyword]}
                      onStage={() => handleStage(safeScore)}
                      onRemove={() => handleRemove(safeScore.keyword)}
                      onFetchLiveRank={appId ? (countries) => handleFetchLiveRank(safeScore.keyword, countries) : undefined}
                      liveRankState={liveRankStates[safeScore.keyword]}
                      selectedCountries={selectedCountries}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
