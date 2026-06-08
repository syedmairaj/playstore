/**
 * Keyword Category Header with Select All
 *
 * Displays category information and provides bulk selection option.
 *
 * Features:
 * - Category label localized (EN/AR)
 * - Count display with visual indicator
 * - "Select All" button for batch operations (selection mode only)
 * - Shows selection progress (e.g., "3/7 selected")
 * - Smooth animations for mode transitions
 * - RTL/LTR layout support
 * - Accessibility compliant
 *
 * Mode Behavior:
 * - Copy Mode: Shows category info only, no "Select All" button
 * - Selection Mode: Shows "Select All" / "Clear All" toggle button
 *
 * Usage:
 * ```tsx
 * <KeywordCategoryHeader
 *   category="high_volume"
 *   totalCount={12}
 *   selectedCount={3}
 *   locale="en"
 *   isRtl={false}
 *   onSelectAll={() => handleSelectAllForCategory('high_volume')}
 *   onClearAll={() => handleClearAllForCategory('high_volume')}
 * />
 * ```
 */

'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useKeywordCurationMode } from '@/contexts/KeywordCurationModeContext';
import type { KeywordCategory } from '@/hooks/useKeywordSelection';

/**
 * Props for category header component
 */
export interface KeywordCategoryHeaderProps {
  /** Category type (high_volume | intent_based | competitor_gap) */
  category: KeywordCategory;

  /** Total keywords in this category */
  totalCount: number;

  /** Currently selected keywords in this category */
  selectedCount?: number;

  /** Current locale ('en' or 'ar') */
  locale: string;

  /** RTL layout flag */
  isRtl?: boolean;

  /** Called when user clicks "Select All" */
  onSelectAll?: () => void;

  /** Called when user clicks "Clear All" */
  onClearAll?: () => void;
}

/**
 * Get localized category label
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
 * Get color indicator for category
 * @internal
 */
function getCategoryColorDot(category: KeywordCategory): string {
  const colors = {
    high_volume: 'bg-blue-500',
    intent_based: 'bg-emerald-500',
    competitor_gap: 'bg-amber-500',
  };
  return colors[category] || 'bg-zinc-500';
}

/**
 * Get localized button labels
 * @internal
 */
function getButtonLabels(locale: string) {
  return locale === 'ar'
    ? {
        selectAll: 'تحديد الكل',
        clearAll: 'مسح التحديد',
        selected: 'محدد',
        of: 'من',
      }
    : {
        selectAll: 'Select All',
        clearAll: 'Clear All',
        selected: 'selected',
        of: 'of',
      };
}

/**
 * Keyword Category Header Component
 *
 * Renders category information with optional select/clear actions.
 * Only shows action buttons in selection mode.
 *
 * Layout:
 * ```
 * [● Category Label]  (totalCount)       [Toggle Button]
 * ```
 *
 * In selection mode with selections:
 * ```
 * [● Category Label]  (3/12 selected)    [Clear All ✓]
 * ```
 *
 * In selection mode without selections:
 * ```
 * [● Category Label]  (12)               [Select All ☐]
 * ```
 */
export const KeywordCategoryHeader = React.forwardRef<
  HTMLDivElement,
  KeywordCategoryHeaderProps
>(
  (
    {
      category,
      totalCount,
      selectedCount = 0,
      locale,
      isRtl = false,
      onSelectAll,
      onClearAll,
    },
    ref
  ) => {
    // ═════════════════════════════════════════════════════════════════════
    // CONTEXT & COMPUTED
    // ═════════════════════════════════════════════════════════════════════

    const { isSelectionMode, isCopyMode } = useKeywordCurationMode();
    const categoryLabel = getStrategyLabel(category, locale);
    const colorDot = getCategoryColorDot(category);
    const buttonLabels = getButtonLabels(locale);

    // Determine button state
    const isAllSelected = selectedCount > 0 && selectedCount === totalCount;
    const hasSelection = selectedCount > 0;

    // Localized count text
    const countText = useMemo(() => {
      if (isCopyMode) {
        // Copy mode: just show total count
        return locale === 'ar'
          ? `(${totalCount})`
          : `(${totalCount})`;
      }

      // Selection mode: show selected/total
      return locale === 'ar'
        ? `(${selectedCount}/${totalCount} ${buttonLabels.selected})`
        : `(${selectedCount}/${totalCount} ${buttonLabels.selected})`;
    }, [selectedCount, totalCount, locale, isCopyMode, buttonLabels.selected]);

    // ═════════════════════════════════════════════════════════════════════
    // HANDLERS
    // ═════════════════════════════════════════════════════════════════════

    /**
     * Handle select/clear toggle
     * - If all selected: clear all
     * - Otherwise: select all
     */
    const handleToggle = () => {
      if (isAllSelected && onClearAll) {
        onClearAll();
        console.log('[KeywordCategoryHeader] 🔍 CLEAR ALL CLICKED:', {
          category,
          clearedCount: selectedCount,
        });
      } else if (onSelectAll) {
        onSelectAll();
        console.log('[KeywordCategoryHeader] 🔍 SELECT ALL CLICKED:', {
          category,
          selectableCount: totalCount,
        });
      }
    };

    // ═════════════════════════════════════════════════════════════════════
    // RENDER
    // ═════════════════════════════════════════════════════════════════════
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-between gap-3 px-1',
          isRtl && 'flex-row-reverse'
        )}
      >
        {/* LEFT SIDE: Category Label + Count */}
        <div className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
          {/* Color Dot Indicator */}
          <div className={cn('h-1.5 w-1.5 rounded-full', colorDot)} />

          {/* Category Label */}
          <h4
            className={cn(
              'text-xs font-semibold uppercase tracking-wider text-zinc-400',
              isRtl && 'text-right'
            )}
          >
            {categoryLabel}
          </h4>

          {/* Count Badge */}
          <span className="text-xs text-zinc-600 whitespace-nowrap">
            {countText}
          </span>
        </div>

        {/* RIGHT SIDE: Select/Clear Button (Selection Mode Only) */}
        {isSelectionMode && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleToggle}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium tracking-wide',
              'border transition-all duration-150 cursor-pointer',
              'focus:outline-none focus:ring-2 focus:ring-offset-0',
              isAllSelected
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-500/50'
                : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-500 hover:bg-zinc-700/60 hover:border-zinc-600/60'
            )}
            title={
              isAllSelected
                ? locale === 'ar'
                  ? 'مسح جميع التحديدات'
                  : 'Clear all selections'
                : locale === 'ar'
                ? 'تحديد جميع الكلمات'
                : 'Select all keywords'
            }
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            {/* Icon - only show checkmark when selected */}
            {isAllSelected && (
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.2, type: 'spring', stiffness: 400 }}
              >
                <Check className="w-3 h-3 flex-shrink-0" />
              </motion.div>
            )}

            {/* Label */}
            <span>
              {isAllSelected ? buttonLabels.clearAll : buttonLabels.selectAll}
            </span>
          </motion.button>
        )}
      </div>
    );
  }
);

// Display name for debugging
KeywordCategoryHeader.displayName = 'KeywordCategoryHeader';

export default KeywordCategoryHeader;
