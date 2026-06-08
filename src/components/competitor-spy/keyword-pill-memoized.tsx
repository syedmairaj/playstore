/**
 * Memoized Keyword Pill Component - Layout Stable + Global Selection
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LAYOUT STABILITY FIX
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Problem:
 * - Icon container wasn't reserved fixed space
 * - When icon appears/disappears, layout shifts ("hay-wire")
 * - Selection checkbox didn't occupy consistent space
 *
 * Solution:
 * - Icon container uses fixed w-4 h-4 (same size as icons)
 * - Space reserved even when unselected circle hidden
 * - flex-shrink-0 prevents collapsing
 * - RTL layout mirrors correctly with flex-row-reverse
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * GLOBAL SYNCHRONIZATION FIX
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Problem:
 * - Selecting 'myfitnesspal' in HIGH-VOLUME didn't select in INTENT-BASED
 * - Composite key approach treated same term in different categories separately
 *
 * Solution:
 * - Use useKeywordSelectionGlobal hook (term-based state)
 * - isTermSelected(keyword) checks only the term, not category
 * - toggleTerm(keyword) affects all instances globally
 * - Selection immediately syncs across all categories
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BILINGUAL LAYOUTS (EN/AR)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * RTL Support:
 * - dir="rtl" attribute on button for Arabic text alignment
 * - flex-row-reverse on content for icon-on-right layout
 * - gap-2 works with RTL automatically
 * - All margins/paddings symmetric (px-3 py-2)
 *
 * Arabic Keywords:
 * - مراقبة، الصحة، واللياقة (right-aligned in RTL)
 * - Icon naturally flows to left side in RTL
 * - No special RTL text handling needed
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Copy, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useKeywordCurationMode } from '@/contexts/KeywordCurationModeContext';
import type { KeywordCategory } from '@/hooks/useKeywordSelection';

export interface KeywordPillMemoizedProps {
  /** Keyword text to display */
  keyword: string;

  /** Strategy category for color coding */
  category: KeywordCategory;

  /** Current locale ('en' or 'ar') */
  locale: string;

  /** RTL layout flag (auto-computed from locale) */
  isRtl?: boolean;

  /** Is keyword currently selected (TERM-BASED GLOBAL STATE) */
  isSelected?: boolean;

  /** Called when user toggles selection - affects all category instances */
  onToggle?: (term: string) => void;
}

/**
 * Color scheme for strategy categories
 */
function getStrategyColor(
  strategy: KeywordCategory,
  isSelected: boolean,
  isSelectionMode: boolean
) {
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

  if (isSelectionMode && isSelected) {
    return selectedColors[strategy];
  }

  return baseColors[strategy];
}

/**
 * Get localized category label for ARIA
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
 * Keyword Pill Component - Memoized for Performance
 *
 * Only re-renders when:
 * - isSelected prop changes (this specific pill was toggled)
 * - locale prop changes (rare, language switch)
 *
 * Does NOT re-render when:
 * - Sibling pills are selected (memo prevents it)
 * - Category counters update (parent handles separately)
 * - onToggle callback reference changes (not checked in comparison)
 */
const KeywordPillMemoized = React.forwardRef<
  HTMLButtonElement,
  KeywordPillMemoizedProps
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
    const { mode: contextMode, isSelectionMode, isCopyMode } = useKeywordCurationMode();
    const [copied, setCopied] = useState(false);

    const colors = getStrategyColor(category, isSelected, isSelectionMode);
    const categoryLabel = getStrategyLabel(category, locale);
    const modeLabels = getModeLabels(locale);

    const ariaLabel = `${keyword}, ${categoryLabel}`;
    const ariaPressed = isSelectionMode ? isSelected : undefined;

    const handleClick = () => {
      if (isSelectionMode && onToggle) {
        // Global toggle: term only, not category
        // This will select/deselect the term across ALL categories
        onToggle(keyword);
        console.log(
          `[KeywordPillMemoized] ✓ TOGGLE TERM: "${keyword}" (GLOBAL)`,
          {
            category,
            locale,
            timestamp: new Date().toISOString(),
          }
        );
      } else if (isCopyMode) {
        handleCopy();
      }
    };

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(keyword);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch (err) {
        console.error('[KeywordPillMemoized] ❌ COPY FAILED:', err);
      }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
      if (!isSelectionMode) return;
      e.preventDefault();
      handleCopy();
    };

    return (
      <motion.button
        ref={ref}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        whileHover={{ opacity: 0.9 }}
        whileTap={{ opacity: 0.85 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        layoutId={`keyword-pill-${keyword}-${category}`}
        className={cn(
          'group relative px-3 py-2 rounded-lg text-sm font-medium',
          'border transition-all duration-150',
          colors.bg,
          colors.border,
          colors.text,
          colors.hover,
          'cursor-pointer overflow-hidden',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          isSelected && isSelectionMode && 'focus:ring-current',
          // ✅ STRICT CONTAINMENT: Fixed dimensions, no expansion
          'box-sizing-border-box w-full max-w-full'
        )}
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
        role="button"
        title={isSelectionMode ? modeLabels.selectTitle : modeLabels.copyTitle}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <span
          className={cn(
            'relative flex items-center justify-between gap-2 min-w-0',
            isRtl && 'flex-row-reverse'
          )}
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Keyword text - STRICT TRUNCATION: No expansion allowed */}
          <span className="truncate text-xs font-medium flex-1 min-w-0 max-w-full overflow-hidden text-ellipsis">
            {keyword}
          </span>

          {/* Icon container - FIXED SPACE (w-4 h-4) to prevent layout shift */}
          <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
            {isSelectionMode ? (
              <motion.div
                initial={false}
                animate={{ scale: isSelected ? 1.1 : 1 }}
                transition={{ duration: 0.15, type: 'spring', stiffness: 300 }}
                className="flex items-center justify-center"
                style={{
                  width: '100%',
                  height: '100%',
                }}
              >
                {isSelected ? (
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ duration: 0.3, type: 'spring', stiffness: 400 }}
                  >
                    <CheckCircle2
                      className="w-4 h-4 flex-shrink-0"
                      aria-hidden="true"
                    />
                  </motion.div>
                ) : (
                  // ✅ INVISIBLE UNSELECTED STATE: Only appears on hover as subtle hint
                  <div
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    {/* Empty div - no visible circle when unselected */}
                  </div>
                )}
              </motion.div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={copied ? 'check' : 'copy'}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center justify-center"
                  style={{
                    width: '100%',
                    height: '100%',
                  }}
                >
                  {copied ? (
                    <motion.div
                      initial={{ rotate: -180, scale: 0 }}
                      animate={{ rotate: 0, scale: 1 }}
                      transition={{ duration: 0.3, type: 'spring', stiffness: 400 }}
                    >
                      <Check
                        className="w-3.5 h-3.5 flex-shrink-0 text-green-400"
                        aria-hidden="true"
                      />
                    </motion.div>
                  ) : (
                    <Copy
                      className="w-3.5 h-3.5 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
                      aria-hidden="true"
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </span>

        {isSelected && isSelectionMode && (
          <motion.div
            layoutId={`pill-glow-${keyword}-${category}`}
            className="absolute inset-0 rounded-lg pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            style={{
              boxShadow: 'inset 0 0 12px currentColor',
            }}
          />
        )}
      </motion.button>
    );
  }
);

KeywordPillMemoized.displayName = 'KeywordPillMemoized';

/**
 * Custom prop comparison function
 * Only re-render if "meaningful" props change
 */
function arePropsEqual(
  prevProps: KeywordPillMemoizedProps,
  nextProps: KeywordPillMemoizedProps
): boolean {
  return (
    prevProps.keyword === nextProps.keyword &&
    prevProps.category === nextProps.category &&
    prevProps.locale === nextProps.locale &&
    prevProps.isRtl === nextProps.isRtl &&
    prevProps.isSelected === nextProps.isSelected
  );
}

/**
 * Export memoized component with custom comparison
 * This prevents re-renders when parent re-renders but props haven't changed
 */
export default React.memo(KeywordPillMemoized, arePropsEqual);
