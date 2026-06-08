/**
 * Cached Staging Service - SWR Integration
 *
 * Integrates IndexedDB caching with staging-vault-service.
 * Implements smart cache checking before making API calls.
 *
 * Features:
 * - 24-hour cache with SWR pattern
 * - Bilingual support (EN/AR)
 * - Minimal API calls through cache checking
 * - Workspace and user isolation
 * - Graceful degradation on failures
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getIndexedDBManager, SWRResponse } from './indexed-db-manager';
import {
  addSignalToVault,
  SignalType,
  SignalSource,
  KeywordPayload,
  VaultSignal,
} from '@/lib/staging-vault/staging-vault-service';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CACHED STAGING SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 */

export class CachedStagingService {
  private dbManager = getIndexedDBManager();
  private supabase: SupabaseClient;
  private cacheCheckInterval = 60 * 60 * 1000; // 1 hour

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Add Signal with SWR Caching
   *
   * 1. Check if similar signal exists in cache
   * 2. If cache is fresh, return cached signal
   * 3. If cache is stale or missing, add to vault + cache result
   * 4. If vault fails, return stale cache
   */
  async addSignalWithCache(
    workspaceId: string,
    userId: string,
    signal: {
      signalType: SignalType;
      content: string;
      source?: SignalSource;
      sourceAppId?: string;
      sourceContext?: string;
      sourceContextId?: string;
      language?: 'en' | 'ar';
      metadata?: Record<string, unknown>;
      keywords?: KeywordPayload[];
      expiresAt?: string;
    }
  ): Promise<{
    id: string;
    message: string;
    source: 'vault' | 'cache';
    isFresh: boolean;
    isStale: boolean;
  }> {
    const language = signal.language || 'en';
    const cacheKey = this.getCacheKey(signal.signalType, signal.sourceContextId);

    try {
      console.log('[CachedStagingService] 🔍 Checking cache before vault operation:', {
        signalType: signal.signalType,
        sourceContextId: signal.sourceContextId,
        language,
        cacheKey,
      });

      // Step 1: Check cache
      const cachedResponse = await this.dbManager.get(cacheKey, language, workspaceId, userId);

      if (cachedResponse.data && cachedResponse.isFresh) {
        console.log('[CachedStagingService] ✅ Cache hit (fresh) - returning cached signal:', {
          cacheKey,
          age: `${(cachedResponse.age / 1000 / 60).toFixed(1)}m`,
        });

        return {
          id: (cachedResponse.data as any)?.id || cacheKey,
          message: 'Signal already staged (from cache)',
          source: 'cache',
          isFresh: true,
          isStale: false,
        };
      }

      // Step 2: Add to vault (bypass cache for now, go straight to DB)
      console.log('[CachedStagingService] 📤 Adding signal to vault:', {
        signalType: signal.signalType,
        language,
      });

      const vaultResult = await addSignalToVault(this.supabase, workspaceId, signal);

      // Step 3: Cache the result
      console.log('[CachedStagingService] 💾 Caching vault result:', {
        cacheKey,
        signalId: vaultResult.id,
      });

      const cachedData = {
        id: vaultResult.id,
        signalType: signal.signalType,
        content: signal.content,
        language,
        metadata: signal.metadata,
        sourceContextId: signal.sourceContextId,
        timestamp: Date.now(),
      };

      await this.dbManager.set(cachedData, language, workspaceId, userId);

      console.log('[CachedStagingService] ✅ Signal added and cached:', {
        id: vaultResult.id,
        source: 'vault',
      });

      return {
        ...vaultResult,
        source: 'vault',
        isFresh: true,
        isStale: false,
      };
    } catch (error) {
      console.error('[CachedStagingService] ❌ Error adding signal:', error);

      // Step 4: If vault fails, check if we have stale cache to fall back to
      if (cachedResponse.data && cachedResponse.isStale) {
        console.warn('[CachedStagingService] ⚠️ Vault failed - using stale cache:', {
          cacheKey,
          age: `${(cachedResponse.age / 1000 / 60).toFixed(1)}m`,
        });

        return {
          id: (cachedResponse.data as any)?.id || cacheKey,
          message: 'Signal staged (offline mode - using stale cache)',
          source: 'cache',
          isFresh: false,
          isStale: true,
        };
      }

      throw error;
    }
  }

  /**
   * Get Cached Signals with SWR Pattern
   */
  async getCachedSignals(
    workspaceId: string,
    userId: string,
    language: 'en' | 'ar' = 'en'
  ): Promise<SWRResponse<VaultSignal[]>> {
    const cacheKey = `all-signals-${language}`;

    try {
      console.log('[CachedStagingService] 📋 Getting cached signals:', {
        cacheKey,
        language,
      });

      // Get from cache first
      const cachedResponse = await this.dbManager.get<VaultSignal[]>(
        cacheKey,
        language,
        workspaceId,
        userId
      );

      // Return cached data immediately (instant render)
      if (cachedResponse.data) {
        console.log('[CachedStagingService] ✅ Returning cached signals:', {
          count: cachedResponse.data.length,
          isFresh: cachedResponse.isFresh,
          isStale: cachedResponse.isStale,
        });

        return cachedResponse;
      }

      // No cache - return empty with should revalidate flag
      console.log('[CachedStagingService] 🔄 No cache - should revalidate');

      return {
        data: null,
        source: 'cache',
        isFresh: false,
        isStale: false,
        age: 0,
        expiresAt: 0,
        lastUpdated: 'Never',
        shouldRevalidate: true,
        message: 'No cached signals',
      };
    } catch (error) {
      console.error('[CachedStagingService] ❌ Error getting cached signals:', error);
      throw error;
    }
  }

  /**
   * Invalidate Specific Cache Entry
   */
  async invalidateCache(
    signal: { signalType: SignalType; sourceContextId?: string },
    language: 'en' | 'ar',
    workspaceId: string,
    userId: string
  ): Promise<boolean> {
    const cacheKey = this.getCacheKey(signal.signalType, signal.sourceContextId);

    console.log('[CachedStagingService] 🗑️ Invalidating cache:', {
      cacheKey,
      language,
    });

    return this.dbManager.delete(cacheKey, language, workspaceId, userId);
  }

  /**
   * Clear All Workspace Cache
   */
  async clearWorkspaceCache(workspaceId: string): Promise<void> {
    console.log('[CachedStagingService] 🗑️ Clearing all workspace cache:', {
      workspaceId,
    });

    const metadata = await this.dbManager.getAllByWorkspace(workspaceId);

    for (const entry of metadata) {
      await this.dbManager.delete(entry.key, entry.language, workspaceId, entry.userId);
    }

    console.log('[CachedStagingService] ✅ Workspace cache cleared:', {
      workspaceId,
      entriesDeleted: metadata.length,
    });
  }

  /**
   * Get Cache Statistics
   */
  async getCacheStats(): Promise<{
    totalEntries: number;
    freshEntries: number;
    staleEntries: number;
    expiredEntries: number;
    storageSize: string;
  }> {
    console.log('[CachedStagingService] 📊 Getting cache stats');
    return this.dbManager.getStats();
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * PRIVATE HELPERS
   * ═══════════════════════════════════════════════════════════════════════
   */

  private getCacheKey(signalType: SignalType, sourceContextId?: string): string {
    if (sourceContextId) {
      return `signal:${signalType}:${sourceContextId}`;
    }
    return `signal:${signalType}`;
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FACTORY FUNCTION
 * ═══════════════════════════════════════════════════════════════════════════
 */

let cachedServiceInstance: CachedStagingService | null = null;

export function getCachedStagingService(supabase: SupabaseClient): CachedStagingService {
  if (!cachedServiceInstance) {
    cachedServiceInstance = new CachedStagingService(supabase);
  }
  return cachedServiceInstance;
}

export default CachedStagingService;
