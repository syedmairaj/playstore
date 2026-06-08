/**
 * Minimal Keyword Loading Badge
 *
 * Compact loading indicator that shows loading state inline with the keyword count
 * Instead of showing a full skeleton, just shows a small spinner in the badge
 *
 * Features:
 * - Minimal (single line)
 * - Shows in keyword badge area
 * - Bilingual support (EN/AR)
 * - Zero layout shift
 * - Smooth fade transition
 *
 * Usage:
 * ```tsx
 * {isLoading ? (
 *   <KeywordLoadingBadge locale={locale} />
 * ) : (
 *   <span className="font-mono font-bold text-emerald-300">{count}</span>
 * )}
 * ```
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface KeywordLoadingBadgeProps {
  /** Current locale ('en' or 'ar') */
  locale: string;
}

/**
 * Minimal loading badge - appears inline where keyword count shows
 * Takes up same space as the number (no layout shift)
 */
export const KeywordLoadingBadge = React.forwardRef<
  HTMLSpanElement,
  KeywordLoadingBadgeProps
>(({ locale }, ref) => {
  const loadingText = locale === 'ar' ? 'جاري...' : 'Loading...';

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="inline-flex items-center gap-1.5 font-mono font-bold text-emerald-300"
    >
      {/* Spinner animation */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-3 h-3 rounded-full border-2 border-emerald-300/30 border-t-emerald-300"
      />
      <span className="text-xs">{loadingText}</span>
    </motion.span>
  );
});

KeywordLoadingBadge.displayName = 'KeywordLoadingBadge';

export default KeywordLoadingBadge;
