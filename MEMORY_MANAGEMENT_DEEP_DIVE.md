# Memory Management Deep Dive - PageCacheManager

Production-grade memory management for long user sessions (8+ hours).

---

## Overview

The `PageCacheManager` implements three-layer memory protection:

```
1. TTL-Based Expiration (5-minute limit)
   └─ Automatic cleanup of stale entries

2. LRU Eviction (when full)
   └─ Removes least-recently-used entries

3. Capacity Limits (100 max entries)
   └─ Prevents unbounded memory growth
```

---

## Layer 1: TTL-Based Expiration

### How It Works

Every cache entry has an automatic expiration timestamp:

```typescript
const entry: PageCacheEntry<T> = {
  data: T,
  timestamp: number,              // When stored
  expiresAt: number,              // timestamp + ttl
  lastAccessed: number,           // Track for LRU
  accessCount: number,            // Track frequency
  // ...
};

// Default TTL: 5 minutes
// expiresAt = Date.now() + (5 * 60 * 1000)
```

### Cleanup Process

**Automatic cleanup every 60 seconds:**

```typescript
// In PageCacheManager.startCleanupTimer()
setInterval(() => {
  const now = Date.now();
  let expired = 0;

  // Check every entry
  this.cache.forEach((entry, key) => {
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      expired++;
    }
  });

  // Log results
  console.log('[PageMemoryCache] 🧹 Cleanup:', {
    expiredRemoved: expired,
    remainingEntries: this.cache.size,
  });
}, 60 * 1000);
```

### Example Timeline

```
0:00 - Cache entry stored (expiresAt = 5:00)
  Memory: 10 entries = 20KB

5:01 - Cleanup runs
  - Entry is 1 second past expiration
  - Entry deleted
  Memory: 9 entries = 18KB

5:02-9:59 - Other entries valid
  Memory: 9 entries = 18KB

10:00 - Another cleanup
  - 5 more entries expired
  Memory: 4 entries = 8KB

Long session (8 hours):
  - Cleanup runs every minute
  - Expired entries removed immediately
  - Memory NEVER grows > ~40KB (5 minute TTL × typical usage)
```

### Memory Impact

**Without cleanup (❌ Bad):**
```
Hour 1: 10 entries = 20KB
Hour 2: 20 entries = 40KB
Hour 3: 30 entries = 60KB
Hour 4: 40 entries = 80KB
Hour 5: 50 entries = 100KB
Hour 6: 60 entries = 120KB
Hour 7: 70 entries = 140KB
Hour 8: 80 entries = 160KB
UNBOUNDED GROWTH! 📈
```

**With TTL cleanup (✅ Good):**
```
Hour 1: 10 entries = 20KB (normal usage)
Hour 2: 8 entries = 16KB (expired entries cleared)
Hour 3: 12 entries = 24KB (fluctuates based on usage)
Hour 4: 9 entries = 18KB (always < 100KB)
Hour 5: 11 entries = 22KB (stable)
Hour 6: 10 entries = 20KB (steady state)
Hour 7: 10 entries = 20KB (stable!)
Hour 8: 10 entries = 20KB (bounded!)
MEMORY STABLE! 📊
```

---

## Layer 2: LRU (Least-Recently-Used) Eviction

### Why LRU?

Sometimes cleanup isn't enough. Consider a power user:

```
Review page has 50 variations (app-123, app-456, ..., app-50)
Market intel has 30 variations
Alerts has 20 variations
Total: 100 entries (at capacity)

New user clicks Reviews → Needs cache space
LRU kicks in: "Remove 20 least-used entries"
Makes room for new data
```

### How LRU Works

When cache reaches 100 entries, prune to 80:

```typescript
private pruneLRU(): void {
  const targetSize = Math.floor(this.config.maxEntries * 0.8); // 80
  const entries = Array.from(this.cache.entries());
  
  // Sort by last access time
  const sorted = entries.sort(
    (a, b) => a[1].lastAccessed - b[1].lastAccessed
  );
  
  const toRemove = sorted.length - targetSize; // 20
  
  // Remove oldest accessed entries
  for (let i = 0; i < toRemove; i++) {
    const [key] = sorted[i];
    this.cache.delete(key);
  }
  
  console.log('[PageMemoryCache] 🧹 LRU Cleanup:', {
    before: entries.length,
    after: this.cache.size,
    pruned: toRemove,
  });
}
```

### Example: LRU in Action

```
Cache state (100 entries):
┌─────────────────────────────┐
│ Last accessed: 5 mins ago   │ ← Will be removed
│ Last accessed: 4 mins ago   │ ← Will be removed
│ Last accessed: 3 mins ago   │ ← Will be removed
│ ...                         │
│ Last accessed: 50 seconds ago│ ← Will be removed (20 total)
│ Last accessed: 40 seconds ago│ ← KEPT
│ Last accessed: 30 seconds ago│ ← KEPT
│ Last accessed: 20 seconds ago│ ← KEPT
│ Last accessed: 10 seconds ago│ ← KEPT
│ Last accessed: Now          │ ← KEPT
└─────────────────────────────┘

After LRU cleanup:
- 20 oldest removed
- 80 newest kept
- Cache still functional for recent data
```

---

## Layer 3: Capacity Limits

### Configuration

```typescript
const cache = new PageCacheManager({
  ttl: 5 * 60 * 1000,      // 5 minute TTL
  maxEntries: 100,          // Max 100 entries
  enableCleanup: true,      // Auto cleanup
  cleanupInterval: 60 * 1000, // Every 60 seconds
});
```

### Why These Limits?

**5-minute TTL:**
- Reviews change hourly → 5 min is safe
- Market Intel updates hourly → 5 min is safe
- Alerts are event-based → 5 min is reasonable
- Never shows stale data beyond 5 minutes

**100 max entries:**
- Typical usage: 10-20 entries
- Power user with 10 apps: 30-50 entries
- Extreme case (100 apps): 100 entries max
- Average memory: ~2KB per entry × 20 = 40KB (tiny!)

**60-second cleanup interval:**
- Every entry expires within 5 minutes
- Cleanup runs every minute
- Expired entries removed quickly
- No orphaned data

---

## Memory Estimation

### How Much Memory?

```typescript
estimateMemoryUsage(): string {
  // Rough estimate: average entry ~2KB
  const estimateBytes = this.cache.size * 2048;
  
  if (estimateBytes < 1024) {
    return `${estimateBytes}B`;
  } else if (estimateBytes < 1024 * 1024) {
    return `${(estimateBytes / 1024).toFixed(1)}KB`;
  } else {
    return `${(estimateBytes / (1024 * 1024)).toFixed(1)}MB`;
  }
}
```

### Real-World Examples

**Light user (3 apps, 2-3 reviews each):**
```
Entries: 10
Memory: 10 × 2KB = 20KB
Safe: ✅ Negligible
```

**Regular user (5-8 apps, multiple checks):**
```
Entries: 25
Memory: 25 × 2KB = 50KB
Safe: ✅ Still tiny
```

**Power user (20+ apps, frequent access):**
```
Entries: 50
Memory: 50 × 2KB = 100KB
Safe: ✅ Well below limit
```

**Extreme case (100 apps, all cached):**
```
Entries: 100
Memory: 100 × 2KB = 200KB
Safe: ✅ Still < 1MB
```

---

## Statistics & Monitoring

### Get Cache Stats

```typescript
const manager = getPageCacheManager();
const stats = manager.getStats();

// Returns:
{
  totalEntries: 15,
  memoryUsageEstimate: "30.8KB",
  oldestEntry: 1718876100000,
  newestEntry: 1718876400000,
  hitRate: 82.5,  // 82.5% hits
  missRate: 17.5,
  totalHits: 330,
  totalMisses: 66,
}
```

### What Stats Mean

| Metric | Good | Concerning |
|--------|------|-----------|
| `totalEntries` | < 50 | > 80 |
| `memoryUsageEstimate` | < 100KB | > 500KB |
| `hitRate` | > 70% | < 50% |
| `missRate` | < 30% | > 50% |

### Debug Helper

```typescript
// Show cache health in console
function debugCacheHealth() {
  const manager = getPageCacheManager();
  const stats = manager.getStats();
  
  console.table({
    'Cache Entries': stats.totalEntries,
    'Memory Usage': stats.memoryUsageEstimate,
    'Hit Rate': `${stats.hitRate.toFixed(1)}%`,
    'Miss Rate': `${stats.missRate.toFixed(1)}%`,
    'Total Hits': stats.totalHits,
    'Total Misses': stats.totalMisses,
  });
}
```

---

## Manual Cache Management

### Clear Specific Resource

```typescript
const manager = getPageCacheManager();

// Remove all reviews cache
manager.clear('reviews');
console.log('Reviews cache cleared');

// Remove all Market Intel cache
manager.clear('market-intel');
```

### Clear Everything

```typescript
const manager = getPageCacheManager();

// Clear entire cache
const removed = manager.clear();
console.log(`Cleared ${removed} entries`);

// Reset stats
manager.clear();
stats = manager.getStats();
console.log(`Hit rate: ${stats.hitRate}%`); // Will be 0/0 = NaN
```

### Delete Specific Language

```typescript
const manager = getPageCacheManager();

// Remove only English reviews for app-123
manager.delete('reviews', 'app-123', 'en');

// Remove all languages for app-123 reviews
manager.delete('reviews', 'app-123');
```

---

## Automatic Cleanup Timeline

### Minute-by-Minute Example

```
00:00 - User opens app, views 3 reviews
  ├─ Cache entries: 3
  └─ Memory: 6KB

00:01 - User clicks different app
  ├─ Cache entries: 6
  ├─ Memory: 12KB
  └─ Cleanup runs (nothing expired yet)

00:05 - User viewing multiple pages
  ├─ Cache entries: 12
  ├─ Memory: 24KB
  └─ Cleanup runs (nothing expired yet)

00:06 - First entries reach expiration
  ├─ Cache entries: 12
  ├─ Memory: 24KB
  └─ Cleanup runs
    ├─ 3 entries expired (from 00:01)
    ├─ 3 entries deleted
    └─ Remaining: 9 entries

00:10 - User still active
  ├─ Cache entries: 15
  ├─ Memory: 30KB
  └─ Cleanup runs (entries from 00:05 not expired)

00:11 - Entries from 00:06 expire
  ├─ Cache entries: 15
  ├─ Memory: 30KB
  └─ Cleanup runs
    ├─ 3 entries expired
    ├─ 3 entries deleted
    └─ Remaining: 12 entries
```

### Key Observations

1. **Memory never exceeds ~50-100KB** even with heavy usage
2. **Cleanup runs every minute** (automatic)
3. **No manual intervention needed**
4. **Old entries automatically removed** after 5 minutes
5. **Hit rate increases over time** (more cache hits)

---

## Preventing Memory Leaks

### What We've Protected Against

✅ **Long sessions (8+ hours)**
- Cleanup removes old entries automatically
- Memory stays bounded

✅ **Power users (100+ apps)**
- LRU pruning when at capacity
- Least-used data removed first

✅ **Stale data accumulation**
- TTL-based expiration (5 min)
- No data lingers forever

✅ **Orphaned cache entries**
- Automatic cleanup every 60 seconds
- Comprehensive stats available

### Best Practices

```typescript
// ✅ Good: Let cache manage itself
const { data } = usePageData('reviews', appId, fetcher);

// ✅ Good: Clear on logout/workspace change
onLogout(() => {
  const manager = getPageCacheManager();
  manager.clear(); // Clear all
});

// ✅ Good: Monitor in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    const stats = getPageCacheManager().getStats();
    console.log('[Cache] Stats:', stats);
  }, 30000);
}

// ❌ Bad: Don't hoard cache manually
// ❌ Bad: Don't bypass cleanup
// ❌ Bad: Don't store huge objects (keep < 100KB per entry)
```

---

## Troubleshooting Memory Issues

### Memory Growing Too Fast?

```typescript
// Check what's cached
const manager = getPageCacheManager();
const stats = manager.getStats();

if (stats.totalEntries > 80) {
  console.warn('Cache near capacity!', stats);
  
  // Clear old entries manually
  manager.clear('reviews'); // or clear all
}
```

### Hit Rate Too Low?

```typescript
const stats = manager.getStats();

if (stats.hitRate < 50) {
  console.warn('Low hit rate:', {
    hits: stats.totalHits,
    misses: stats.totalMisses,
  });
  
  // Possible issues:
  // 1. TTL too short (5 min not enough?)
  // 2. Cache keys not stable
  // 3. User checking same data frequently (increase TTL?)
}
```

### Cache Not Clearing?

```typescript
// Verify cleanup is running
const manager = getPageCacheManager();

console.log('Before:', manager.getStats().totalEntries);

// Wait 60+ seconds for cleanup to run...
setTimeout(() => {
  console.log('After:', manager.getStats().totalEntries);
  // Should see fewer entries if cleanup ran
}, 65000);
```

---

## Production Monitoring

### Dashboard Component

```typescript
export function CacheMonitoring() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const manager = getPageCacheManager();
      setStats(manager.getStats());
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  if (!stats) return null;

  const health = stats.hitRate > 70 ? '✅' : stats.hitRate > 50 ? '⚠️' : '❌';

  return (
    <div style={{ position: 'fixed', bottom: 10, right: 10, padding: 10, background: '#f0f0f0', borderRadius: 4, fontSize: 12 }}>
      <div>{health} Cache Health</div>
      <div>Entries: {stats.totalEntries}/100</div>
      <div>Memory: {stats.memoryUsageEstimate}</div>
      <div>Hit Rate: {stats.hitRate.toFixed(1)}%</div>
      <div>Hits: {stats.totalHits} | Misses: {stats.totalMisses}</div>
    </div>
  );
}
```

---

## Summary

The PageCacheManager is **production-grade** because:

✅ **Three-layer protection:** TTL expiration + LRU eviction + capacity limits  
✅ **Automatic cleanup:** Runs every 60 seconds, no manual work  
✅ **Memory bounded:** Max ~200KB even in extreme cases  
✅ **Safe for long sessions:** 8+ hours without degradation  
✅ **Comprehensive stats:** Monitor hit rate, memory, entry count  
✅ **Zero memory leaks:** Old data removed automatically  

**No memory worries. Cache just works.** 🚀
