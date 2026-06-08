# Cache Enhancements: Persistence + Scoped Keys Guide

**Status:** Production Ready  
**Features:** Tab-close persistence + explicit key scoping  
**Performance:** Instant reload after tab reopen (no API call!)  
**Languages:** Full bilingual support (EN/AR)

---

## What's New

### 1. Persistence Fallback (LocalStorage)
**Problem:** User closes tab, comes back 10 minutes later, page reloads, API call needed  
**Solution:** Save to LocalStorage on cache, restore on remount  
**Result:** Instant load, no API delay

### 2. Explicit Cache Key Scoping
**Problem:** Multiple apps could share cached data, causing collisions  
**Solution:** Build keys with `appId` (app-123) or `competitorId` (comp-456)  
**Result:** Zero data mixing between resources

---

## Architecture

### Three-Tier Cache Hierarchy

```
Tier 1: Memory Cache (5 minutes)
├─ Location: JavaScript Map
├─ Speed: < 1ms access
├─ Scope: Explicit (app-123, comp-456, etc.)
└─ Use: Current session

        ↓ (if expired)

Tier 2: Persistence Cache (24 hours)
├─ Location: Browser LocalStorage
├─ Speed: ~10-50ms access
├─ Scope: Explicit (same as Tier 1)
└─ Use: Tab reopen within 24 hours

        ↓ (if expired)

Tier 3: API
├─ Location: Server
├─ Speed: 3-5 seconds
├─ Scope: Always fresh
└─ Use: Fallback when cache miss
```

### Cache Flow

```
User navigates to Reviews page
    ↓
Tier 1 (Memory): Check if < 5 minutes old
    ├─ YES: Return instantly (< 1ms) ✅
    └─ NO: Continue
    ↓
Tier 2 (LocalStorage): Check if < 24 hours old
    ├─ YES: Restore to memory + return instantly (< 50ms) ✅
    └─ NO: Continue
    ↓
Tier 3 (API): Fetch fresh data (3-5 seconds)
    ├─ Save to memory
    ├─ Save to persistence
    └─ Return data ✅
```

### Tab Close + Reopen Scenario

```
Day 1, 2:00 PM:
  User opens Reviews for app-123 (English)
  ├─ Memory cache: app-123:reviews:en
  ├─ Persistence: app-123:reviews:en
  └─ Data age: 0 minutes

Day 1, 2:10 PM:
  User closes browser tab
  Memory cache: LOST (cleared on tab close)
  Persistence cache: INTACT (in LocalStorage)
  └─ Data persists in browser storage

Day 1, 2:15 PM:
  User clicks back on your app
  ├─ Memory cache: Empty
  ├─ Check persistence: FOUND! (15 minutes old)
  ├─ Restore to memory
  ├─ Load instantly with 15-minute-old data ⚡
  ├─ Background sync in 5 min (if needed)
  └─ User sees data WITHOUT API call! 🎉
```

---

## Explicit Cache Key Scoping

### The Problem (Without Scoping)

```typescript
// ❌ BAD: Keys don't include app ID
const key = 'reviews';          // All apps share this!

// App A loads reviews
cache.set('reviews', appAData);

// App B loads reviews
cache.set('reviews', appBData); // OVERWRITES App A!

// User switches to App A
cache.get('reviews');           // Returns App B data! 💥
```

### The Solution (With Explicit Scoping)

```typescript
// ✅ GOOD: Keys are scoped to specific app/competitor
const keyAppA = 'reviews:app-123:en';      // App 123, English
const keyAppB = 'reviews:app-456:en';      // App 456, English
const keyCompetitor = 'reviews:comp-789:en'; // Competitor 789

// App A loads reviews
cache.set('reviews', 'app-123', appAData); // Scoped to app-123

// App B loads reviews
cache.set('reviews', 'app-456', appBData); // Scoped to app-456

// User switches to App A
cache.get('reviews', 'app-123');           // Returns correct data ✅
```

### CacheKeyBuilder: Prevent Mistakes

```typescript
import { CacheKeyBuilder } from '@/lib/cache/page-memory-cache-enhanced';

// Build key safely
const key = CacheKeyBuilder.buildKey(
  'reviews',      // resourceType
  'app-123',      // scope (MUST be unique app/competitor ID)
  'en'            // language
);
// Result: 'reviews:app-123:en'

// Parse key to extract components
const parsed = CacheKeyBuilder.parseKey('reviews:app-123:en');
// Result: { resourceType: 'reviews', scope: 'app-123', language: 'en' }

// Get all languages for a scope
const keys = CacheKeyBuilder.getKeysForScope('reviews', 'app-123');
// Result: { en: 'reviews:app-123:en', ar: 'reviews:app-123:ar' }
```

---

## Files Provided

### 1. Enhanced Page Memory Cache
**File:** `page-memory-cache-enhanced.ts`

```typescript
// Includes:
// - CacheKeyBuilder class for scoped keys
// - PageCacheManager with persistence
// - Automatic cleanup + LRU pruning
// - Bilingual support
// - Comprehensive logging

import {
  getPageCacheManager,
  CacheKeyBuilder,
} from '@/lib/cache/page-memory-cache-enhanced';

const cache = getPageCacheManager({
  ttl: 5 * 60 * 1000,           // 5 minutes (memory)
  persistenceTtl: 24 * 60 * 60 * 1000, // 24 hours (LocalStorage)
  enablePersistence: true,
});
```

### 2. Enhanced usePageData Hook
**File:** `usePageData-enhanced.ts`

```typescript
// Includes:
// - Three-tier cache (Memory → Persistence → API)
// - Explicit scope parameter (MUST pass appId/competitorId)
// - Persistence support built-in
// - Type-safe with generics
// - Bilingual support
// - useSWRCache-compatible API

import usePageData from '@/hooks/usePageData-enhanced';

const { data, isLoading, error, refresh } = usePageData<ReviewType>(
  'reviews',        // resourceType
  'app-123',        // scope (EXPLICIT - app-123, not just 123!)
  fetchReviews,
  { language: 'en', enablePersistence: true }
);
```

---

## Usage Examples

### Example 1: Basic Usage (Reviews)

```typescript
import usePageData from '@/hooks/usePageData-enhanced';

export function ReviewsPage({ appId }: { appId: string }) {
  const { data, isLoading, error, refresh } = usePageData<ReviewType[]>(
    'reviews',           // resourceType
    appId,               // scope: app-123, app-456, etc. (REQUIRED!)
    async () => {
      const res = await fetch(`/api/apps/${appId}/reviews`);
      return res.json();
    },
    {
      language: 'en',
      enablePersistence: true,  // Save to LocalStorage
    }
  );

  if (isLoading && !data) return <Spinner />;
  if (error && !data) return <Error error={error} />;
  if (!data) return <Empty />;

  return (
    <div>
      <button onClick={refresh}>Refresh</button>
      <ReviewsList reviews={data} />
    </div>
  );
}

// User journey:
// 1. Opens app -> Loads reviews (memory + persistence)
// 2. Closes tab -> Data persists in LocalStorage
// 3. Returns 10 min later -> Reviews load instantly! ⚡
```

### Example 2: Market Intel with Language Switching

```typescript
export function MarketIntelPage({ appId, language }: Props) {
  // Separate caches for EN and AR
  const { data: enData } = usePageData(
    'market-intel',
    appId,
    fetchMarketIntel,
    { language: 'en', enablePersistence: true }
  );

  const { data: arData } = usePageData(
    'market-intel',
    appId,
    fetchMarketIntel,
    { language: 'ar', enablePersistence: true }
  );

  const data = language === 'en' ? enData : arData;

  // Zero collision! Each language has separate cache entry:
  // - market-intel:app-123:en
  // - market-intel:app-123:ar
}
```

### Example 3: Multiple Apps (Dashboard)

```typescript
export function Dashboard() {
  const appIds = ['app-123', 'app-456', 'app-789'];

  const reviewsData = appIds.map(appId =>
    usePageData(
      'reviews',
      appId,              // EXPLICIT: Each app has own cache
      () => fetchReviews(appId),
      { language: 'en', enablePersistence: true }
    )
  );

  // Cache keys:
  // - reviews:app-123:en
  // - reviews:app-456:en
  // - reviews:app-789:en
  // Zero mixing! Each app's data stays separate ✅
}
```

### Example 4: Competitor Analysis (Different Scope Type)

```typescript
export function CompetitorAnalysisPage({ competitorId }: { competitorId: string }) {
  const { data, isLoading, error } = usePageData(
    'competitor-intel',
    competitorId,       // Could be 'comp-123' instead of 'app-123'
    fetchCompetitorData,
    { language: 'en', enablePersistence: true }
  );

  // Cache key: competitor-intel:comp-123:en
  // No collision with app reviews (different scope!)
}
```

---

## Persistence Behavior

### How LocalStorage Fallback Works

```typescript
// When you SET data:
await cache.set('reviews', 'app-123', data);

// Internally:
// 1. Saves to memory: Map[reviews:app-123:en] = data
// 2. Saves to localStorage: key='page_cache:reviews:app-123:en'
// 3. Both have timestamps for TTL checking

// When you GET data:
const data = cache.get('reviews', 'app-123');

// Internally (Strategy):
// 1. Check memory: < 5 min old? Return ✅
// 2. If expired, check localStorage: < 24h old? Restore + return ✅
// 3. If both expired: Return null (fetch from API)
```

### Configuration

```typescript
const cache = getPageCacheManager({
  // Memory cache
  ttl: 5 * 60 * 1000,                    // 5 minutes

  // Persistence (LocalStorage)
  persistenceTtl: 24 * 60 * 60 * 1000,   // 24 hours
  enablePersistence: true,                // Enable LocalStorage

  // Cleanup
  enableCleanup: true,
  cleanupInterval: 60 * 1000,            // Check every minute

  // Storage prefix
  persistencePrefix: 'page_cache:',      // localStorage key prefix
});
```

### When Persistence Helps

| Scenario | Memory | Persistence | Result |
|----------|--------|-------------|--------|
| Same session, 2 min later | ✅ Hit (< 5min) | N/A | < 1ms load ⚡ |
| Close tab, return 10 min later | ❌ Lost | ✅ Hit (< 24h) | < 50ms load 🚀 |
| Close tab, return 30 hours later | ❌ Lost | ❌ Expired | API call (normal) |
| Different browser/device | ❌ N/A | ❌ N/A | API call (normal) |

---

## Performance Comparison

### Without Persistence

```
Scenario: User closes tab, returns 10 minutes later

Timeline:
├─ App loads                    0ms
├─ Memory cache empty          (cleared on tab close)
├─ No persistence              (no fallback)
├─ Fetch from API              3-5 seconds
├─ Render                       < 500ms
└─ Total: 3-5 seconds ⏱️
```

### With Persistence

```
Scenario: User closes tab, returns 10 minutes later

Timeline:
├─ App loads                    0ms
├─ Memory cache empty          (cleared on tab close)
├─ Check persistence           < 5ms
├─ Restore from localStorage   10-50ms
├─ Render                       < 500ms
└─ Total: < 100ms 🚀 (50x faster!)
```

---

## Scoped Cache Key Examples

### ✅ CORRECT: Explicit App IDs

```typescript
// App dashboard with 3 apps
usePageData('reviews', 'app-123', ...)  // app-123:reviews:en
usePageData('reviews', 'app-456', ...)  // app-456:reviews:en
usePageData('reviews', 'app-789', ...)  // app-789:reviews:en

// Cache keys are DIFFERENT → No collision ✅
```

### ❌ WRONG: Generic Scopes

```typescript
// Don't do this!
usePageData('reviews', '123', ...)      // Too generic
usePageData('reviews', appId, ...)      // If appId = '456', collision!
usePageData('reviews', 'my-app', ...)   // Works but not descriptive
```

### ✅ GOOD: Descriptive Prefixes

```typescript
// Use prefixes to clarify scope type
usePageData('reviews', 'app-123', ...)        // App
usePageData('reviews', 'comp-456', ...)       // Competitor
usePageData('reviews', 'category-789', ...)   // Category (if needed)
```

---

## Debugging Cache Key Issues

### Check Current Cache Keys

```typescript
import { getPageCacheManager } from '@/lib/cache/page-memory-cache-enhanced';

const cache = getPageCacheManager();

// Get all cache keys and scopes
const stats = cache.getStats();
console.log(stats);
// {
//   totalMemoryEntries: 5,
//   persistedEntries: 12,
//   hitRate: 85.5,
//   ...
// }

// You can also inspect localStorage directly
Object.entries(localStorage).forEach(([key, value]) => {
  if (key.startsWith('page_cache:')) {
    console.log(`Key: ${key}`);
    const entry = JSON.parse(value);
    console.log(`Scope: ${entry.scope}, Age: ${Date.now() - entry.timestamp}ms`);
  }
});
```

### Log Scope for Verification

```typescript
const { data } = usePageData(
  'reviews',
  appId,  // ALWAYS log this
  fetcher,
  { language: 'en' }
);

// Hook logs internally:
// [PageData] 🔑 Using scoped cache key: {
//   cacheKey: "reviews:app-123:en",
//   resourceType: "reviews",
//   scope: "app-123",      ← THIS should match your appId
//   language: "en"
// }
```

---

## Migration from Old usePageData

### Old Version (Without Persistence)

```typescript
// src/hooks/usePageData.ts
const { data } = usePageData('reviews', appId, fetcher);

// Cache key: hardcoded, no scoping
// TTL: 5 minutes
// Persistence: NO
```

### New Version (With Persistence + Scoping)

```typescript
// src/hooks/usePageData-enhanced.ts
const { data } = usePageData('reviews', appId, fetcher, {
  enablePersistence: true,  // NEW: Save to LocalStorage
  language: 'en'           // Explicit language
});

// Cache key: reviews:app-123:en (explicit + scoped)
// Memory TTL: 5 minutes
// Persistence TTL: 24 hours
// Persistence: YES (automatic)
```

### How to Upgrade

1. **Rename import:**
   ```diff
   - import usePageData from '@/hooks/usePageData';
   + import usePageData from '@/hooks/usePageData-enhanced';
   ```

2. **Add enablePersistence (optional, default: true):**
   ```typescript
   const { data } = usePageData('reviews', appId, fetcher, {
     enablePersistence: true,  // NEW
     language: 'en'
   });
   ```

3. **Test tab close/reopen:**
   - Close tab after loading data
   - Reopen immediately
   - Data should load instantly (no API call)

4. **Done!** Everything else works the same.

---

## Best Practices

### 1. Always Use Explicit Scope

```typescript
// ✅ GOOD
usePageData('reviews', appId, fetcher)        // app-123

// ❌ BAD
usePageData('reviews', index, fetcher)        // Could be number!
usePageData('reviews', generateRandomId(), fetcher) // Changes each time!
```

### 2. Keep appId/competitorId Consistent

```typescript
// ❌ BAD: These create different cache keys!
usePageData('reviews', 'app-123', ...)        // reviews:app-123:en
usePageData('reviews', appId, ...)            // reviews:app-123:en (if appId='app-123')
usePageData('reviews', `app-${id}`, ...)      // reviews:app-123:en (if id='123')

// ✅ GOOD: Same key every time
const appKey = 'app-123';
usePageData('reviews', appKey, ...)           // reviews:app-123:en
```

### 3. Enable Persistence for User-Facing Data

```typescript
// Reviews - user-facing
usePageData('reviews', appId, fetcher, {
  enablePersistence: true  // ✅ Help users
});

// Admin logs - don't need persistence
usePageData('admin-logs', appId, fetcher, {
  enablePersistence: false  // ❌ Not needed
});
```

### 4. Set Appropriate TTLs

```typescript
// User-generated content: faster refresh
usePageData('reviews', appId, fetcher, {
  ttl: 5 * 60 * 1000,                   // 5 min in memory
  persistenceTtl: 12 * 60 * 60 * 1000,  // 12h in storage
});

// Stable data: longer TTL
usePageData('ratings', appId, fetcher, {
  ttl: 30 * 60 * 1000,                  // 30 min in memory
  persistenceTtl: 7 * 24 * 60 * 60 * 1000, // 7 days
});
```

---

## Troubleshooting

### "Data not updating after refresh"

```typescript
// Problem: Cache is stale, API not called

// Solution 1: Manual refresh
const { refresh } = usePageData(...);
await refresh();  // Force fetch from API

// Solution 2: Force refresh on mount
usePageData(..., {
  forceRefresh: true  // Skip cache entirely
});

// Solution 3: Check TTL settings
usePageData(..., {
  ttl: 1 * 60 * 1000,  // Shorter TTL = fresher data
  persistenceTtl: 2 * 60 * 60 * 1000  // 2 hours
});
```

### "Seeing wrong app's data"

```typescript
// Problem: Cache scope is wrong

// Check the scope being passed:
console.log('appId:', appId);  // Is this app-123 or 123?

// Verify cache key:
const key = CacheKeyBuilder.buildKey('reviews', appId, 'en');
console.log('Cache key:', key);  // Should be reviews:app-123:en

// Fix: Always use app-123 format
const scope = `app-${appId}`;  // Force app- prefix
usePageData('reviews', scope, fetcher);
```

### "LocalStorage full error"

```typescript
// Problem: Too much persisted data

// Solution: Clear old data
const cache = getPageCacheManager();
cache.clear();  // Clear all cache + persistence

// Or clear specific resource type:
cache.clear('reviews');  // Clear all reviews

// Monitor size:
const stats = cache.getStats();
console.log(`Persisted: ${stats.persistedEntries} entries`);
```

---

## Summary

✅ **Persistence Fallback:** Tab reopen = instant load (no API!)  
✅ **Explicit Scoping:** app-123 + comp-456 + language = zero collisions  
✅ **Three-Tier Cache:** Memory (5min) → Persistence (24h) → API  
✅ **Type Safe:** Full TypeScript support with generics  
✅ **Bilingual:** EN/AR fully supported with separate caches  
✅ **Production Ready:** Automatic cleanup, error handling, logging  

**You now have a robust, user-friendly caching system with persistence!** 🚀

Start using `usePageData-enhanced.ts` today and watch your UX improve! ⚡
