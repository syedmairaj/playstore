/**
 * Keyword Pill Component - Dual-Mode Implementation
 *
 * Seamlessly switches between two interaction modes:
 *
 * 1. COPY MODE (Default):
 *    - Click to copy keyword to clipboard
 *    - Shows copy icon (📋)
 *    - Icon animates to checkmark on successful copy
 *    - Familiar, quick-access behavior
 *
 * 2. SELECTION MODE (Curation):
 *    - Click to select/deselect for batch operations
 *    - Shows empty circle (⭕) when unselected
 *    - Shows checkmark (✓) when selected
 *    - Selected keywords get bright color + glow effect
 *    - Supports multi-select across categories
 *
 * Features:
 * - Full RTL/LTR support (English + Arabic)
 * - Smooth animated transitions between states
 * - Category-aware coloring (high_volume/intent_based/competitor_gap)
 * - Accessibility compliant (ARIA labels, keyboard navigation)
 * - Comprehensive diagnostic logging
 * - No external state - mode determined by context
 *
 * Type Safety:
 * - Full TypeScript coverage with strict types
 * - KeywordCategory union type enforcement
 * - Prop interface validation
 *
 * Integration:
 * - useKeywordCurationMode(): Determines mode (global context)
 * - useKeywordSelection(): Manages selection state
 * - Category colors: Matches your design system
 *
 * Localization:
 * - English (en): Copy/Select icons + English labels
 * - Arabic (ar): Same icons + Arabic labels + RTL layout
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Copy, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useKeywordCurationMode } from '@/contexts/KeywordCurationModeContext';
import type { KeywordCategory } from '@/hooks/useKeywordSelection';

/**
 * Props for Dual-Mode Keyword Pill
 *
 * CRITICAL PROPS:
 * - keyword: The term being displayed (e.g., "fitness tracker")
 * - category: Strategy category (high_volume | intent_based | competitor_gap)
 * - isSelected: Only relevant in selection mode
 * - onToggle: Selection callback (called in selection mode)
 * - mode: Determines behavior (determined by context in practice)
 *
 * Optional:
 * - locale: For i18n (defaults to 'en')
 * - isRtl: RTL layout flag (computed from locale)
 */
export interface KeywordPillDualModeProps {
  /** Keyword text to display (e.g., 'fitness tracker') */
  keyword: string;

  /** Strategy category for color coding */
  category: KeywordCategory;

  /** Current locale ('en' or 'ar') - for i18n labels */
  locale: string;

  /** RTL layout flag (computed from locale) */
  isRtl?: boolean;

  /** Selection state (only used in selection mode) */
  isSelected?: boolean;

  /** Called when user toggles selection (selection mode only) */
  onToggle?: (term: string, category: KeywordCategory) => void;
}

/**
 * Color scheme for strategy categories
 * Adjusts based on selection state and category
 *
 * @internal
 */
function getStrategyColor(
  strategy: KeywordCategory,
  isSelected: boolean,
  isSelectionMode: boolean
) {
  /**
   * Base colors: Muted appearance
   * Used in copy mode (always) and unselected items in selection mode
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
   * Selected colors: Bright, vibrant with accent lighting
   * Only used in selection mode when isSelected === true
   * Creates clear visual distinction for selected items
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

  // In selection mode, use selected colors if keyword is selected
  if (isSelectionMode && isSelected) {
    return selectedColors[strategy];
  }

  // Otherwise, always use base colors
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
 * Get localized mode-specific labels
 * @internal
 */
function getModeLabels(locale: string) {
  return locale === 'ar'
    ? {
        copy: 'انسخ',
        copyTitle: 'انقر للنسخ إلى الحافظة',
        selectTitle: 'انقر لتحديد الكلمة المفتاحية',
        selected: 'محدد',
        unselected: 'غير محدد',
      }
    : {
        copy: 'Copy',
        copyTitle: 'Click to copy to clipboard',
        selectTitle: 'Click to select keyword',
        selected: 'Selected',
        unselected: 'Unselected',
      };
}

/**
 * Dual-Mode Keyword Pill Component
 *
 * ═════════════════════════════════════════════════════════════════════════
 * BEHAVIOR MATRIX
 * ═════════════════════════════════════════════════════════════════════════
 *
 * COPY MODE (Default):
 * ├─ Icon: 📋 Copy (or ✓ Check after click)
 * ├─ Click Behavior: Copy to clipboard
 * ├─ Visual Feedback: Icon animates copy → check (1.5s)
 * ├─ Selection State: Ignored (no visual change)
 * ├─ Best For: Quick access, familiar interaction
 * └─ Use Case: Initial/default experience
 *
 * SELECTION MODE (Curation):
 * ├─ Icon: ⭕ Circle (unselected) or ✓ Check (selected)
 * ├─ Click Behavior: Toggle selection
 * ├─ Visual Feedback: Color shift, icon change, glow effect
 * ├─ Selection State: Controls everything
 * ├─ Best For: Multi-select, batch operations
 * └─ Use Case: Advanced curation workflow
 *
 * ═════════════════════════════════════════════════════════════════════════
 */
export const KeywordPillDualMode = React.forwardRef<
  HTMLButtonElement,
  KeywordPillDualModeProps
>(
  (
    {
      keyword,
      category,
      locale,
      isRtl = false,
      isSelected = false,
      onToggle,
    },
    ref
  ) => {
    // ═════════════════════════════════════════════════════════════════════
    // CONTEXT & STATE
    // ═════════════════════════════════════════════════════════════════════

    // Get current mode from context (copy vs selection)
    const { mode: contextMode, isSelectionMode, isCopyMode } = useKeywordCurationMode();

    // Track clipboard feedback (copy mode only)
    const [copied, setCopied] = useState(false);

    // ═════════════════════════════════════════════════════════════════════
    // COMPUTED VALUES
    // ═════════════════════════════════════════════════════════════════════

    const colors = getStrategyColor(category, isSelected, isSelectionMode);
    const categoryLabel = getStrategyLabel(category, locale);
    const modeLabels = getModeLabels(locale);

    /**
     * ARIA label for accessibility
     * Screen reader: "fitness tracker, High-Volume, unselected" (or "selected")
     */
    const ariaLabel = locale === 'ar'
      ? `${keyword}, ${categoryLabel}`
      : `${keyword}, ${categoryLabel}`;

    const ariaPressed = isSelectionMode ? isSelected : undefined;

    // ═════════════════════════════════════════════════════════════════════
    // HANDLERS
    // ═════════════════════════════════════════════════════════════════════

    /**
     * Handle click based on current mode
     * - Copy Mode: Copy to clipboard
     * - Selection Mode: Toggle selection
     */
    const handleClick = () => {
      if (isSelectionMode && onToggle) {
        // SELECTION MODE: Toggle selection
        onToggle(keyword, category);
        console.log('[KeywordPillDualMode] 🔍 SELECTION TOGGLED:', {
          keyword,
          category,
          newState: isSelected ? 'deselected' : 'selected',
          locale,
        });
      } else if (isCopyMode) {
        // COPY MODE: Copy to clipboard
        handleCopy();
      }
    };

    /**
     * Copy keyword to clipboard with visual feedback
     * Shows checkmark for 1.5 seconds, then returns to copy icon
     */
    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(keyword);
        setCopied(true);

        console.log('[KeywordPillDualMode] ✓ COPY SUCCESS:', {
          keyword,
          timestamp: new Date().toISOString(),
        });

        // Auto-reset after 1.5s
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
      } catch (err) {
        console.error('[KeywordPillDualMode] ❌ COPY FAILED:', {
          keyword,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    /**
     * Right-click context menu handler
     * In selection mode: copy as secondary action
     */
    const handleContextMenu = (e: React.MouseEvent) => {
      if (!isSelectionMode) return;
      e.preventDefault();
      handleCopy();
    };

    // ═════════════════════════════════════════════════════════════════════
    // RENDER
    // ═════════════════════════════════════════════════════════════════════
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

          // Colors from strategy + selection state
          colors.bg,
          colors.border,
          colors.text,
          colors.hover,

          // Cursor & overflow
          'cursor-pointer overflow-hidden',

          // Focus ring (keyboard navigation)
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent',
          isSelected && isSelectionMode && 'focus:ring-current'
        )}
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
        role="button"
        title={isSelectionMode ? modeLabels.selectTitle : modeLabels.copyTitle}
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

          {/* ICON SECTION - Mode-dependent behavior */}
          {isSelectionMode ? (
            // ═════════════════════════════════════════════════════════════
            // SELECTION MODE: Show checkbox/checkmark icon
            // ═════════════════════════════════════════════════════════════
            <motion.div
              initial={false}
              animate={{ scale: isSelected ? 1.1 : 1 }}
              transition={{ duration: 0.15, type: 'spring', stiffness: 300 }}
              className="flex-shrink-0"
            >
              {isSelected ? (
                // Selected state: filled checkmark circle
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ duration: 0.3, type: 'spring', stiffness: 400 }}
                >
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                </motion.div>
              ) : (
                // Unselected state: empty circle outline
                <motion.div
                  initial={false}
                  animate={{
                    borderColor: 'currentColor',
                  }}
                  transition={{ duration: 0.2 }}
                  className="w-4 h-4 rounded-full border-2 border-current opacity-50 group-hover:opacity-100 transition-opacity"
                />
              )}
            </motion.div>
          ) : (
            // ═════════════════════════════════════════════════════════════
            // COPY MODE: Show copy/checkmark icon with animation
            // ═════════════════════════════════════════════════════════════
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
                  // After successful copy: checkmark
                  <motion.div
                    initial={{ rotate: -180, scale: 0 }}
                    animate={{ rotate: 0, scale: 1 }}
                    transition={{ duration: 0.3, type: 'spring', stiffness: 400 }}
                  >
                    <Check className="w-3.5 h-3.5 flex-shrink-0 text-green-400" />
                  </motion.div>
                ) : (
                  // Default: copy icon
                  <Copy className="w-3.5 h-3.5 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </span>

        {/* SELECTION GLOW EFFECT - Selection mode, selected state only */}
        {isSelected && isSelectionMode && (
          <motion.div
            layoutId={`pill-glow-${keyword}`}
            className="absolute inset-0 rounded-lg pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            style={{
              // Subtle inset glow: draws eye to selected items
              boxShadow: 'inset 0 0 12px currentColor',
            }}
          />
        )}
      </motion.button>
    );
  }
);

// Display name for debugging and React DevTools
KeywordPillDualMode.displayName = 'KeywordPillDualMode';

export default KeywordPillDualMode;
