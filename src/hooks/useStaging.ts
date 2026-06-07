/**
 * useStaging Hook
 *
 * Centralized React hook for all staging operations.
 * Handles:
 * - Language detection via useLocale()
 * - RTL computation
 * - Payload validation
 * - API calls to workspace_staging_vault
 * - State management (idle/loading/staged)
 * - Toast notifications (EN/AR)
 * - Error handling and recovery
 *
 * Usage:
 * const { stage, loading, staged, language, isRtl } = useStaging();
 * await stage(payload);
 *
 * Pro-tip: This hook is the ONLY place that needs to change when:
 * - API endpoint changes
 * - Database schema evolves
 * - Toast library changes
 * - Language logic updates
 *
 * All feature modules use this hook consistently!
 */

'use client';

import { useState, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { useToast } from '@/hooks/useToast';
import {
  UnifiedStagingPayload,
  LanguageCode,
  UseStagingReturn,
  validateStagingPayload,
  transformToVaultRecord,
  isRtlLanguage,
  StagingVaultRecord,
} from '@/types/staging-contract';

/**
 * Bilingual toast messages
 */
const MESSAGES = {
  en: {
    stagingToast: 'Adding to queue...',
    successToast: 'Added to queue',
    errorToast: 'Failed to add to queue',
    validationError: 'Invalid signal data',
  },
  ar: {
    stagingToast: 'جاري الإضافة...',
    successToast: 'تمت الإضافة بنجاح',
    errorToast: 'فشل في الإضافة',
    validationError: 'بيانات الإشارة غير صحيحة',
  },
};

/**
 * Main Hook Implementation
 */
export function useStaging(): UseStagingReturn {
  // State
  const [loading, setLoading] = useState(false);
  const [staged, setStaged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Context
  const locale = useLocale() as LanguageCode;
  const { showToast } = useToast();

  // Derive language and RTL
  const language = locale || 'en';
  const isRtl = isRtlLanguage(language);

  // Get localized messages
  const msgs = MESSAGES[language] || MESSAGES.en;

  /**
   * Stage a signal to the workspace_staging_vault
   * @param payload Unified staging payload
   * @throws Error if validation fails or API call fails
   */
  const stage = useCallback(
    async (payload: UnifiedStagingPayload) => {
      // Validation
      const validation = validateStagingPayload(payload);
      if (!validation.valid) {
        const errorMsg = validation.errors.join('; ');
        setError(errorMsg);
        showToast({
          type: 'error',
          title: msgs.validationError,
          message: errorMsg,
          duration: 4000,
        });
        return;
      }

      // Guard against re-staging
      if (loading || staged) {
        console.warn('[useStaging] Cannot stage: already loading or staged');
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Ensure language is set
        const finalPayload = {
          ...payload,
          lang: payload.lang || language,
          is_rtl: isRtlLanguage(payload.lang || language),
        };

        // Log pre-flight verification
        console.log(
          `[useStaging] [${finalPayload.source.toUpperCase()}] PAYLOAD VERIFICATION (Before DB Write)`
        );
        console.log(`  workspace_id: ${finalPayload.workspaceId}`);
        console.log(`  signal_type: ${finalPayload.intent}`);
        console.log(`  source: ${finalPayload.source}`);
        console.log(`  category: ${finalPayload.category}`);
        console.log(`  language: ${finalPayload.lang}`);
        console.log(`  content_array length: ${finalPayload.content_array.length}`);
        console.log(`  ✓ is_rtl: ${finalPayload.is_rtl}`);

        // Prepare request payload
        const requestPayload = transformToVaultRecord(
          finalPayload,
          finalPayload.workspaceId || ''
        );

        // Call API endpoint
        const response = await fetch('/api/workspaces/staging/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...requestPayload,
            metadata: {
              ...requestPayload.metadata,
              title: finalPayload.title,
              description: finalPayload.description,
            },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error || `API error: ${response.status}`;
          throw new Error(errorMessage);
        }

        const data = (await response.json()) as Partial<StagingVaultRecord>;

        // Log success
        console.log(`[useStaging] [${finalPayload.source.toUpperCase()}] SUCCESS - Signal Stored in Vault`);
        console.log(`  signal_id: ${data.id}`);
        console.log(`  created_at: ${data.created_at}`);
        console.log(`  ✓ Content array stored: ${finalPayload.content_array.length} items`);

        // Update UI state
        setStaged(true);

        // Show success toast
        showToast({
          type: 'success',
          title: msgs.successToast,
          message: `${finalPayload.category} added to drafting queue`,
          duration: 3000,
        });

        // Reset after delay
        setTimeout(() => {
          setStaged(false);
        }, 2000);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[useStaging] ERROR: ${errorMessage}`);
        setError(errorMessage);

        showToast({
          type: 'error',
          title: msgs.errorToast,
          message: errorMessage,
          duration: 4000,
        });

        // Reset after delay
        setTimeout(() => {
          setError(null);
        }, 2000);
      } finally {
        setLoading(false);
      }
    },
    [language, msgs, showToast, loading, staged]
  );

  /**
   * Reset all states
   * Useful for retry or clearing errors
   */
  const reset = useCallback(() => {
    setLoading(false);
    setStaged(false);
    setError(null);
  }, []);

  return {
    stage,
    loading,
    staged,
    error,
    reset,
    language,
    isRtl,
  };
}

/**
 * Advanced: useStaging with custom workspace ID
 * Use when workspace context isn't available via props
 */
export function useStagingWithWorkspace(workspaceId: string): UseStagingReturn & {
  stageWithWorkspace: (payload: Omit<UnifiedStagingPayload, 'workspaceId'>) => Promise<void>;
} {
  const base = useStaging();

  const stageWithWorkspace = useCallback(
    async (payload: Omit<UnifiedStagingPayload, 'workspaceId'>) => {
      return base.stage({
        ...payload,
        workspaceId,
      });
    },
    [base, workspaceId]
  );

  return {
    ...base,
    stageWithWorkspace,
  };
}

/**
 * Batch staging: Stage multiple signals at once
 * Returns array of results (id, error) for each
 */
export function useStagingBatch() {
  const { stage, language, isRtl } = useStaging();

  const stageBatch = useCallback(
    async (payloads: UnifiedStagingPayload[]) => {
      const results = await Promise.allSettled(
        payloads.map((p) =>
          stage({
            ...p,
            lang: p.lang || language,
            is_rtl: isRtlLanguage(p.lang || language),
          })
        )
      );

      return results.map((result, idx) => ({
        payload: payloads[idx],
        status: result.status,
        error: result.status === 'rejected' ? (result.reason as Error).message : null,
      }));
    },
    [stage, language]
  );

  return { stageBatch, language, isRtl };
}
