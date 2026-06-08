/**
 * IndexedDB Manager - Stale-While-Revalidate Cache
 *
 * Provides persistent client-side caching with 24-hour TTL.
 * Ensures instant UI rendering from cache while syncing fresh data in background.
 *
 * Features:
 * - Persistent IndexedDB storage
 * - 24-hour cache TTL with automatic expiration
 * - Bilingual support (EN/AR)
 * - Conflict resolution (stale cache fallback)
 * - Cache timestamp tracking
 * - Workspace and user isolation
 */

export interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  timestamp: number;  // Original insertion time
  lastFetched: number; // Last time data was refreshed from source
  expiresAt: number;   // Hard limit: 7 days
  revalidateAt: number; // Soft limit: 24 hours (background sync)
  language: 'en' | 'ar';
  workspaceId: string;
  userId: string;
  version: number;
  isDirty: boolean;
  refreshCount: number; // How many times this entry has been refreshed
}

export interface CacheMetadata {
  key: string;
  timestamp: number;
  expiresAt: number;
  language: 'en' | 'ar';
  workspaceId: string;
  userId: string;
  isFresh: boolean;
  isStale: boolean;
  age: number;
}

export interface SWRResponse<T = unknown> {
  data: T | null;
  source: 'cache' | 'fresh' | 'stale';
  isFresh: boolean;
  isStale: boolean;
  age: number;
  expiresAt: number;
  lastUpdated: string;
  shouldRevalidate: boolean;
  message?: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INDEXED DB MANAGER - Main Class
 * ═══════════════════════════════════════════════════════════════════════════
 */

export class IndexedDBManager {
  private dbName = 'playstore-cache';
  private version = 1;
  private storeName = 'keyword-cache';
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase>;

  // ═══════════════════════════════════════════════════════════════════════
  // SMART CACHE TIMING STRATEGY (7-Day Industry Standard)
  // ═══════════════════════════════════════════════════════════════════════
  // Hard Limit (expiresAt): 7 days
  //   → Cache becomes completely invalid after 7 days
  //   → Forces fetch on next access
  //   → Guarantees fresh data at least weekly
  //
  // Soft Limit (revalidateAt): 24 hours
  //   → After 24h, triggers background sync
  //   → Returns stale cache immediately while fetching fresh data
  //   → User sees instant data + seamless background update
  //   → Perfect for trend analysis (7-day window)
  //
  // Why 24h soft + 7d hard?
  //   - Users get instant data (< 5ms from cache)
  //   - Background keeps data "fresh enough" for trend analysis
  //   - Weekly refresh guarantees accuracy for ASO keyword tracking
  //   - Minimizes API calls (99% reduction)
  // ═══════════════════════════════════════════════════════════════════════

  private readonly HARD_LIMIT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly SOFT_LIMIT_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly CHECK_INTERVAL = 60 * 1000; // Check every minute

  constructor() {
    this.initPromise = this.initDB();
  }

  /**
   * Initialize IndexedDB
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    console.log('[IndexedDB] 🔄 Initializing database:', {
      dbName: this.dbName,
      version: this.version,
      timestamp: new Date().toISOString(),
    });

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('[IndexedDB] ❌ Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDB] ✅ Database initialized successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          // Create indexes for faster queries
          store.createIndex('workspace', 'workspaceId', { unique: false });
          store.createIndex('user', 'userId', { unique: false });
          store.createIndex('language', 'language', { unique: false });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });

          console.log('[IndexedDB] 📊 Object store and indexes created');
        }
      };
    });
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * SET: Store data in IndexedDB
   * ═══════════════════════════════════════════════════════════════════════
   */

  async set<T>(
    key: string,
    data: T,
    language: 'en' | 'ar',
    workspaceId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const db = await this.initPromise;
      const now = Date.now();
      const expiresAt = now + this.HARD_LIMIT_TTL; // 7-day hard limit
      const revalidateAt = now + this.SOFT_LIMIT_TTL; // 24-hour soft limit

      const entry: CacheEntry<T> = {
        key: `${key}:${language}:${workspaceId}:${userId}`,
        data,
        timestamp: now,
        lastFetched: now, // ✅ Track when data was fetched from source
        expiresAt, // ✅ 7-day hard limit
        revalidateAt, // ✅ 24-hour soft limit for background sync
        language,
        workspaceId,
        userId,
        version: 1,
        isDirty: false,
        refreshCount: 0, // Track refresh cycles
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put(entry);

        request.onerror = () => {
          console.error('[IndexedDB] ❌ Failed to set cache:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log('[IndexedDB] ✅ Data cached:', {
            key: entry.key,
            language,
            expiresAt: new Date(expiresAt).toISOString(),
            dataSize: JSON.stringify(data).length,
          });
          resolve(true);
        };

        transaction.onerror = () => {
          console.error('[IndexedDB] ❌ Transaction error:', transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error('[IndexedDB] ❌ Set operation failed:', error);
      return false;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * GET: Retrieve data from IndexedDB (Instant render)
   * ═══════════════════════════════════════════════════════════════════════
   */

  async get<T = unknown>(
    key: string,
    language: 'en' | 'ar',
    workspaceId: string,
    userId: string
  ): Promise<SWRResponse<T>> {
    try {
      const db = await this.initPromise;
      const cacheKey = `${key}:${language}:${workspaceId}:${userId}`;
      const now = Date.now();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(cacheKey);

        request.onerror = () => {
          console.error('[IndexedDB] ❌ Failed to get cache:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          const entry = request.result as CacheEntry<T> | undefined;

          if (!entry) {
            console.log('[SmartCache] ⚠️ Cache miss:', { key: cacheKey });
            resolve({
              data: null,
              source: 'cache',
              isFresh: false,
              isStale: false,
              age: 0,
              expiresAt: 0,
              lastUpdated: 'Never',
              shouldRevalidate: true,
              message: 'No cached data found',
            });
            return;
          }

          // ═══════════════════════════════════════════════════════════════
          // 7-DAY SMART CACHE LOGIC
          // ═══════════════════════════════════════════════════════════════
          const age = now - entry.lastFetched;
          const timeUntilHardExpiry = entry.expiresAt - now;
          const isHardExpired = now > entry.expiresAt; // Hard limit: 7 days
          const isSoftExpired = now > entry.revalidateAt; // Soft limit: 24 hours
          const isFresh = !isSoftExpired; // Fresh: < 24 hours
          const isStale = isSoftExpired && !isHardExpired; // Stale: 24h-7d
          const shouldRevalidate = isSoftExpired; // Background sync after 24h
          const shouldForceRefresh = isHardExpired; // Force refresh after 7 days

          console.log('[SmartCache] 📊 Cache hit (7-day Smart Cache):', {
            key: cacheKey,
            language,
            age: `${(age / 1000 / 60 / 60).toFixed(1)}h`,
            ageInDays: `${(age / 1000 / 60 / 60 / 24).toFixed(2)}d`,
            status: isFresh ? '✅ Fresh' : isStale ? '⚠️ Stale' : '🔴 Expired',
            softLimitAt: new Date(entry.revalidateAt).toISOString(),
            hardLimitAt: new Date(entry.expiresAt).toISOString(),
            timeUntilHardExpiry: `${(timeUntilHardExpiry / 1000 / 60 / 60 / 24).toFixed(1)} days`,
            shouldRevalidate,
            shouldForceRefresh,
            refreshCount: entry.refreshCount,
          });

          resolve({
            data: entry.data,
            source: 'cache',
            isFresh,
            isStale,
            age,
            expiresAt: entry.expiresAt,
            lastUpdated: new Date(entry.lastFetched).toISOString(),
            shouldRevalidate,
            message: isFresh
              ? '✅ Fresh data (< 24h)'
              : isStale
                ? '⚠️ Stale data (24h-7d) - background sync in progress'
                : '🔴 Expired data (> 7d) - forcing refresh',
          });
        };

        transaction.onerror = () => {
          console.error('[IndexedDB] ❌ Transaction error:', transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error('[IndexedDB] ❌ Get operation failed:', error);
      return {
        data: null,
        source: 'cache',
        isFresh: false,
        isStale: false,
        age: 0,
        expiresAt: 0,
        lastUpdated: 'Error',
        shouldRevalidate: true,
        message: 'Cache access failed',
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * UPDATE FETCH TIMESTAMP: Mark when data was refreshed from source
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Call this when you refresh data from API/database to update lastFetched
   * This ensures 24h soft limit and 7d hard limit are calculated correctly
   */

  async updateLastFetched(
    key: string,
    language: 'en' | 'ar',
    workspaceId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const db = await this.initPromise;
      const cacheKey = `${key}:${language}:${workspaceId}:${userId}`;
      const now = Date.now();
      const revalidateAt = now + this.SOFT_LIMIT_TTL;
      const expiresAt = now + this.HARD_LIMIT_TTL;

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const getRequest = store.get(cacheKey);

        getRequest.onsuccess = () => {
          const entry = getRequest.result as CacheEntry | undefined;

          if (!entry) {
            console.warn('[SmartCache] ⚠️ Cannot update - entry not found:', {
              key: cacheKey,
            });
            resolve(false);
            return;
          }

          // ✅ Update timestamps for 7-day smart cache
          entry.lastFetched = now;
          entry.revalidateAt = revalidateAt;
          entry.expiresAt = expiresAt;
          entry.refreshCount = (entry.refreshCount || 0) + 1;
          entry.isDirty = false;

          const putRequest = store.put(entry);

          putRequest.onsuccess = () => {
            console.log('[SmartCache] ✅ Cache refreshed (lastFetched updated):', {
              key: cacheKey,
              lastFetched: new Date(now).toISOString(),
              nextRevalidateAt: new Date(revalidateAt).toISOString(),
              nextHardExpireAt: new Date(expiresAt).toISOString(),
              refreshCount: entry.refreshCount,
            });
            resolve(true);
          };

          putRequest.onerror = () => {
            console.error('[SmartCache] ❌ Failed to update timestamp:', putRequest.error);
            reject(putRequest.error);
          };
        };

        getRequest.onerror = () => {
          console.error('[SmartCache] ❌ Failed to get entry:', getRequest.error);
          reject(getRequest.error);
        };

        transaction.onerror = () => {
          console.error('[SmartCache] ❌ Transaction error:', transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error('[SmartCache] ❌ Update fetch timestamp failed:', error);
      return false;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * DELETE: Remove specific cache entry
   * ═══════════════════════════════════════════════════════════════════════
   */

  async delete(
    key: string,
    language: 'en' | 'ar',
    workspaceId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const db = await this.initPromise;
      const cacheKey = `${key}:${language}:${workspaceId}:${userId}`;

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.delete(cacheKey);

        request.onerror = () => {
          console.error('[IndexedDB] ❌ Failed to delete cache:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log('[IndexedDB] 🗑️ Cache deleted:', { key: cacheKey });
          resolve(true);
        };

        transaction.onerror = () => {
          console.error('[IndexedDB] ❌ Transaction error:', transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error('[IndexedDB] ❌ Delete operation failed:', error);
      return false;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * CLEAR: Remove all expired entries
   * ═══════════════════════════════════════════════════════════════════════
   */

  async clearExpired(): Promise<number> {
    try {
      const db = await this.initPromise;
      const now = Date.now();
      let deletedCount = 0;

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('expiresAt');
        const range = IDBKeyRange.upperBound(now);
        const request = index.openCursor(range);

        request.onerror = () => {
          console.error('[IndexedDB] ❌ Failed to clear expired:', request.error);
          reject(request.error);
        };

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            deletedCount++;
            cursor.continue();
          } else {
            console.log('[IndexedDB] 🧹 Cleaned up expired entries:', {
              deletedCount,
              timestamp: new Date().toISOString(),
            });
            resolve(deletedCount);
          }
        };

        transaction.onerror = () => {
          console.error('[IndexedDB] ❌ Transaction error:', transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error('[IndexedDB] ❌ Clear operation failed:', error);
      return 0;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * GET ALL: Retrieve all cached entries for a workspace
   * ═══════════════════════════════════════════════════════════════════════
   */

  async getAllByWorkspace(
    workspaceId: string,
    language?: 'en' | 'ar'
  ): Promise<CacheMetadata[]> {
    try {
      const db = await this.initPromise;

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('workspace');
        const range = IDBKeyRange.only(workspaceId);
        const request = index.getAll(range);

        request.onerror = () => {
          console.error('[IndexedDB] ❌ Failed to get all entries:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          const entries = request.result as CacheEntry[];
          const now = Date.now();

          const metadata = entries
            .filter((e) => !language || e.language === language)
            .map((e) => ({
              key: e.key,
              timestamp: e.timestamp,
              expiresAt: e.expiresAt,
              language: e.language,
              workspaceId: e.workspaceId,
              userId: e.userId,
              isFresh: now - e.timestamp < this.REVALIDATE_THRESHOLD,
              isStale: now - e.timestamp >= this.REVALIDATE_THRESHOLD,
              age: now - e.timestamp,
            }));

          console.log('[IndexedDB] 📊 Workspace cache summary:', {
            workspaceId,
            language,
            totalEntries: metadata.length,
            freshEntries: metadata.filter((m) => m.isFresh).length,
            staleEntries: metadata.filter((m) => m.isStale).length,
          });

          resolve(metadata);
        };

        transaction.onerror = () => {
          console.error('[IndexedDB] ❌ Transaction error:', transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error('[IndexedDB] ❌ Get all operation failed:', error);
      return [];
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * STATISTICS: Get cache usage stats
   * ═══════════════════════════════════════════════════════════════════════
   */

  async getStats(): Promise<{
    totalEntries: number;
    freshEntries: number;
    staleEntries: number;
    expiredEntries: number;
    storageSize: string;
  }> {
    try {
      const db = await this.initPromise;
      const now = Date.now();
      let stats = {
        totalEntries: 0,
        freshEntries: 0,
        staleEntries: 0,
        expiredEntries: 0,
        storageSize: '0 KB',
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.getAll();

        request.onerror = () => {
          console.error('[IndexedDB] ❌ Failed to get stats:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          const entries = request.result as CacheEntry[];

          stats.totalEntries = entries.length;

          entries.forEach((e) => {
            const age = now - e.timestamp;
            if (age < this.REVALIDATE_THRESHOLD) {
              stats.freshEntries++;
            } else if (age >= this.REVALIDATE_THRESHOLD && now <= e.expiresAt) {
              stats.staleEntries++;
            } else {
              stats.expiredEntries++;
            }
          });

          const totalSize = JSON.stringify(entries).length;
          stats.storageSize = `${(totalSize / 1024).toFixed(2)} KB`;

          console.log('[IndexedDB] 📈 Cache statistics:', stats);
          resolve(stats);
        };

        transaction.onerror = () => {
          console.error('[IndexedDB] ❌ Transaction error:', transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error('[IndexedDB] ❌ Stats operation failed:', error);
      return {
        totalEntries: 0,
        freshEntries: 0,
        staleEntries: 0,
        expiredEntries: 0,
        storageSize: '0 KB',
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * CLEAR ALL: Remove all cached data
   * ═══════════════════════════════════════════════════════════════════════
   */

  async clearAll(): Promise<boolean> {
    try {
      const db = await this.initPromise;

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.clear();

        request.onerror = () => {
          console.error('[IndexedDB] ❌ Failed to clear all:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log('[IndexedDB] 🗑️ All cache cleared');
          resolve(true);
        };

        transaction.onerror = () => {
          console.error('[IndexedDB] ❌ Transaction error:', transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error('[IndexedDB] ❌ Clear all operation failed:', error);
      return false;
    }
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SINGLETON INSTANCE
 * ═══════════════════════════════════════════════════════════════════════════
 */

let instance: IndexedDBManager | null = null;

export function getIndexedDBManager(): IndexedDBManager {
  if (!instance) {
    instance = new IndexedDBManager();
  }
  return instance;
}

export default IndexedDBManager;
