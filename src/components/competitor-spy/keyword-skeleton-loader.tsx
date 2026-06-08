/**
 * Keyword Skeleton Loader Component
 *
 * Professional loading UX that prevents layout shift while fetching keywords
 *
 * Features:
 * - Fixed height to prevent 0 → 20 jump
 * - Shimmer animation for visual feedback
 * - Bilingual support (EN/AR)
 * - RTL/LTR layout support
 * - Smooth fade-in/out transitions
 *
 * Usage:
 * ```tsx
 * {isLoading ? (
 *   <KeywordSkeletonLoader
 *     locale={locale}
 *     isRtl={isRtl}
 *     categoryCount={3}  // HIGH-VOLUME, INTENT-BASED, COMPETITOR-GAP
 *   />
 * ) : (
 *   <KeywordContent />
 * )}
 * ```
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface KeywordSkeletonLoaderProps {
  /** Current locale ('en' or 'ar') */
  locale: string;

  /** RTL layout flag */
  isRtl?: boolean;

  /** Number of category sections to render */
  categoryCount?: number;
}

/**
 * Individual skeleton pill (shimmer effect)
 */
function SkeletonPill() {
  return (
    <motion.div
      className="h-10 rounded-lg bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 overflow-hidden"
      animate={{
        backgroundPosition: ['200% 0', '-200% 0'],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'linear',
      }}
      style={{
        backgroundSize: '200% 100%',
      }}
    />
  );
}

/**
 * Skeleton for category header
 */
function SkeletonCategoryHeader() {
  return (
    <motion.div
      className="h-5 w-32 rounded bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 overflow-hidden"
      animate={{
        backgroundPosition: ['200% 0', '-200% 0'],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'linear',
      }}
      style={{
        backgroundSize: '200% 100%',
      }}
    />
  );
}

/**
 * Keyword Skeleton Loader Component
 *
 * Creates a placeholder layout that matches the final keyword surface
 * Prevents layout shift and provides visual feedback during loading
 */
export const KeywordSkeletonLoader = React.forwardRef<
  HTMLDivElement,
  KeywordSkeletonLoaderProps
>(({ locale, isRtl = false, categoryCount = 3 }, ref) => {
  const loadingText = locale === 'ar' ? 'جاري جلب الكلمات المفتاحية...' : 'Fetching keywords...';

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full space-y-0"
    >
      {/* Header with loading status */}
      <div
        className={cn(
          'flex items-center justify-between gap-3 px-3 py-2 rounded-lg',
          'bg-gradient-to-r from-slate-700/20 to-slate-600/20 border border-slate-700/20',
          isRtl && 'flex-row-reverse'
        )}
      >
        <div className={cn('flex items-center gap-1.5', isRtl && 'flex-row-reverse')}>
          <motion.div
            className="w-6 h-6 rounded-lg bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 overflow-hidden"
            animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            style={{ backgroundSize: '200% 100%' }}
          />
          <motion.div
            className="h-4 w-24 rounded bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 overflow-hidden"
            animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            style={{ backgroundSize: '200% 100%' }}
          />
        </div>

        {/* Mode toggle skeleton */}
        <motion.div
          className="w-8 h-8 rounded-lg bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 overflow-hidden"
          animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          style={{ backgroundSize: '200% 100%' }}
        />
      </div>

      {/* Expanded content skeleton */}
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="overflow-hidden"
      >
        <div className="pt-4 space-y-6 border-t border-slate-700/20 mt-2">
          {/* Render category skeletons */}
          {Array.from({ length: categoryCount }).map((_, categoryIdx) => (
            <div key={categoryIdx} className="space-y-3">
              {/* Category header skeleton */}
              <div className={cn('flex items-center gap-2', isRtl && 'flex-row-reverse')}>
                <SkeletonCategoryHeader />
                <motion.div
                  className="h-4 w-8 rounded bg-slate-700/30"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              </div>

              {/* Keywords grid skeleton (2 columns) */}
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, pillIdx) => (
                  <SkeletonPill key={`${categoryIdx}-${pillIdx}`} />
                ))}
              </div>
            </div>
          ))}

          {/* Loading status message */}
          <motion.div
            className={cn(
              'pt-4 text-center',
              'text-sm text-slate-500'
            )}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {loadingText}
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
});

KeywordSkeletonLoader.displayName = 'KeywordSkeletonLoader';

export default KeywordSkeletonLoader;
