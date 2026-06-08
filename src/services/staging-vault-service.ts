/**
 * Staging Vault Service - Unified Cache Synchronization
 *
 * Central service for syncing data across all platform features to IndexedDB.
 * Provides a single interface for all services to update local cache.
 *
 * Features:
 * - Unified sync API across all stores
 * - Batch operations for bulk data
 * - Error handling and retry logic
 * - Bilingual logging (EN/AR)
 * - Performance monitoring
 * - Service-oriented architecture
 *
 * Usage:
 * ```typescript
 * const vaultService = getStagingVaultService();
 *
 * // Sync keyword data
 * await vaultService.sync('keyword_data', keywordId, keywordData);
 *
 * // Batch sync reviews
 * await vaultService.batchSync('review_logs', reviewArray);
 *
 * // Get cached data
 * const data = await vaultService.retrieve('keyword_data', keywordId);
 * ```
 */

import {
  getDBManager,
  CentralizedDBManager,
  KeywordData,
  ReviewLog,
  RankSnapshot,
  KeywordTrackerData,
  CompetitorData,
  PlatformDB,
} from '@/lib/db/db';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TYPE DEFINITIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface SyncOptions {
  language?: 'en' | 'ar';
  batchSize?: number;
  retries?: number;
  retryDelay?: number;
  enableLogging?: boolean;
}

export interface SyncResult {
  success: boolean;
  storeName: string;
  itemsProcessed: number;
  duration: number;
  error?: string;
  language: 'en' | 'ar';
}

export type StoreName = keyof PlatformDB;
export type StoreData = KeywordData | ReviewLog | RankSnapshot | KeywordTrackerData | CompetitorData;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STAGING VAULT SERVICE - Unified Sync Interface
 * ═══════════════════════════════════════════════════════════════════════════
 */

export class StagingVaultService {
  private db: CentralizedDBManager | null = null;
  private readonly DEFAULT_BATCH_SIZE = 100;
  private readonly DEFAULT_RETRIES = 3;
  private readonly DEFAULT_RETRY_DELAY = 1000; // 1 second

  constructor() {
    console.log('[StagingVault] 🚀 Initializing Staging Vault Service');
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * INITIALIZATION: Ensure DB is ready
   * ═══════════════════════════════════════════════════════════════════════
   */

  private async ensureDB(): Promise<CentralizedDBManager> {
    if (!this.db) {
      this.db = await getDBManager();
    }
    return this.db;
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * SYNC: Single item to cache
   * ═══════════════════════════════════════════════════════════════════════
   */

  async sync<T extends { id: string }>(
    storeName: StoreName,
    data: T,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const {
      language = 'en',
      retries = this.DEFAULT_RETRIES,
      retryDelay = this.DEFAULT_RETRY_DELAY,
      enableLogging = true,
    } = options;

    const startTime = performance.now();

    try {
      const db = await this.ensureDB();

      console.log(`[StagingVault] 📤 SYNC ${storeName}:`, {
        id: data.id,
        language,
        retries,
      });

      // Attempt to sync with retry logic
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          await db.set(storeName, data, language);

          const duration = performance.now() - startTime;

          if (enableLogging) {
            console.log(`[StagingVault] ✅ SYNC success:`, {
              storeName,
              id: data.id,
              duration: `${duration.toFixed(2)}ms`,
              attempt,
              language,
            });
          }

          return {
            success: true,
            storeName: storeName as string,
            itemsProcessed: 1,
            duration,
            language,
          };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));

          if (attempt < retries) {
            console.warn(`[StagingVault] ⚠️ SYNC attempt ${attempt} failed, retrying...`, {
              storeName,
              error: lastError.message,
            });

            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
          }
        }
      }

      // All retries failed
      const duration = performance.now() - startTime;
      console.error(`[StagingVault] ❌ SYNC failed after ${retries} retries:`, lastError);

      return {
        success: false,
        storeName: storeName as string,
        itemsProcessed: 0,
        duration,
        error: lastError?.message || 'Unknown error',
        language,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      console.error('[StagingVault] ❌ SYNC fatal error:', err);

      return {
        success: false,
        storeName: storeName as string,
        itemsProcessed: 0,
        duration,
        error: err.message,
        language,
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * BATCH SYNC: Multiple items to cache
   * ═══════════════════════════════════════════════════════════════════════
   */

  async batchSync<T extends { id: string }>(
    storeName: StoreName,
    items: T[],
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const {
      language = 'en',
      batchSize = this.DEFAULT_BATCH_SIZE,
      retries = this.DEFAULT_RETRIES,
      retryDelay = this.DEFAULT_RETRY_DELAY,
      enableLogging = true,
    } = options;

    const startTime = performance.now();

    if (!items || items.length === 0) {
      console.warn('[StagingVault] ⚠️ BATCH SYNC received empty array');
      return {
        success: true,
        storeName: storeName as string,
        itemsProcessed: 0,
        duration: 0,
        language,
      };
    }

    try {
      const db = await this.ensureDB();

      console.log(`[StagingVault] 📦 BATCH SYNC ${storeName}:`, {
        totalItems: items.length,
        batchSize,
        language,
      });

      let processedCount = 0;
      let failedCount = 0;

      // Process in batches
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        let batchSuccess = false;

        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            await db.batchSet(storeName, batch, language);
            processedCount += batch.length;
            batchSuccess = true;
            break;
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));

            if (attempt < retries) {
              console.warn(
                `[StagingVault] ⚠️ Batch attempt ${attempt} failed, retrying...`,
                {
                  batchStart: i,
                  batchSize: batch.length,
                  error: error.message,
                }
              );

              await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
            } else {
              failedCount += batch.length;
              console.error(`[StagingVault] ❌ Batch failed after ${retries} retries:`, error);
            }
          }
        }

        if (!batchSuccess) {
          failedCount += batch.length;
        }
      }

      const duration = performance.now() - startTime;

      if (enableLogging) {
        console.log(`[StagingVault] ✅ BATCH SYNC complete:`, {
          storeName,
          totalItems: items.length,
          processedItems: processedCount,
          failedItems: failedCount,
          duration: `${duration.toFixed(2)}ms`,
          itemsPerSecond: ((processedCount / duration) * 1000).toFixed(0),
          language,
        });
      }

      return {
        success: failedCount === 0,
        storeName: storeName as string,
        itemsProcessed: processedCount,
        duration,
        error: failedCount > 0 ? `${failedCount} items failed` : undefined,
        language,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      console.error('[StagingVault] ❌ BATCH SYNC fatal error:', err);

      return {
        success: false,
        storeName: storeName as string,
        itemsProcessed: 0,
        duration,
        error: err.message,
        language,
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * RETRIEVE: Get cached data from vault
   * ═══════════════════════════════════════════════════════════════════════
   */

  async retrieve<T = unknown>(
    storeName: StoreName,
    key: string,
    options: SyncOptions = {}
  ): Promise<T | null> {
    const { language = 'en', enableLogging = true } = options;

    try {
      const db = await this.ensureDB();

      const data = await db.get<T>(storeName, key, language);

      if (enableLogging) {
        console.log(`[StagingVault] 📥 RETRIEVE ${storeName}:`, {
          key,
          found: !!data,
          language,
        });
      }

      return data ?? null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[StagingVault] ❌ RETRIEVE failed:', err);
      return null;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * RETRIEVE MULTIPLE: Get multiple cached items
   * ═══════════════════════════════════════════════════════════════════════
   */

  async retrieveMultiple<T = unknown>(
    storeName: StoreName,
    keys: string[],
    options: SyncOptions = {}
  ): Promise<(T | null)[]> {
    const { language = 'en', enableLogging = true } = options;

    try {
      const db = await this.ensureDB();
      const results: (T | null)[] = [];

      for (const key of keys) {
        const data = await db.get<T>(storeName, key, language);
        results.push(data ?? null);
      }

      if (enableLogging) {
        console.log(`[StagingVault] 📥 RETRIEVE MULTIPLE ${storeName}:`, {
          requested: keys.length,
          found: results.filter((r) => r !== null).length,
          language,
        });
      }

      return results;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[StagingVault] ❌ RETRIEVE MULTIPLE failed:', err);
      return keys.map(() => null);
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * DELETE: Remove cached item
   * ═══════════════════════════════════════════════════════════════════════
   */

  async delete(
    storeName: StoreName,
    key: string,
    options: SyncOptions = {}
  ): Promise<boolean> {
    const { language = 'en', enableLogging = true } = options;

    try {
      const db = await this.ensureDB();
      await db.delete(storeName, key, language);

      if (enableLogging) {
        console.log(`[StagingVault] 🗑️ DELETE ${storeName}:`, {
          key,
          language,
        });
      }

      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[StagingVault] ❌ DELETE failed:', err);
      return false;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * CLEAR: Remove all data from store
   * ═══════════════════════════════════════════════════════════════════════
   */

  async clear(
    storeName: StoreName,
    options: SyncOptions = {}
  ): Promise<number> {
    const { language = 'en', enableLogging = true } = options;

    try {
      const db = await this.ensureDB();
      const count = await db.clear(storeName, language);

      if (enableLogging) {
        console.log(`[StagingVault] 🧹 CLEAR ${storeName}:`, {
          entriesRemoved: count,
          language,
        });
      }

      return count;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[StagingVault] ❌ CLEAR failed:', err);
      return 0;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * QUERY: Search by index
   * ═══════════════════════════════════════════════════════════════════════
   */

  async query<T = unknown>(
    storeName: StoreName,
    indexName: string,
    indexValue: any,
    options: SyncOptions = {}
  ): Promise<T[]> {
    const { enableLogging = true } = options;

    try {
      const db = await this.ensureDB();
      const results = await db.getByIndex<T>(storeName, indexName, indexValue);

      if (enableLogging) {
        console.log(`[StagingVault] 🔍 QUERY ${storeName}/${indexName}:`, {
          indexValue,
          resultsCount: results.length,
        });
      }

      return results;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[StagingVault] ❌ QUERY failed:', err);
      return [];
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * QUERY ALL: Get all from store
   * ═══════════════════════════════════════════════════════════════════════
   */

  async queryAll<T = unknown>(
    storeName: StoreName,
    options: SyncOptions = {}
  ): Promise<T[]> {
    const { enableLogging = true } = options;

    try {
      const db = await this.ensureDB();
      const results = await db.getAllFromStore<T>(storeName);

      if (enableLogging) {
        console.log(`[StagingVault] 📋 QUERY ALL ${storeName}:`, {
          count: results.length,
        });
      }

      return results;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[StagingVault] ❌ QUERY ALL failed:', err);
      return [];
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * PURGE: Clean up expired data
   * ═══════════════════════════════════════════════════════════════════════
   */

  async purgeExpired(
    storeName: StoreName,
    options: SyncOptions = {}
  ): Promise<number> {
    const { language = 'en', enableLogging = true } = options;

    try {
      const db = await this.ensureDB();
      const purgedCount = await db.purgeExpired(storeName, language);

      if (enableLogging) {
        console.log(`[StagingVault] 🧹 PURGE EXPIRED ${storeName}:`, {
          entriesRemoved: purgedCount,
          language,
        });
      }

      return purgedCount;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[StagingVault] ❌ PURGE EXPIRED failed:', err);
      return 0;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * PURGE SYNC LOGS: Clean up old audit logs
   * ═══════════════════════════════════════════════════════════════════════
   */

  async purgeSyncLogs(options: SyncOptions = {}): Promise<number> {
    const { language = 'en', enableLogging = true } = options;

    try {
      const db = await this.ensureDB();
      const purgedCount = await db.purgeSyncLogs(language);

      if (enableLogging) {
        console.log(`[StagingVault] 🧹 PURGE SYNC LOGS:`, {
          logsRemoved: purgedCount,
          language,
        });
      }

      return purgedCount;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[StagingVault] ❌ PURGE SYNC LOGS failed:', err);
      return 0;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * STATS: Get database statistics
   * ═══════════════════════════════════════════════════════════════════════
   */

  async getStats(storeName?: StoreName): Promise<Record<string, any>> {
    try {
      const db = await this.ensureDB();

      if (storeName) {
        const stats = await db.getStoreStats(storeName);
        console.log(`[StagingVault] 📊 Stats for ${storeName}:`, stats);
        return stats;
      } else {
        const allStats = await db.getAllStoreStats();
        console.log('[StagingVault] 📊 All store stats:', allStats);
        return allStats;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[StagingVault] ❌ GET STATS failed:', err);
      return {};
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * SHUTDOWN: Close database connection
   * ═══════════════════════════════════════════════════════════════════════
   */

  shutdown(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[StagingVault] 🛑 Staging Vault Service closed');
    }
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SINGLETON INSTANCE
 * ═══════════════════════════════════════════════════════════════════════════
 */

let vaultInstance: StagingVaultService | null = null;

export function getStagingVaultService(): StagingVaultService {
  if (!vaultInstance) {
    vaultInstance = new StagingVaultService();
  }
  return vaultInstance;
}

export function resetStagingVault(): void {
  if (vaultInstance) {
    vaultInstance.shutdown();
    vaultInstance = null;
  }
}

export default StagingVaultService;
