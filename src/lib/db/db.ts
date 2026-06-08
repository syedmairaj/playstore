/**
 * Centralized IndexedDB Manager - Multi-Store Architecture
 *
 * Manages multiple stores for the entire platform:
 * - keyword_data: Market intel, AI keyword spotlight, ASO features
 * - review_logs: Review management and sentiment analysis
 * - rank_snapshots: Ranking history for alert triggering
 * - keyword_tracker: Keyword performance tracking
 * - competitor_data: Competitor analysis cache
 *
 * Features:
 * - Schema versioning for easy feature expansion
 * - Non-blocking async operations (UI stays responsive)
 * - Unified sync interface for all services
 * - Bilingual support (EN/AR)
 * - Automatic data cleanup and pruning
 *
 * Usage:
 * ```typescript
 * const db = await getDBManager();
 * await db.set('keyword_data', key, data);
 * const data = await db.get('keyword_data', key);
 * ```
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TYPE DEFINITIONS & INTERFACES
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Keyword Data Store
 * Market intel, AI keyword spotlight, ASO features
 */
export interface KeywordData {
  id: string; // `keyword:${language}:${appId}:${keyword}`
  keyword: string;
  appId: string;
  language: 'en' | 'ar';
  difficulty: number;
  searchVolume: number;
  cpc: number;
  trend: 'up' | 'down' | 'stable';
  competition: 'low' | 'medium' | 'high';
  opportunity: number; // 0-100
  lastUpdated: number; // timestamp
  expiresAt: number; // timestamp
  metadata?: Record<string, unknown>;
}

/**
 * Review Logs Store
 * Review management, sentiment analysis, historical records
 */
export interface ReviewLog {
  id: string; // `review:${appId}:${reviewId}:${language}`
  appId: string;
  reviewId: string;
  rating: number;
  title: string;
  body: string;
  author: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number; // 0-100
  language: 'en' | 'ar';
  createdAt: number; // timestamp
  analyzedAt: number; // timestamp
  tags: string[];
  isArchived: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Rank Snapshots Store
 * Ranking history for alert triggering and trend analysis
 */
export interface RankSnapshot {
  id: string; // `rank:${appId}:${keyword}:${timestamp}`
  appId: string;
  keyword: string;
  position: number; // 1-500
  category: string;
  device: 'mobile' | 'tablet' | 'desktop';
  country: string;
  language: 'en' | 'ar';
  timestamp: number; // snapshot timestamp
  recordedAt: number; // when recorded
  changeFromLast: number; // +/- position change
  trendDays7: 'up' | 'down' | 'stable';
  trendDays30: 'up' | 'down' | 'stable';
  metadata?: Record<string, unknown>;
}

/**
 * Keyword Tracker Store
 * Comprehensive keyword tracking for ASO optimization
 */
export interface KeywordTrackerData {
  id: string; // `tracker:${appId}:${keyword}:${language}`
  appId: string;
  keyword: string;
  language: 'en' | 'ar';
  currentRank: number;
  previousRank: number;
  bestRank: number;
  worstRank: number;
  daysTracking: number;
  rankHistory: Array<{ date: number; rank: number }>;
  performanceScore: number; // 0-100
  estimatedTraffic: number;
  lastSnapshot: number; // timestamp
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Competitor Data Store
 * Competitor analysis, keywords, market position
 */
export interface CompetitorData {
  id: string; // `competitor:${competitorId}:${language}`
  competitorId: string;
  appName: string;
  appIcon?: string;
  category: string;
  language: 'en' | 'ar';
  downloadEstimate: number;
  ratingValue: number; // 1-5
  ratingCount: number;
  keywords: string[];
  topKeywords: Array<{ keyword: string; rank: number }>;
  marketShare: number; // 0-100
  strengths: string[];
  weaknesses: string[];
  lastAnalyzed: number; // timestamp
  expiresAt: number; // timestamp
  metadata?: Record<string, unknown>;
}

/**
 * Sync Log Store
 * Track all sync operations for debugging and audit
 */
export interface SyncLog {
  id: string; // `sync:${storeName}:${timestamp}:${uuid}`
  storeName: string;
  operation: 'set' | 'delete' | 'clear' | 'purge';
  dataKey: string;
  status: 'success' | 'error';
  errorMessage?: string;
  entriesAffected: number;
  timestamp: number;
  duration: number; // milliseconds
  language: 'en' | 'ar';
  metadata?: Record<string, unknown>;
}

/**
 * Database Schema Definition
 */
interface PlatformDB extends DBSchema {
  keyword_data: {
    key: string;
    value: KeywordData;
    indexes: {
      'by-appId-language': [string, string];
      'by-expiry': number;
      'by-updated': number;
    };
  };
  review_logs: {
    key: string;
    value: ReviewLog;
    indexes: {
      'by-appId-language': [string, string];
      'by-sentiment': string;
      'by-created': number;
    };
  };
  rank_snapshots: {
    key: string;
    value: RankSnapshot;
    indexes: {
      'by-appId-timestamp': [string, number];
      'by-keyword': string;
      'by-recorded': number;
    };
  };
  keyword_tracker: {
    key: string;
    value: KeywordTrackerData;
    indexes: {
      'by-appId-language': [string, string];
      'by-updated': number;
      'by-performance': number;
    };
  };
  competitor_data: {
    key: string;
    value: CompetitorData;
    indexes: {
      'by-language': string;
      'by-expiry': number;
      'by-analyzed': number;
    };
  };
  sync_logs: {
    key: string;
    value: SyncLog;
    indexes: {
      'by-store': string;
      'by-timestamp': number;
      'by-status': string;
    };
  };
}

/**
 * Database Configuration
 */
interface DBConfig {
  dbName?: string;
  version?: number;
  enableSyncLogging?: boolean;
  language?: 'en' | 'ar';
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CENTRALIZED DB MANAGER - Multi-Store Support
 * ═══════════════════════════════════════════════════════════════════════════
 */

export class CentralizedDBManager {
  private db: IDBPDatabase<PlatformDB> | null = null;
  private config: Required<DBConfig>;
  private syncLoggingEnabled: boolean = false;

  // Store metadata for versioning
  private readonly STORE_METADATA = {
    keyword_data: { version: 1, description: 'Market intel, AI keywords, ASO data' },
    review_logs: { version: 1, description: 'Review management and sentiment' },
    rank_snapshots: { version: 1, description: 'Ranking history for alerts' },
    keyword_tracker: { version: 1, description: 'Keyword tracking data' },
    competitor_data: { version: 1, description: 'Competitor analysis data' },
    sync_logs: { version: 1, description: 'Sync operation audit logs' },
  };

  // Database constants
  private readonly DB_NAME = 'PlayStore-Platform';
  private readonly DB_VERSION = 6; // Increment when schema changes
  private readonly SYNC_LOG_RETENTION = 30 * 24 * 60 * 60 * 1000; // 30 days

  constructor(config: DBConfig = {}) {
    this.config = {
      dbName: config.dbName ?? this.DB_NAME,
      version: config.version ?? this.DB_VERSION,
      enableSyncLogging: config.enableSyncLogging ?? true,
      language: config.language ?? 'en',
    };

    this.syncLoggingEnabled = this.config.enableSyncLogging;

    console.log(`[CentralizedDB] 🚀 Initializing ${this.config.language}:`, {
      dbName: this.config.dbName,
      version: this.config.version,
      syncLogging: this.syncLoggingEnabled,
      language: this.config.language,
    });
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * INITIALIZATION: Open and upgrade database
   * ═══════════════════════════════════════════════════════════════════════
   */

  async initialize(): Promise<void> {
    if (this.db) {
      console.log('[CentralizedDB] ⏭️ Already initialized, skipping');
      return;
    }

    try {
      this.db = await openDB<PlatformDB>(this.config.dbName, this.config.version, {
        upgrade: (db, oldVersion, newVersion) => {
          this.handleUpgrade(db, oldVersion, newVersion);
        },
      });

      console.log('[CentralizedDB] ✅ Database initialized:', {
        name: this.config.dbName,
        version: newVersion,
        stores: Object.keys(this.STORE_METADATA).length,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[CentralizedDB] ❌ Initialization failed:', err);
      throw err;
    }
  }

  private handleUpgrade(db: IDBPDatabase<PlatformDB>, oldVersion: number, newVersion: number) {
    console.log(`[CentralizedDB] 📦 Upgrading schema: v${oldVersion} → v${newVersion}`);

    // Create keyword_data store
    if (!db.objectStoreNames.contains('keyword_data')) {
      const keywordStore = db.createObjectStore('keyword_data', { keyPath: 'id' });
      keywordStore.createIndex('by-appId-language', ['appId', 'language']);
      keywordStore.createIndex('by-expiry', 'expiresAt');
      keywordStore.createIndex('by-updated', 'lastUpdated');
      console.log('[CentralizedDB] ✅ Created store: keyword_data');
    }

    // Create review_logs store
    if (!db.objectStoreNames.contains('review_logs')) {
      const reviewStore = db.createObjectStore('review_logs', { keyPath: 'id' });
      reviewStore.createIndex('by-appId-language', ['appId', 'language']);
      reviewStore.createIndex('by-sentiment', 'sentiment');
      reviewStore.createIndex('by-created', 'createdAt');
      console.log('[CentralizedDB] ✅ Created store: review_logs');
    }

    // Create rank_snapshots store
    if (!db.objectStoreNames.contains('rank_snapshots')) {
      const rankStore = db.createObjectStore('rank_snapshots', { keyPath: 'id' });
      rankStore.createIndex('by-appId-timestamp', ['appId', 'timestamp']);
      rankStore.createIndex('by-keyword', 'keyword');
      rankStore.createIndex('by-recorded', 'recordedAt');
      console.log('[CentralizedDB] ✅ Created store: rank_snapshots');
    }

    // Create keyword_tracker store
    if (!db.objectStoreNames.contains('keyword_tracker')) {
      const trackerStore = db.createObjectStore('keyword_tracker', { keyPath: 'id' });
      trackerStore.createIndex('by-appId-language', ['appId', 'language']);
      trackerStore.createIndex('by-updated', 'updatedAt');
      trackerStore.createIndex('by-performance', 'performanceScore');
      console.log('[CentralizedDB] ✅ Created store: keyword_tracker');
    }

    // Create competitor_data store
    if (!db.objectStoreNames.contains('competitor_data')) {
      const competitorStore = db.createObjectStore('competitor_data', { keyPath: 'id' });
      competitorStore.createIndex('by-language', 'language');
      competitorStore.createIndex('by-expiry', 'expiresAt');
      competitorStore.createIndex('by-analyzed', 'lastAnalyzed');
      console.log('[CentralizedDB] ✅ Created store: competitor_data');
    }

    // Create sync_logs store
    if (!db.objectStoreNames.contains('sync_logs')) {
      const syncStore = db.createObjectStore('sync_logs', { keyPath: 'id' });
      syncStore.createIndex('by-store', 'storeName');
      syncStore.createIndex('by-timestamp', 'timestamp');
      syncStore.createIndex('by-status', 'status');
      console.log('[CentralizedDB] ✅ Created store: sync_logs');
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * UNIFIED SYNC INTERFACE: Common method for all stores
   * ═══════════════════════════════════════════════════════════════════════
   */

  async set<T extends { id: string }>(
    storeName: keyof PlatformDB,
    data: T,
    language: 'en' | 'ar' = 'en'
  ): Promise<void> {
    await this.ensureInitialized();
    const startTime = performance.now();

    try {
      if (!this.db) throw new Error('Database not initialized');

      await this.db.put(storeName as any, data as any);

      const duration = performance.now() - startTime;

      console.log(`[CentralizedDB] 💾 SET ${storeName}:`, {
        id: data.id,
        duration: `${duration.toFixed(2)}ms`,
        language,
      });

      // Log sync operation
      if (this.syncLoggingEnabled) {
        await this.logSyncOperation('set', storeName, data.id, 'success', 1, duration, language);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = performance.now() - startTime;

      console.error(`[CentralizedDB] ❌ SET ${storeName} failed:`, err);

      if (this.syncLoggingEnabled) {
        await this.logSyncOperation(
          'set',
          storeName,
          data.id,
          'error',
          0,
          duration,
          language,
          err.message
        );
      }

      throw err;
    }
  }

  async get<T>(
    storeName: keyof PlatformDB,
    key: string,
    language: 'en' | 'ar' = 'en'
  ): Promise<T | undefined> {
    await this.ensureInitialized();
    const startTime = performance.now();

    try {
      if (!this.db) throw new Error('Database not initialized');

      const data = await this.db.get(storeName as any, key);
      const duration = performance.now() - startTime;

      console.log(`[CentralizedDB] 📖 GET ${storeName}:`, {
        key,
        found: !!data,
        duration: `${duration.toFixed(2)}ms`,
        language,
      });

      return data as T | undefined;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[CentralizedDB] ❌ GET ${storeName} failed:`, err);
      throw err;
    }
  }

  async delete(
    storeName: keyof PlatformDB,
    key: string,
    language: 'en' | 'ar' = 'en'
  ): Promise<void> {
    await this.ensureInitialized();
    const startTime = performance.now();

    try {
      if (!this.db) throw new Error('Database not initialized');

      await this.db.delete(storeName as any, key);

      const duration = performance.now() - startTime;

      console.log(`[CentralizedDB] 🗑️ DELETE ${storeName}:`, {
        key,
        duration: `${duration.toFixed(2)}ms`,
        language,
      });

      if (this.syncLoggingEnabled) {
        await this.logSyncOperation('delete', storeName, key, 'success', 1, duration, language);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = performance.now() - startTime;

      console.error(`[CentralizedDB] ❌ DELETE ${storeName} failed:`, err);

      if (this.syncLoggingEnabled) {
        await this.logSyncOperation(
          'delete',
          storeName,
          key,
          'error',
          0,
          duration,
          language,
          err.message
        );
      }

      throw err;
    }
  }

  async clear(
    storeName: keyof PlatformDB,
    language: 'en' | 'ar' = 'en'
  ): Promise<number> {
    await this.ensureInitialized();
    const startTime = performance.now();

    try {
      if (!this.db) throw new Error('Database not initialized');

      // Get count before clearing
      const store = this.db.transaction(storeName as any).objectStore(storeName as any);
      const count = await store.count();

      await this.db.clear(storeName as any);

      const duration = performance.now() - startTime;

      console.log(`[CentralizedDB] 🧹 CLEAR ${storeName}:`, {
        entriesRemoved: count,
        duration: `${duration.toFixed(2)}ms`,
        language,
      });

      if (this.syncLoggingEnabled) {
        await this.logSyncOperation('clear', storeName, '', 'success', count, duration, language);
      }

      return count;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = performance.now() - startTime;

      console.error(`[CentralizedDB] ❌ CLEAR ${storeName} failed:`, err);

      if (this.syncLoggingEnabled) {
        await this.logSyncOperation(
          'clear',
          storeName,
          '',
          'error',
          0,
          duration,
          language,
          err.message
        );
      }

      throw err;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * QUERY OPERATIONS: Index-based queries
   * ═══════════════════════════════════════════════════════════════════════
   */

  async getByIndex<T>(
    storeName: keyof PlatformDB,
    indexName: string,
    indexValue: any
  ): Promise<T[]> {
    await this.ensureInitialized();

    try {
      if (!this.db) throw new Error('Database not initialized');

      const tx = this.db.transaction(storeName as any);
      const index = tx.objectStore(storeName as any).index(indexName);
      const results = await index.getAll(indexValue);

      console.log(`[CentralizedDB] 🔍 QUERY ${storeName}/${indexName}:`, {
        indexValue,
        resultsCount: results.length,
      });

      return results as T[];
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[CentralizedDB] ❌ QUERY failed:`, err);
      throw err;
    }
  }

  async getAllFromStore<T>(storeName: keyof PlatformDB): Promise<T[]> {
    await this.ensureInitialized();

    try {
      if (!this.db) throw new Error('Database not initialized');

      const results = await this.db.getAll(storeName as any);

      console.log(`[CentralizedDB] 📋 GETALL ${storeName}:`, {
        count: results.length,
      });

      return results as T[];
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[CentralizedDB] ❌ GETALL failed:`, err);
      throw err;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * BATCH OPERATIONS: Non-blocking bulk data handling
   * ═══════════════════════════════════════════════════════════════════════
   */

  async batchSet<T extends { id: string }>(
    storeName: keyof PlatformDB,
    items: T[],
    language: 'en' | 'ar' = 'en'
  ): Promise<void> {
    await this.ensureInitialized();
    const startTime = performance.now();

    try {
      if (!this.db) throw new Error('Database not initialized');

      const tx = this.db.transaction(storeName as any, 'readwrite');
      for (const item of items) {
        await tx.store.put(item);
      }
      await tx.done;

      const duration = performance.now() - startTime;

      console.log(`[CentralizedDB] 💾 BATCH SET ${storeName}:`, {
        count: items.length,
        duration: `${duration.toFixed(2)}ms`,
        language,
      });

      if (this.syncLoggingEnabled) {
        await this.logSyncOperation(
          'set',
          storeName,
          `batch-${items.length}`,
          'success',
          items.length,
          duration,
          language
        );
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = performance.now() - startTime;

      console.error(`[CentralizedDB] ❌ BATCH SET failed:`, err);

      if (this.syncLoggingEnabled) {
        await this.logSyncOperation(
          'set',
          storeName,
          'batch-error',
          'error',
          0,
          duration,
          language,
          err.message
        );
      }

      throw err;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * CLEANUP & MAINTENANCE: Auto-prune expired/old data
   * ═══════════════════════════════════════════════════════════════════════
   */

  async purgeExpired(
    storeName: keyof PlatformDB,
    language: 'en' | 'ar' = 'en'
  ): Promise<number> {
    await this.ensureInitialized();
    const startTime = performance.now();

    try {
      if (!this.db) throw new Error('Database not initialized');

      let purgedCount = 0;
      const now = Date.now();

      // Get all records
      const allRecords = await this.getAllFromStore(storeName);

      // Filter expired records
      const tx = this.db.transaction(storeName as any, 'readwrite');
      for (const record of allRecords) {
        const recordAny = record as any;
        if (recordAny.expiresAt && recordAny.expiresAt < now) {
          await tx.store.delete(recordAny.id);
          purgedCount++;
        }
      }
      await tx.done;

      const duration = performance.now() - startTime;

      console.log(`[CentralizedDB] 🧹 PURGE ${storeName}:`, {
        expiredRemoved: purgedCount,
        duration: `${duration.toFixed(2)}ms`,
        language,
      });

      if (this.syncLoggingEnabled) {
        await this.logSyncOperation(
          'purge',
          storeName,
          '',
          'success',
          purgedCount,
          duration,
          language
        );
      }

      return purgedCount;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = performance.now() - startTime;

      console.error(`[CentralizedDB] ❌ PURGE failed:`, err);

      if (this.syncLoggingEnabled) {
        await this.logSyncOperation(
          'purge',
          storeName,
          '',
          'error',
          0,
          duration,
          language,
          err.message
        );
      }

      throw err;
    }
  }

  async purgeSyncLogs(language: 'en' | 'ar' = 'en'): Promise<number> {
    await this.ensureInitialized();
    const startTime = performance.now();

    try {
      if (!this.db) throw new Error('Database not initialized');

      const cutoffTime = Date.now() - this.SYNC_LOG_RETENTION;
      const tx = this.db.transaction('sync_logs', 'readwrite');
      const index = tx.objectStore('sync_logs').index('by-timestamp');

      let deletedCount = 0;
      for await (const cursor of index.iterate()) {
        if (cursor.value.timestamp < cutoffTime) {
          cursor.delete();
          deletedCount++;
        }
      }
      await tx.done;

      const duration = performance.now() - startTime;

      console.log(`[CentralizedDB] 🧹 PURGE sync_logs:`, {
        logsRemoved: deletedCount,
        olderThan: new Date(cutoffTime).toISOString(),
        duration: `${duration.toFixed(2)}ms`,
        language,
      });

      return deletedCount;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[CentralizedDB] ❌ PURGE sync_logs failed:`, err);
      throw err;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * SCHEMA VERSIONING: Upgrade tracking and history
   * ═══════════════════════════════════════════════════════════════════════
   */

  getSchemaMetadata(): typeof CentralizedDBManager.prototype.STORE_METADATA {
    return this.STORE_METADATA;
  }

  getStoreInfo(storeName: keyof typeof CentralizedDBManager.prototype.STORE_METADATA) {
    return this.STORE_METADATA[storeName];
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * STATISTICS & MONITORING
   * ═══════════════════════════════════════════════════════════════════════
   */

  async getStoreStats(storeName: keyof PlatformDB): Promise<{
    count: number;
    storeName: string;
  }> {
    await this.ensureInitialized();

    try {
      if (!this.db) throw new Error('Database not initialized');

      const count = await this.db.count(storeName as any);

      return {
        count,
        storeName: storeName as string,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[CentralizedDB] ❌ Get stats failed:`, err);
      throw err;
    }
  }

  async getAllStoreStats(): Promise<
    Record<
      string,
      {
        count: number;
        version: number;
        description: string;
      }
    >
  > {
    await this.ensureInitialized();

    const stats: Record<
      string,
      {
        count: number;
        version: number;
        description: string;
      }
    > = {};

    try {
      for (const [storeName, metadata] of Object.entries(this.STORE_METADATA)) {
        const count = await this.getStoreStats(storeName as keyof PlatformDB);
        stats[storeName] = {
          count: count.count,
          version: metadata.version,
          description: metadata.description,
        };
      }

      console.log('[CentralizedDB] 📊 Store statistics:', stats);

      return stats;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[CentralizedDB] ❌ Get all stats failed:`, err);
      throw err;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * PRIVATE HELPERS
   * ═══════════════════════════════════════════════════════════════════════
   */

  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
  }

  private async logSyncOperation(
    operation: 'set' | 'delete' | 'clear' | 'purge',
    storeName: keyof PlatformDB,
    dataKey: string,
    status: 'success' | 'error',
    entriesAffected: number,
    duration: number,
    language: 'en' | 'ar',
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.ensureInitialized();

      const syncLog: SyncLog = {
        id: `sync:${storeName}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`,
        storeName: storeName as string,
        operation,
        dataKey,
        status,
        errorMessage,
        entriesAffected,
        timestamp: Date.now(),
        duration,
        language,
      };

      if (this.db) {
        await this.db.put('sync_logs', syncLog);
      }
    } catch (error) {
      // Silently fail logging to not disrupt main operations
      console.warn('[CentralizedDB] ⚠️ Failed to log sync operation:', error);
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * SHUTDOWN & CLEANUP
   * ═══════════════════════════════════════════════════════════════════════
   */

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[CentralizedDB] 🛑 Database connection closed');
    }
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SINGLETON INSTANCE
 * ═══════════════════════════════════════════════════════════════════════════
 */

let dbInstance: CentralizedDBManager | null = null;

export async function getDBManager(config?: DBConfig): Promise<CentralizedDBManager> {
  if (!dbInstance) {
    dbInstance = new CentralizedDBManager(config);
    await dbInstance.initialize();
  }
  return dbInstance;
}

export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export default CentralizedDBManager;
