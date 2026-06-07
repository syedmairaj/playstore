/**
 * UNIFIED STAGING BUTTON COMPONENT
 *
 * Single, reusable button for ALL staging operations.
 * Replaces feature-specific staging buttons (KeywordTrackerStagingButton,
 * AlertsStagingButton, ReviewStagingButton, etc.)
 *
 * Features:
 * - Uses useStaging hook for centralized logic
 * - Accepts UnifiedStagingPayload
 * - Full EN/AR/RTL support
 * - State machine: idle → loading → staged → idle
 * - Bilingual toast notifications
 * - Graceful error handling
 * - Customizable appearance
 *
 * Usage:
 * const payload = buildStagingPayload(...);
 * <StagingButton
 *   payload={payload}
 *   onStaged={() => console.log('Added to queue')}
 *   variant="primary"
 *   label="Add to Analysis"
 * />
 */

'use client';

import React, { useEffect } from 'react';
import { Check, Loader2, Archive, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStaging } from '@/hooks/useStaging';
import {
  UnifiedStagingPayload,
  StagingButtonProps,
} from '@/types/staging-contract';

/**
 * Main StagingButton Component
 */
export function StagingButton(props: StagingButtonProps) {
  const {
    payload,
    onStaged,
    variant = 'primary',
    size = 'md',
    label,
    className,
    disabled = false,
    showIcon = true,
    iconLoading: CustomIconLoading,
    iconSuccess: CustomIconSuccess,
  } = props;

  const { stage, loading, staged, error, isRtl } = useStaging();

  // Auto-reset after successful staging
  useEffect(() => {
    if (staged && onStaged) {
      onStaged();
    }
  }, [staged, onStaged]);

  /**
   * Handle button click
   */
  const handleClick = async () => {
    if (loading || staged || disabled) return;

    try {
      await stage(payload);
    } catch (err) {
      console.error('[StagingButton] Staging failed:', err);
      // Error is already handled by useStaging hook (toast notification)
    }
  };

  /**
   * Determine button text based on state
   */
  const getButtonText = (): string => {
    if (loading) {
      return isRtl ? 'جاري الإضافة...' : 'Adding...';
    }
    if (staged) {
      return isRtl ? 'تمت الإضافة' : 'Added';
    }
    return label || (isRtl ? 'إضافة إلى الخزنة' : 'Add to Queue');
  };

  /**
   * Determine button icon based on state
   */
  const getIcon = () => {
    if (loading) {
      return CustomIconLoading ? (
        <>{CustomIconLoading}</>
      ) : (
        <Loader2 className="h-4 w-4 animate-spin" />
      );
    }
    if (staged) {
      return CustomIconSuccess ? (
        <>{CustomIconSuccess}</>
      ) : (
        <Check className="h-4 w-4" />
      );
    }
    return variant === 'primary' ? (
      <Zap className="h-4 w-4" />
    ) : (
      <Archive className="h-4 w-4" />
    );
  };

  /**
   * Variant styles
   */
  const variantStyles = {
    primary:
      'bg-blue-600 hover:bg-blue-700 text-white border-0 disabled:bg-blue-500',
    secondary:
      'bg-gray-200 hover:bg-gray-300 text-gray-900 border-0 disabled:bg-gray-100',
    ghost:
      'bg-transparent hover:bg-gray-100 text-gray-700 border border-gray-300 disabled:text-gray-400',
    outline:
      'bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 disabled:bg-gray-50',
  };

  /**
   * Size styles
   */
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2 text-base gap-2',
    lg: 'px-5 py-2.5 text-lg gap-2.5',
  };

  /**
   * Base styles
   */
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded transition-all ' +
    'disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2';

  const isDisabled = disabled || loading || staged;

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        isRtl && 'flex-row-reverse',
        className
      )}
      aria-busy={loading}
      aria-label={`${getButtonText()}: ${payload.title || payload.category}`}
    >
      {showIcon && getIcon()}
      <span>{getButtonText()}</span>
    </button>
  );
}

/**
 * Compact variant (icon only)
 * Useful for condensed UI where space is limited
 */
export function StagingButtonCompact(props: Omit<StagingButtonProps, 'label'>) {
  return (
    <StagingButton
      {...props}
      label=""
      showIcon={true}
      size="sm"
      className={cn('w-8 h-8 p-0', props.className)}
    />
  );
}

/**
 * Text-only variant
 * For inline or minimal styling
 */
export function StagingButtonText(props: Omit<StagingButtonProps, 'variant'>) {
  return (
    <StagingButton
      {...props}
      variant="ghost"
      showIcon={false}
    />
  );
}

/**
 * Loading skeleton for while useStaging is initializing
 * Use this while waiting for payload to be constructed
 */
export function StagingButtonSkeleton(props: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClass = {
    sm: 'w-20 h-7',
    md: 'w-24 h-9',
    lg: 'w-28 h-10',
  }[props.size || 'md'];

  return (
    <div
      className={cn(
        sizeClass,
        'bg-gray-200 rounded animate-pulse',
        props.className
      )}
    />
  );
}

/**
 * Wrapper: Async payload construction
 * Use when payload requires async data
 *
 * Example:
 * <StagingButtonAsync
 *   getPayload={async () => {
 *     const keywords = await fetchKeywords();
 *     return buildStagingPayload(...);
 *   }}
 * />
 */
export function StagingButtonAsync(
  props: Omit<StagingButtonProps, 'payload'> & {
    getPayload: () => Promise<UnifiedStagingPayload>;
  }
) {
  const [payload, setPayload] = React.useState<UnifiedStagingPayload | null>(
    null
  );
  const [loadingPayload, setLoadingPayload] = React.useState(false);

  const handleClick = async () => {
    if (loadingPayload || !payload) {
      setLoadingPayload(true);
      try {
        const p = await props.getPayload();
        setPayload(p);
      } catch (err) {
        console.error('[StagingButtonAsync] Failed to load payload:', err);
      } finally {
        setLoadingPayload(false);
      }
    }
  };

  if (!payload) {
    return (
      <button
        onClick={handleClick}
        disabled={loadingPayload}
        className={cn(
          'inline-flex items-center gap-2 px-4 py-2 rounded bg-blue-600 hover:bg-blue-700',
          'text-white font-medium transition-all disabled:opacity-70',
          props.className
        )}
      >
        {loadingPayload && <Loader2 className="h-4 w-4 animate-spin" />}
        <span>{props.label || 'Prepare'}</span>
      </button>
    );
  }

  return (
    <StagingButton
      {...props}
      payload={payload}
    />
  );
}

/**
 * Export type for consuming components
 */
export type { StagingButtonProps, UnifiedStagingPayload };
