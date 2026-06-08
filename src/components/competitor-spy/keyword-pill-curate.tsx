/**
 * Enhanced Keyword Pill Component with Multi-Select Support
 *
 * Replaces static "copy" buttons with an interactive selectable state.
 * Supports both curation mode (select) and copy mode (clipboard).
 *
 * Features:
 * - Selectable state with visual feedback (checkmark + color shift)
 * - RTL/LTR support for Arabic and English layouts
 * - Animated state transitions (Framer Motion)
 * - Category-aware coloring (high_volume/intent_based/competitor_gap)
 * - Accessibility compliance (ARIA labels, keyboard navigation)
 * - Copy-to-clipboard fallback when curation disabled
 * - Production-ready error handling
 *
 * Integrates with:
 * - useKeywordSelection: Selection state management
 * - KeywordSurfacesCuration: Parent container
 * - KeywordCurationFloatingBar: Displays selected count
 *
 * Type Safety:
 * - Full TypeScript coverage
 * - Strict prop validation
 * - Category union types from useKeywordSelection
 *
 * Architecture Notes:
 * - Pure component (no side effects except callbacks)
 * - Memoization recommended for large lists
 * - Icons from lucide-react (existing dependency)
 * - Animations from framer-motion (existing dependency)
 *
 * Example:
 * ```tsx
 * <KeywordPillCurate
 *   keyword="fitness tracker"
 *   category="high_volume"
 *   locale="en"
 *   isRtl={false}
 *   isSelected={true}
 *   onToggle={selection.toggleKeyword}
 *   curateMode={true}
 * />
 * ```
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Copy, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KeywordCategory } from '@/hooks/useKeywordSelection';

/**
 * Props for KeywordPillCurate component
 *
 * CRITICAL:
 * - keyword: The term being displayed (e.g., "fitness tracker")
 * - category: Must be one of high_volume | intent_based | competitor_gap
 * - locale: Determines i18n labels (passed from parent useKeywordSelection)
 * - isRtl: Computed from locale or overridden for testing
 * - curateMode: Controls behavior (select vs copy)
 */
export interface KeywordPillCurateProps {
  /** Keyword text to display (e.g., 'fitness tracker') */
  keyword: string;

  /** Strategy category for color coding */
  category: KeywordCategory;

  /** Current locale ('en' or 'ar') - used for ARIA labels */
  locale: string;

  /** RTL layout flag (computed from locale) */
  isRtl?: boolean;

  /** Whether this keyword is currently selected */
  isSelected?: boolean;

  /** Callback when user toggles selection */
  onToggle?: (term: string, category: KeywordCategory) => void;

  /** If true: selection mode (click to toggle)
   *  If false: copy mode (click to copy to clipboard) */
  curateMode?: boolean;
}

/**
 * Color scheme for strategy categories
 * Changes based on selection state and mode
 *
 * @internal
 */
function getStrategyColor(
  strategy: KeywordCategory,
  isSelected: boolean,
  curateMode: boolean
) {
  /**
   * Base colors: Muted, less attention-grabbing
   * Used for unselected keywords in curation mode,
   * and all keywords in copy mode
   */
  const baseColors = {
    high_volume: {
      bg: 'bg-blue-500/15',
      border: 'border-blue-500/40',
      text: 'text-blue-300',
      hover: 'hover:bg-blue-500/25 hover:border-blue-500/60',
      icon: 'text-blue-400',
    },
    intent_based: {
      bg: 'bg-emerald-500/15',
      border: 'border-emerald-500/40',
      text: 'text-emerald-300',
      hover: 'hover:bg-emerald-500/25 hover:border-emerald-500/60',
      icon: 'text-emerald-400',
    },
    competitor_gap: {
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/40',
      text: 'text-amber-300',
      hover: 'hover:bg-amber-500/25 hover:border-amber-500/60',
      icon: 'text-amber-400',
    },
  };

  /**
   * Selected colors: Bright, vibrant - draws attention to selection
   * Only used in curation mode when isSelected === true
   */
  const selectedColors = {
    high_volume: {
      bg: 'bg-blue-500/35',
      border: 'border-blue-400/80',
      text: 'text-blue-100',
      hover: 'hover:bg-blue-500/45 hover:border-blue-400',
      icon: 'text-blue-300',
    },
    intent_based: {
      bg: 'bg-emerald-500/35',
      border: 'border-emerald-400/80',
      text: 'text-emerald-100',
      hover: 'hover:bg-emerald-500/45 hover:border-emerald-400',
      icon: 'text-emerald-300',
    },
    competitor_gap: {
      bg: 'bg-amber-500/35',
      border: 'border-amber-400/80',
      text: 'text-amber-100',
      hover: 'hover:bg-amber-500/45 hover:border-amber-400',
      icon: 'text-amber-300',
    },
  };

  // Return selected colors if in curation mode AND keyword is selected
  if (curateMode && isSelected) {
    return selectedColors[strategy];
  }

  // Otherwise return base colors
  return baseColors[strategy];
}

/**
 * Get localized category label for ARIA labels
 * @internal
 */
function getStrategyLabel(strategy: KeywordCategory, locale: string): string {
  const labels: Record<KeywordCategory, Record<string, string>> = {
    high_volume: {
      en: 'High-Volume',
      ar: 'عالي الحجم',
    },
    intent_based: {
      en: 'Intent-Based',
      ar: 'موجه بالنية',
    },
    competitor_gap: {
      en: 'Competitor Gap',
      ar: 'فجوة تنافسية',
    },
  };

  const key = locale === 'ar' ? 'ar' : 'en';
  return labels[strategy]?.[key] || strategy;
}

/**
 * Enhanced Keyword Pill Component
 *
 * Renders as a button with:
 * - Keyword text on left (truncated if too long)
 * - Icon on right (changes based on state)
 * - Color and styling based on category + selection state
 * - Smooth animations for state transitions
 *
 * In curation mode:
 *   - Click toggles selection via onToggle callback
 *   - Selected state shows checkmark + bright color + glow
 *   - Right-click can copy (optional)
 *
 * In copy mode (curateMode=false):
 *   - Click copies keyword to clipboard
 *   - Shows copy icon that animates to checkmark
 *   - No selection state
 *
 * RTL Support:
 *   - Keyword text rendered with LTR/RTL as appropriate
 *   - Icon placement mirrors correctly
 *   - Focus ring renders in correct position
 */
export const KeywordPillCurate = React.forwardRef<
  HTMLButtonElement,
  KeywordPillCurateProps
>(
  (
    {
      keyword,
      category,
      locale,
      isRtl = false,
      isSelected = false,
      onToggle,
      curateMode = true,
    },
    ref
  ) => {
    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════
    /** Track copy-to-clipboard feedback (shows checkmark briefly) */
    const [copied, setCopied] = useState(false);

    // ═══════════════════════════════════════════════════════════════════════
    // COMPUTED
    // ═══════════════════════════════════════════════════════════════════════
    const colors = getStrategyColor(category, isSelected, curateMode);
    const categoryLabel = getStrategyLabel(category, locale);

    /**
     * ARIA label for accessibility
     * Screen reader will announce: "fitness tracker, High-Volume"
     */
    const ariaLabel =
      locale === 'ar'
        ? `${keyword}, ${categoryLabel}`
        : `${keyword}, ${categoryLabel}`;

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Handle primary click:
     * - Curation mode: Toggle selection via onToggle callback
     * - Copy mode: Copy to clipboard
     */
    const handleClick = () => {
      if (curateMode && onToggle) {
        // Curation mode: invoke toggle callback
        onToggle(keyword, category);
        console.log('[KeywordPillCurate] 🔍 TOGGLE CLICKED:', {
          keyword,
          category,
          willSelect: !isSelected,
          locale,
        });
      } else if (!curateMode) {
        // Copy mode: copy to clipboard
        handleCopy();
      }
    };

    /**
     * Copy keyword to clipboard with visual feedback
     * Shows checkmark for 1.5 seconds then returns to copy icon
     */
    const handleCopy = async (e?: React.MouseEvent) => {
      // Prevent event bubbling if called from secondary action
      if (e) {
        e.stopPropagation();
      }

      try {
        await navigator.clipboard.writeText(keyword);
        setCopied(true);

        // Reset after 1.5s
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
      } catch (err) {
        console.error('[KeywordPillCurate] ❌ COPY FAILED:', {
          keyword,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    /**
     * Right-click context menu handler
     * In curation mode: copies keyword as secondary action
     * In copy mode: no special behavior
     */
    const handleContextMenu = (e: React.MouseEvent) => {
      if (!curateMode) return;
      e.preventDefault();
      handleCopy();
    };

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════
    return (
      <motion.button
        ref={ref}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        layoutId={`keyword-pill-${keyword}`}
        className={cn(
          // Layout
          'group relative px-3 py-2 rounded-lg text-sm font-medium',

          // Border & transition
          'border transition-all duration-150',

          // Colors
          colors.bg,
          colors.border,
          colors.text,
          colors.hover,

          // Cursor & overflow
          'cursor-pointer overflow-hidden',

          // Focus ring (keyboard navigation)
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent',
          isSelected && 'focus:ring-current'
        )}
        aria-label={ariaLabel}
        aria-pressed={curateMode ? isSelected : undefined}
        role="button"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* KEYWORD TEXT + ICON CONTAINER */}
        <span
          className={cn(
            'relative flex items-center justify-between gap-2',
            isRtl && 'flex-row-reverse'
          )}
        >
          {/* Keyword Text */}
          <span className="truncate text-xs font-medium">{keyword}</span>

          {/* Icon Section - Changes based on mode & state */}
          {curateMode ? (
            // ═══════════════════════════════════════════════════════════════
            // CURATION MODE: Show checkbox/checkmark
            // ═══════════════════════════════════════════════════════════════
            <motion.div
              initial={false}
              animate={{ scale: isSelected ? 1.1 : 1 }}
              transition={{ duration: 0.15 }}
              className="flex-shrink-0"
            >
              {isSelected ? (
                // Selected: show filled checkmark circle
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                // Not selected: show empty circle (subtle outline)
                <div className="w-4 h-4 rounded-full border-2 border-current opacity-50 group-hover:opacity-100 transition-opacity" />
              )}
            </motion.div>
          ) : (
            // ═══════════════════════════════════════════════════════════════
            // COPY MODE: Show copy/checkmark icon with animation
            // ═══════════════════════════════════════════════════════════════
            <AnimatePresence mode="wait">
              <motion.div
                key={copied ? 'check' : 'copy'}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-shrink-0"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 flex-shrink-0" />
                ) : (
                  <Copy className="w-3.5 h-3.5 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </span>

        {/* SELECTION GLOW EFFECT - Curation mode only */}
        {isSelected && curateMode && (
          <motion.div
            layoutId={`pill-glow-${keyword}`}
            className="absolute inset-0 rounded-lg pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            style={{
              // Subtle inset glow effect on selected state
              boxShadow: 'inset 0 0 12px currentColor',
            }}
          />
        )}
      </motion.button>
    );
  }
);

// Display name for debugging
KeywordPillCurate.displayName = 'KeywordPillCurate';

export default KeywordPillCurate;
