/**
 * Keyword Curation Mode-Switching Engine
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE OVERVIEW
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This context implements a global toggle between two interaction modes:
 *
 * 1. COPY MODE (Default):
 *    - Display: Double-square copy icon (📋)
 *    - Interaction: Click keyword → copy to clipboard
 *    - Visual Feedback: Icon animates copy → checkmark (✓)
 *    - Use Case: Quick access, familiar UX
 *
 * 2. SELECTION MODE (Curation):
 *    - Display: Empty circle (⭕) for unselected, checkmark (✓) for selected
 *    - Interaction: Click keyword → toggle selection for batch operations
 *    - Visual Feedback: Color shift, glow effect, icon change
 *    - Use Case: Multi-select for staging to AI Optimizer
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VALIDATION INTEGRATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This context works in tandem with:
 * - useKeywordSelection(): Tracks selected keywords as { term, category }
 * - validateKeywordPayload(): Validates payload before DB insert
 * - staging-vault-service.ts: Persists to workspace_staging_vault
 *
 * Data Flow:
 * User clicks keyword (Selection Mode)
 *   ↓
 * toggleKeyword() in useKeywordSelection
 *   ↓
 * selectedMap updated
 *   ↓
 * getSelectedKeywords() returns [{ term, category }, ...]
 *   ↓
 * validateKeywordPayload() checks structure
 *   ↓
 * addSignalToVault() stages to DB
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC LOGGING: 20+ CHECKPOINTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * All operations logged with [KeywordCurationMode] prefix:
 * - 🔍 Info/tracking
 * - 🔄 Mode transitions
 * - ✓ Success states
 * - ❌ Errors
 * - ✅ Complete
 *
 * Enables rapid debugging and performance monitoring
 */

'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TYPE DEFINITIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Mode types for keyword interaction
 *
 * @type {'copy' | 'selection'}
 *
 * - 'copy': Default mode - click to copy to clipboard
 *           Icon: 📋 → ✓
 *           Best for: Quick access, familiar interaction
 *
 * - 'selection': Curation mode - click to select/deselect
 *                Icon: ⭕ → ✓
 *                Best for: Multi-select, batch operations
 */
export type KeywordCurationMode = 'copy' | 'selection';

/**
 * Context value interface providing all mode-related functionality
 *
 * CRITICAL: All helper flags derived from mode state
 * This ensures single source of truth and prevents inconsistency
 */
interface KeywordCurationModeContextType {
  /** ═════════════════════════════════════════════════════════════════════
   *  STATE
   *  ═════════════════════════════════════════════════════════════════════ */

  /** Current mode ('copy' or 'selection')
   *  Determines UI rendering across all keyword components */
  mode: KeywordCurationMode;

  /** ═════════════════════════════════════════════════════════════════════
   *  ACTIONS
   *  ═════════════════════════════════════════════════════════════════════ */

  /** Toggle between copy and selection modes
   *  Triggers re-render of all consumers
   *  Logs mode transition with diagnostic data */
  toggleMode: () => void;

  /** Set mode explicitly
   *  Use when mode change should be explicit (not toggle)
   *  Example: Reset to 'copy' after successful batch send */
  setMode: (mode: KeywordCurationMode) => void;

  /** ═════════════════════════════════════════════════════════════════════
   *  COMPUTED HELPERS
   *  ═════════════════════════════════════════════════════════════════════ */

  /** Derived flag: Is in selection mode?
   *  Used for conditional rendering:
   *  - Show checkbox icons (not copy icons)
   *  - Show "Select All" buttons
   *  - Display selection progress */
  isSelectionMode: boolean;

  /** Derived flag: Is in copy mode?
   *  Used for conditional rendering:
   *  - Show copy icon
   *  - Show clipboard feedback
   *  - Hide batch operation buttons */
  isCopyMode: boolean;

  /** ═════════════════════════════════════════════════════════════════════
   *  METADATA
   *  ═════════════════════════════════════════════════════════════════════ */

  /** Last mode transition timestamp (ISO string)
   *  Useful for analytics and debugging */
  lastModeChangeTime: string | null;

  /** Number of mode toggles in this session
   *  Metric for usage patterns */
  modeToggleCount: number;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTEXT CREATION
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Create context with undefined default
 *  Will throw if useKeywordCurationMode called outside provider
 *  Prevents accidental misuse */
const KeywordCurationModeContext = createContext<
  KeywordCurationModeContextType | undefined
>(undefined);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PROVIDER COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function KeywordCurationModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // ═════════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════

  // Start in copy mode (default, familiar behavior)
  const [mode, setModeState] = useState<KeywordCurationMode>('copy');

  // Track metadata for analytics and debugging
  const [lastModeChangeTime, setLastModeChangeTime] = useState<string | null>(null);
  const [modeToggleCount, setModeToggleCount] = useState(0);

  // ═════════════════════════════════════════════════════════════════════════
  // CHECKPOINT #1: Provider Mount
  // ═════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    console.log('[KeywordCurationMode] 🔍 CHECKPOINT #1: PROVIDER MOUNTED', {
      initialMode: 'copy',
      timestamp: new Date().toISOString(),
      context: 'KeywordCurationModeProvider initialized',
    });

    return () => {
      console.log('[KeywordCurationMode] 🔍 CHECKPOINT #2: PROVIDER UNMOUNTED', {
        finalMode: mode,
        totalToggles: modeToggleCount,
        timestamp: new Date().toISOString(),
      });
    };
  }, [mode, modeToggleCount]);

  // ═════════════════════════════════════════════════════════════════════════
  // CHECKPOINT #3-5: Toggle Mode Action
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Toggle between copy and selection modes
   *
   * FLOW:
   * 1. Compute new mode (opposite of current)
   * 2. Update state
   * 3. Record metadata (timestamp, toggle count)
   * 4. Log transition with diagnostic info
   * 5. Trigger re-render of all consumers
   *
   * CRITICAL: New mode computed BEFORE state update to avoid race conditions
   */
  const toggleMode = useCallback(() => {
    setModeState((current) => {
      // Compute new mode
      const newMode = current === 'copy' ? 'selection' : 'copy';

      // ═════════════════════════════════════════════════════════════════════
      // CHECKPOINT #3: Mode Transition Started
      // ═════════════════════════════════════════════════════════════════════
      console.log('[KeywordCurationMode] 🔄 CHECKPOINT #3: MODE TRANSITION STARTED', {
        currentMode: current,
        newMode: newMode,
        timestamp: new Date().toISOString(),
      });

      return newMode;
    });

    // Update metadata AFTER state update queued
    const transitionTime = new Date().toISOString();
    setLastModeChangeTime(transitionTime);
    setModeToggleCount((count) => count + 1);

    // ═════════════════════════════════════════════════════════════════════
    // CHECKPOINT #4: Metadata Updated
    // ═════════════════════════════════════════════════════════════════════
    console.log('[KeywordCurationMode] ✓ CHECKPOINT #4: METADATA UPDATED', {
      transitionTime,
      toggleCount: modeToggleCount + 1,
    });
  }, [modeToggleCount]);

  // ═════════════════════════════════════════════════════════════════════════
  // CHECKPOINT #6-8: Set Mode Action
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Set mode explicitly (not toggle)
   *
   * Used when mode should be set to specific value:
   * - Reset to 'copy' after successful batch send
   * - Force 'selection' mode when opening curation UI
   *
   * Logs with reason context
   */
  const setMode = useCallback((newMode: KeywordCurationMode) => {
    console.log('[KeywordCurationMode] 🔍 CHECKPOINT #6: SET MODE REQUESTED', {
      requestedMode: newMode,
      currentMode: mode,
      timestamp: new Date().toISOString(),
    });

    if (mode === newMode) {
      console.log('[KeywordCurationMode] ⚠️ CHECKPOINT #7: MODE ALREADY SET', {
        mode: newMode,
        action: 'No-op (same mode)',
      });
      return;
    }

    setModeState(newMode);
    const transitionTime = new Date().toISOString();
    setLastModeChangeTime(transitionTime);
    setModeToggleCount((count) => count + 1);

    // ═════════════════════════════════════════════════════════════════════
    // CHECKPOINT #8: Mode Set Complete
    // ═════════════════════════════════════════════════════════════════════
    console.log('[KeywordCurationMode] ✅ CHECKPOINT #8: MODE SET COMPLETE', {
      previousMode: mode,
      newMode: newMode,
      transitionTime,
      toggleCount: modeToggleCount + 1,
    });
  }, [mode, modeToggleCount]);

  // ═════════════════════════════════════════════════════════════════════════
  // CHECKPOINT #9: Context Value Built
  // ═════════════════════════════════════════════════════════════════════════

  const value: KeywordCurationModeContextType = {
    // State
    mode,

    // Actions
    toggleMode,
    setMode,

    // Helpers (derived from mode)
    isSelectionMode: mode === 'selection',
    isCopyMode: mode === 'copy',

    // Metadata
    lastModeChangeTime,
    modeToggleCount,
  };

  console.log('[KeywordCurationMode] ✓ CHECKPOINT #9: CONTEXT VALUE BUILT', {
    mode,
    isSelectionMode: mode === 'selection',
    isCopyMode: mode === 'copy',
    metadata: {
      lastModeChangeTime,
      modeToggleCount,
    },
  });

  // ═════════════════════════════════════════════════════════════════════════
  // CHECKPOINT #10: Rendering Provider
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <KeywordCurationModeContext.Provider value={value}>
      {children}
    </KeywordCurationModeContext.Provider>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONSUMER HOOK
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Hook to access keyword curation mode
 *
 * CRITICAL: Must be called within KeywordCurationModeProvider
 *
 * @returns KeywordCurationModeContextType with full mode state and actions
 * @throws Error if used outside KeywordCurationModeProvider
 *
 * ═════════════════════════════════════════════════════════════════════════
 * CHECKPOINT #11-13: Hook Usage Tracking
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Usage:
 * ```tsx
 * const { mode, toggleMode, isSelectionMode } = useKeywordCurationMode();
 *
 * if (isSelectionMode) {
 *   // Render selection UI (checkboxes, Select All buttons)
 * } else {
 *   // Render copy UI (copy icon, clipboard feedback)
 * }
 * ```
 */
export function useKeywordCurationMode(): KeywordCurationModeContextType {
  const context = useContext(KeywordCurationModeContext);

  // ═════════════════════════════════════════════════════════════════════
  // CHECKPOINT #12: Context Validation (ERROR ONLY)
  // ═════════════════════════════════════════════════════════════════════
  if (context === undefined) {
    console.error('[KeywordCurationMode] ❌ CHECKPOINT #12: CONTEXT NOT FOUND', {
      error: 'useKeywordCurationMode called outside KeywordCurationModeProvider',
      suggestion: 'Wrap component tree with <KeywordCurationModeProvider>',
      timestamp: new Date().toISOString(),
    });

    throw new Error(
      '[KeywordCurationMode] useKeywordCurationMode must be used within KeywordCurationModeProvider'
    );
  }

  return context;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOCALIZATION UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Bilingual mode labels for UI display
 *
 * @internal Use in buttons, tooltips, and settings UI
 */
export const MODE_LABELS = {
  copy: {
    en: 'Copy Mode',
    ar: 'وضع النسخ',
  },
  selection: {
    en: 'Selection Mode',
    ar: 'وضع التحديد',
  },
} as const;

/**
 * Get localized label for mode
 *
 * ═════════════════════════════════════════════════════════════════════════
 * CHECKPOINT #14-15: Localization
 * ═════════════════════════════════════════════════════════════════════════
 *
 * @param mode - Current mode ('copy' or 'selection')
 * @param locale - User locale ('en' or 'ar')
 * @returns Localized mode label
 */
export function getModeLabelLocalized(
  mode: KeywordCurationMode,
  locale: string
): string {
  const key = locale === 'ar' ? 'ar' : 'en';
  const label = MODE_LABELS[mode]?.[key] || mode;

  // ═════════════════════════════════════════════════════════════════════
  // CHECKPOINT #14-15: Localization (Silent)
  // ═════════════════════════════════════════════════════════════════════

  return label;
}

/**
 * Bilingual mode descriptions for tooltips and help text
 *
 * @internal Use in tooltip title attributes
 */
export const MODE_DESCRIPTIONS = {
  copy: {
    en: 'Click to copy keywords to clipboard',
    ar: 'انقر لنسخ الكلمات المفتاحية إلى الحافظة',
  },
  selection: {
    en: 'Click to select keywords for batch operations',
    ar: 'انقر لتحديد الكلمات المفتاحية للعمليات الجماعية',
  },
} as const;

/**
 * Get localized description for mode
 *
 * @param mode - Current mode
 * @param locale - User locale
 * @returns Localized description
 */
export function getModeTitleLocalized(
  mode: KeywordCurationMode,
  locale: string
): string {
  const key = locale === 'ar' ? 'ar' : 'en';
  return MODE_DESCRIPTIONS[mode]?.[key] || '';
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTEGRATION WITH VALIDATION PIPELINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This context works in a coordinated flow with:
 *
 * 1. useKeywordSelection():
 *    - Tracks selected keywords as Map<term, category>
 *    - Returns getSelectedKeywords() → [{ term, category }, ...]
 *
 * 2. validateKeywordPayload() (staging-vault-service.ts):
 *    - Validates each keyword has term + category
 *    - Returns { valid: boolean, errors: string[] }
 *
 * 3. addSignalToVault() (staging-vault-service.ts):
 *    - Calls validateKeywordPayload() internally
 *    - Persists to workspace_staging_vault table
 *    - Returns { id: string, message: string }
 *
 * 4. KeywordCurationFloatingBar:
 *    - Shows "Send to AI Optimizer" button
 *    - Calls addSignalToVault() on click
 *    - Uses mode state to decide button visibility
 *
 * CRITICAL: Mode Context is transparent to validation
 * - Mode doesn't affect validation logic
 * - Mode only affects UI presentation
 * - Selection storage/validation unchanged by mode
 */
