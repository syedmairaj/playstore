/**
 * Keyword Selection Summary Bar
 *
 * Sticky floating panel showing all selected keywords organized by category.
 * Appears above the keyword list when selections exist.
 *
 * Features:
 * - Sticky positioning at top of expanded keyword surface
 * - Category breakdown with visual separators
 * - Quick remove (×) for individual keywords
 * - Clear All button for bulk operations
 * - Collapsible on small screens
 * - Full RTL/LTR support
 * - Multilingual (EN/AR)
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalKeywordSelection } from '@/contexts/KeywordSelectionContext';
import type { KeywordCategory } from '@/hooks/useKeywordSelection';

interface KeywordSelectionSummaryBarProps {
  locale: string;
  isRtl?: boolean;
  onClearAll?: () => void;
}

/**
 * Get localized category label
 */
function getCategoryLabel(category: KeywordCategory, locale: string): string {
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
  return labels[category]?.[key] || category;
}

/**
 * Get category color for visual indicator
 */
function getCategoryColor(category: KeywordCategory): string {
  const colors = {
    high_volume: 'bg-blue-500/20 border-blue-500/40 text-blue-200',
    intent_based: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200',
    competitor_gap: 'bg-amber-500/20 border-amber-500/40 text-amber-200',
  };
  return colors[category];
}

/**
 * Get category dot color
 */
function getCategoryDot(category: KeywordCategory): string {
  const colors = {
    high_volume: 'bg-blue-400',
    intent_based: 'bg-emerald-400',
    competitor_gap: 'bg-amber-400',
  };
  return colors[category];
}

export const KeywordSelectionSummaryBar = React.forwardRef<
  HTMLDivElement,
  KeywordSelectionSummaryBarProps
>(({ locale, isRtl = false, onClearAll }, ref) => {
  const { selectedIds, toggleKeyword, selectedCount, countByCategory, clearAll } =
    useGlobalKeywordSelection();

  const [isCollapsed, setIsCollapsed] = useState(false);

  // Parse selected IDs and organize by category
  // Helper function to parse composite key
  const parseKeywordId = (id: string): { term: string; category: KeywordCategory } => {
    const parts = id.split('|');
    const term = parts[0];
    const category = parts.slice(1).join('|') as KeywordCategory;
    return { term, category };
  };

  // Organize selected keywords by category
  const selectedByCategory: Record<KeywordCategory, string[]> = {
    high_volume: [],
    intent_based: [],
    competitor_gap: [],
  };

  selectedIds.forEach((id) => {
    const { term, category } = parseKeywordId(id);
    selectedByCategory[category].push(term);
  });

  // Localized strings
  const labels = {
    selected: locale === 'ar' ? 'محدد' : 'selected',
    clearAll: locale === 'ar' ? 'مسح الكل' : 'Clear All',
    removeItem: locale === 'ar' ? 'إزالة' : 'Remove',
  };

  if (selectedCount === 0) {
    return null;
  }

  return (
    <motion.div
      ref={ref}
      layout
      initial={false}
      className={cn(
        'sticky top-0 z-40 rounded-lg border',
        'bg-gradient-to-r from-slate-900/95 to-slate-800/95 backdrop-blur-sm',
        'border-slate-700/50 mb-4 overflow-hidden'
      )}
    >
      {/* Header: Count + Collapse Toggle + Clear All */}
      <div
        className={cn(
          'flex items-center justify-between gap-3 px-4 py-3',
          isRtl && 'flex-row-reverse'
        )}
      >
        {/* Left: Count + Label */}
        <div className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
          <div className="flex items-center gap-1.5">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-green-400"
            />
            <span className="text-sm font-semibold text-slate-200">
              {selectedCount} {labels.selected}
            </span>
          </div>
        </div>

        {/* Right: Clear All + Collapse Toggle */}
        <div className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
          {selectedCount > 0 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                clearAll();
                onClearAll?.();
              }}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 hover:border-red-500/50 text-red-300 transition-all"
              title={labels.clearAll}
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">{labels.clearAll}</span>
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 hover:bg-slate-700/50 rounded transition-colors"
          >
            {isCollapsed ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            )}
          </motion.button>
        </div>
      </div>

      {/* Content: Selected Keywords by Category */}
      <AnimatePresence initial={false} mode="wait">
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
            className="overflow-hidden border-t border-slate-700/30"
          >
            <div className="px-4 py-3 space-y-2">
              {Object.entries(selectedByCategory).map(([category, keywords]) => {
                if (keywords.length === 0) return null;

                const typedCategory = category as KeywordCategory;
                const categoryLabel = getCategoryLabel(typedCategory, locale);
                const colorClass = getCategoryColor(typedCategory);
                const dotClass = getCategoryDot(typedCategory);

                return (
                  <motion.div
                    key={category}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn('rounded-md border px-3 py-2', colorClass)}
                  >
                    {/* Category Header */}
                    <div className={cn('flex items-center gap-2 mb-2', isRtl && 'flex-row-reverse')}>
                      <div className={cn('w-2 h-2 rounded-full', dotClass)} />
                      <span className="text-xs font-semibold opacity-70">{categoryLabel}</span>
                      <span className="text-xs opacity-50">({keywords.length})</span>
                    </div>

                    {/* Keywords */}
                    <div
                      className={cn(
                        'flex flex-wrap gap-2',
                        isRtl && 'flex-row-reverse justify-end'
                      )}
                    >
                      {keywords.map((keyword) => (
                        <motion.div
                          key={keyword}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-slate-700/40 hover:bg-slate-700/60 transition-colors group cursor-default"
                        >
                          <span className="truncate max-w-[150px]">{keyword}</span>
                          <motion.button
                            whileHover={{ scale: 1.15 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => toggleKeyword(keyword, typedCategory)}
                            className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            title={labels.removeItem}
                          >
                            <X className="w-3 h-3 text-slate-400 hover:text-red-400" />
                          </motion.button>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

KeywordSelectionSummaryBar.displayName = 'KeywordSelectionSummaryBar';

export default KeywordSelectionSummaryBar;
