# Staging Vault Service - Implementation Examples

Real-world examples for integrating the unified cache system across all platform services.

---

## 1. Keyword API Service Integration

Sync keyword data from your API to local cache:

```typescript
// src/services/keyword-api-service.ts
import { getStagingVaultService } from '@/services/staging-vault-service';
import type { KeywordData } from '@/lib/db/db';

export class KeywordAPIService {
  private vaultService = getStagingVaultService();

  /**
   * Fetch keywords from API and sync to local cache
   */
  async fetchAndCacheKeywords(
    appId: string,
    language: 'en' | 'ar'
  ): Promise<KeywordData[]> {
    try {
      // Fetch from API
      const response = await fetch(
        `/api/apps/${appId}/keywords?language=${language}`
      );
      const keywords = await response.json();

      // Transform API response to KeywordData format
      const keywordDataArray: KeywordData[] = keywords.map((kw: any) => ({
        id: `keyword:${language}:${appId}:${kw.keyword}`,
        keyword: kw.keyword,
        appId,
        language,
        difficulty: kw.difficulty,
        searchVolume: kw.searchVolume,
        cpc: kw.cpc,
        trend: kw.trend,
        competition: kw.competition,
        opportunity: calculateOpportunity(kw),
        lastUpdated: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7-day TTL
      }));

      // Sync to cache (batch for performance)
      const syncResult = await this.vaultService.batchSync(
        'keyword_data',
        keywordDataArray,
        {
          language,
          batchSize: 100,
          retries: 3,
          enableLogging: true,
        }
      );

      if (!syncResult.success) {
        console.warn('Partial sync failure:', syncResult.error);
      }

      console.log(
        `✅ Cached ${syncResult.itemsProcessed} keywords in ${syncResult.duration.toFixed(2)}ms`
      );

      return keywordDataArray;
    } catch (error) {
      console.error('❌ Failed to fetch and cache keywords:', error);
      throw error;
    }
  }

  /**
   * Get keywords from cache with fallback to API
   */
  async getKeywords(
    appId: string,
    language: 'en' | 'ar',
    options?: { forceRefresh?: boolean }
  ): Promise<KeywordData[]> {
    try {
      // Check cache first
      if (!options?.forceRefresh) {
        const cached = await this.vaultService.query(
          'keyword_data',
          'by-appId-language',
          [appId, language],
          { language }
        );

        if (cached && cached.length > 0) {
          console.log(`📦 Returning ${cached.length} cached keywords`);
          return cached as KeywordData[];
        }
      }

      // Cache miss or force refresh - fetch from API
      console.log('📡 Fetching keywords from API...');
      return await this.fetchAndCacheKeywords(appId, language);
    } catch (error) {
      console.error('❌ Error getting keywords:', error);
      throw error;
    }
  }

  /**
   * Search specific keyword in cache
   */
  async getKeyword(
    appId: string,
    keyword: string,
    language: 'en' | 'ar'
  ): Promise<KeywordData | null> {
    const key = `keyword:${language}:${appId}:${keyword}`;
    const data = await this.vaultService.retrieve('keyword_data', key, {
      language,
    });
    return (data as KeywordData) || null;
  }
}

// Usage
const keywordService = new KeywordAPIService();

// Fetch and cache all keywords
const keywords = await keywordService.fetchAndCacheKeywords('app-123', 'en');

// Get from cache (or API if not cached)
const cachedKeywords = await keywordService.getKeywords('app-123', 'ar');

// Get single keyword
const specific = await keywordService.getKeyword('app-123', 'react', 'en');
```

---

## 2. Review Management Service Integration

Sync review data with sentiment analysis:

```typescript
// src/services/review-management-service.ts
import { getStagingVaultService } from '@/services/staging-vault-service';
import type { ReviewLog } from '@/lib/db/db';

export class ReviewManagementService {
  private vaultService = getStagingVaultService();

  /**
   * Fetch reviews from API and sync with sentiment analysis
   */
  async fetchAndCacheReviews(
    appId: string,
    language: 'en' | 'ar'
  ): Promise<ReviewLog[]> {
    try {
      // Fetch reviews from API
      const response = await fetch(
        `/api/apps/${appId}/reviews?language=${language}`
      );
      const reviews = await response.json();

      // Transform and analyze sentiment
      const reviewLogs: ReviewLog[] = reviews.map((review: any) => {
        const sentiment = analyzeSentiment(review.body);

        return {
          id: `review:${appId}:${review.id}:${language}`,
          appId,
          reviewId: review.id,
          rating: review.rating,
          title: review.title,
          body: review.body,
          author: review.author,
          sentiment: sentiment.label,
          sentimentScore: sentiment.score,
          language,
          createdAt: new Date(review.createdAt).getTime(),
          analyzedAt: Date.now(),
          tags: extractTags(review.body, sentiment),
          isArchived: false,
        };
      });

      // Sync to cache (batch for bulk reviews)
      const syncResult = await this.vaultService.batchSync(
        'review_logs',
        reviewLogs,
        {
          language,
          batchSize: 200, // Reviews are larger, bigger batches
          retries: 3,
        }
      );

      console.log(
        `✅ Cached ${syncResult.itemsProcessed} reviews (${syncResult.itemsProcessed} positive, ...)`
      );

      return reviewLogs;
    } catch (error) {
      console.error('❌ Failed to fetch and cache reviews:', error);
      throw error;
    }
  }

  /**
   * Get reviews filtered by sentiment
   */
  async getReviewsBySentiment(
    appId: string,
    sentiment: 'positive' | 'neutral' | 'negative',
    language: 'en' | 'ar'
  ): Promise<ReviewLog[]> {
    // First get all reviews for this app
    const allReviews = await this.vaultService.query(
      'review_logs',
      'by-appId-language',
      [appId, language],
      { language }
    );

    // Filter by sentiment (can also add index query if preferred)
    return (allReviews as ReviewLog[]).filter(
      (r) => r.sentiment === sentiment
    );
  }

  /**
   * Archive review and sync to cache
   */
  async archiveReview(
    appId: string,
    reviewId: string,
    language: 'en' | 'ar'
  ): Promise<boolean> {
    const key = `review:${appId}:${reviewId}:${language}`;

    // Get current review
    const review = await this.vaultService.retrieve<ReviewLog>(
      'review_logs',
      key,
      { language }
    );

    if (!review) {
      console.warn('Review not found:', key);
      return false;
    }

    // Update archive status
    review.isArchived = true;

    // Sync update back to cache
    const result = await this.vaultService.sync('review_logs', review, {
      language,
    });

    return result.success;
  }

  /**
   * Get sentiment breakdown for app
   */
  async getSentimentBreakdown(
    appId: string,
    language: 'en' | 'ar'
  ): Promise<{ positive: number; neutral: number; negative: number }> {
    const allReviews = await this.vaultService.query(
      'review_logs',
      'by-appId-language',
      [appId, language],
      { language }
    );

    const breakdown = (allReviews as ReviewLog[]).reduce(
      (acc, review) => {
        acc[review.sentiment]++;
        return acc;
      },
      { positive: 0, neutral: 0, negative: 0 }
    );

    return breakdown;
  }
}

// Usage
const reviewService = new ReviewManagementService();

// Fetch and cache all reviews
const reviews = await reviewService.fetchAndCacheReviews('app-123', 'en');

// Get positive reviews only
const positive = await reviewService.getReviewsBySentiment(
  'app-123',
  'positive',
  'ar'
);

// Get sentiment breakdown
const breakdown = await reviewService.getSentimentBreakdown('app-123', 'en');
console.log(`Positive: ${breakdown.positive}, Negative: ${breakdown.negative}`);

// Archive a review
await reviewService.archiveReview('app-123', 'review-456', 'en');
```

---

## 3. Ranking Alert Service Integration

Sync rank snapshots for alert triggering:

```typescript
// src/services/ranking-alert-service.ts
import { getStagingVaultService } from '@/services/staging-vault-service';
import type { RankSnapshot } from '@/lib/db/db';

export class RankingAlertService {
  private vaultService = getStagingVaultService();

  /**
   * Record rank snapshot and check for alerts
   */
  async recordAndCheckRankSnapshot(
    appId: string,
    keyword: string,
    position: number,
    language: 'en' | 'ar'
  ): Promise<{ shouldAlert: boolean; reason?: string }> {
    try {
      // Get previous rank
      const previousSnapshots = await this.vaultService.query(
        'rank_snapshots',
        'by-appId-timestamp',
        [appId, Date.now() - 24 * 60 * 60 * 1000], // Last 24 hours
        { language }
      );

      const lastSnapshot = (previousSnapshots as RankSnapshot[])
        .filter((s) => s.keyword === keyword)
        .sort((a, b) => b.timestamp - a.timestamp)[0];

      const changeFromLast = lastSnapshot ? lastSnapshot.position - position : 0;

      // Create new snapshot
      const snapshot: RankSnapshot = {
        id: `rank:${appId}:${keyword}:${Date.now()}`,
        appId,
        keyword,
        position,
        category: 'productivity', // Example, should come from data
        device: 'mobile',
        country: 'US',
        language,
        timestamp: Date.now(),
        recordedAt: Date.now(),
        changeFromLast,
        trendDays7: this.calculateTrend(appId, keyword, 7),
        trendDays30: this.calculateTrend(appId, keyword, 30),
      };

      // Sync snapshot to cache
      await this.vaultService.sync('rank_snapshots', snapshot, { language });

      // Check for alerts
      return this.checkAlertConditions(snapshot, lastSnapshot);
    } catch (error) {
      console.error('❌ Failed to record rank snapshot:', error);
      throw error;
    }
  }

  /**
   * Check if rank change should trigger alert
   */
  private checkAlertConditions(
    current: RankSnapshot,
    previous: RankSnapshot | undefined
  ): { shouldAlert: boolean; reason?: string } {
    // Alert if broke into top 10
    if (current.position <= 10 && (!previous || previous.position > 10)) {
      return {
        shouldAlert: true,
        reason: `🎉 Keyword "${current.keyword}" entered top 10!`,
      };
    }

    // Alert if dropped out of top 10
    if (current.position > 10 && previous && previous.position <= 10) {
      return {
        shouldAlert: true,
        reason: `⚠️ Keyword "${current.keyword}" dropped out of top 10`,
      };
    }

    // Alert if jumped 5+ positions up
    if (previous && previous.position - current.position >= 5) {
      return {
        shouldAlert: true,
        reason: `📈 Keyword "${current.keyword}" jumped ${previous.position - current.position} positions!`,
      };
    }

    // Alert if dropped 5+ positions
    if (previous && current.position - previous.position >= 5) {
      return {
        shouldAlert: true,
        reason: `📉 Keyword "${current.keyword}" dropped ${current.position - previous.position} positions`,
      };
    }

    return { shouldAlert: false };
  }

  /**
   * Get ranking history for keyword
   */
  async getRankingHistory(
    appId: string,
    keyword: string,
    days: number = 30
  ): Promise<RankSnapshot[]> {
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const snapshots = await this.vaultService.query(
      'rank_snapshots',
      'by-keyword',
      keyword,
      {}
    );

    return (snapshots as RankSnapshot[])
      .filter(
        (s) => s.appId === appId && s.timestamp >= cutoffTime
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private calculateTrend(
    appId: string,
    keyword: string,
    days: number
  ): 'up' | 'down' | 'stable' {
    // Simplified - would fetch actual history
    return 'stable';
  }
}

// Usage
const alertService = new RankingAlertService();

// Record daily rank check
const alert = await alertService.recordAndCheckRankSnapshot(
  'app-123',
  'react',
  3,
  'en'
);

if (alert.shouldAlert) {
  console.log('🚨 ALERT:', alert.reason);
  // Send notification to user
}

// Get ranking history
const history = await alertService.getRankingHistory('app-123', 'react', 30);
console.log(`${history.length} rank snapshots in last 30 days`);
```

---

## 4. Competitor Analysis Service Integration

```typescript
// src/services/competitor-analysis-service.ts
import { getStagingVaultService } from '@/services/staging-vault-service';
import type { CompetitorData } from '@/lib/db/db';

export class CompetitorAnalysisService {
  private vaultService = getStagingVaultService();

  /**
   * Analyze competitor and sync to cache
   */
  async analyzeAndCacheCompetitor(
    competitorId: string,
    language: 'en' | 'ar'
  ): Promise<CompetitorData> {
    try {
      // Fetch competitor data from API
      const response = await fetch(
        `/api/competitors/${competitorId}/analysis?language=${language}`
      );
      const data = await response.json();

      // Transform to CompetitorData
      const competitorData: CompetitorData = {
        id: `competitor:${competitorId}:${language}`,
        competitorId,
        appName: data.appName,
        appIcon: data.appIcon,
        category: data.category,
        language,
        downloadEstimate: data.downloads,
        ratingValue: data.rating,
        ratingCount: data.ratingCount,
        keywords: data.keywords,
        topKeywords: data.topKeywords,
        marketShare: data.marketShare,
        strengths: data.strengths,
        weaknesses: data.weaknesses,
        lastAnalyzed: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7-day TTL
      };

      // Sync to cache
      await this.vaultService.sync('competitor_data', competitorData, {
        language,
      });

      return competitorData;
    } catch (error) {
      console.error('❌ Failed to analyze competitor:', error);
      throw error;
    }
  }

  /**
   * Compare your app with competitor
   */
  async compareWithCompetitor(
    yourAppId: string,
    competitorId: string,
    language: 'en' | 'ar'
  ): Promise<{
    yourApp: KeywordTrackerData;
    competitor: CompetitorData;
    analysis: string[];
  }> {
    // Get your app data
    const yourKeywords = await this.vaultService.query(
      'keyword_tracker',
      'by-appId-language',
      [yourAppId, language]
    );

    // Get competitor data
    const competitor = await this.vaultService.retrieve<CompetitorData>(
      'competitor_data',
      `competitor:${competitorId}:${language}`
    );

    if (!competitor) {
      throw new Error('Competitor data not cached, fetch first');
    }

    // Generate analysis
    const analysis = this.generateComparison(yourKeywords, competitor);

    return {
      yourApp: (yourKeywords[0] as any) || {},
      competitor,
      analysis,
    };
  }

  private generateComparison(yourKeywords: any[], competitor: CompetitorData): string[] {
    const analysis: string[] = [];

    // Your keyword count vs theirs
    if (yourKeywords.length > competitor.keywords.length) {
      analysis.push(`✅ You target ${yourKeywords.length - competitor.keywords.length} more keywords`);
    }

    // Market share comparison
    analysis.push(`📊 Competitor has ${competitor.marketShare}% market share`);

    // Rating comparison
    if (competitor.ratingValue >= 4.5) {
      analysis.push(`⭐ Competitor highly rated (${competitor.ratingValue})`);
    }

    return analysis;
  }
}
```

---

## 5. Combined Dashboard Service

Use all services together:

```typescript
// src/services/dashboard-service.ts
import { KeywordAPIService } from './keyword-api-service';
import { ReviewManagementService } from './review-management-service';
import { RankingAlertService } from './ranking-alert-service';
import { CompetitorAnalysisService } from './competitor-analysis-service';

export class DashboardService {
  private keywordService = new KeywordAPIService();
  private reviewService = new ReviewManagementService();
  private rankingService = new RankingAlertService();
  private competitorService = new CompetitorAnalysisService();

  /**
   * Refresh all dashboard data
   */
  async refreshDashboard(
    appId: string,
    language: 'en' | 'ar'
  ): Promise<{
    keywords: any;
    reviews: any;
    ranking: any;
    competitors: any;
  }> {
    try {
      // Fetch everything in parallel
      const [keywords, reviews, competitors] = await Promise.all([
        this.keywordService.fetchAndCacheKeywords(appId, language),
        this.reviewService.fetchAndCacheReviews(appId, language),
        this.competitorService.analyzeAndCacheCompetitor('comp-123', language),
      ]);

      const sentiment = await this.reviewService.getSentimentBreakdown(
        appId,
        language
      );

      return {
        keywords: { count: keywords.length, top: keywords.slice(0, 5) },
        reviews: {
          count: reviews.length,
          sentiment,
          averageRating: reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length,
        },
        ranking: { lastChecked: new Date() },
        competitors: {
          name: competitors.appName,
          rating: competitors.ratingValue,
          keywords: competitors.keywords.length,
        },
      };
    } catch (error) {
      console.error('❌ Dashboard refresh failed:', error);
      throw error;
    }
  }
}

// Usage
const dashboard = new DashboardService();
const data = await dashboard.refreshDashboard('app-123', 'en');
console.log('Dashboard data:', data);
```

---

## Performance Tips

### 1. Batch Large Operations
```typescript
// ✅ GOOD: Batch sync
await vaultService.batchSync('review_logs', 1000reviews, {
  batchSize: 200,
});

// ❌ BAD: 1000 individual syncs
for (const review of reviews) {
  await vaultService.sync('review_logs', review);
}
```

### 2. Set Appropriate TTLs
```typescript
// Fast-changing data: 1 day
expiresAt: Date.now() + 1 * 24 * 60 * 60 * 1000,

// Stable data: 7 days
expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,

// Historical data: never (set very far future or no TTL)
expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
```

### 3. Regular Cleanup
```typescript
// Run daily
setInterval(async () => {
  const vault = getStagingVaultService();
  
  // Purge expired data
  await vault.purgeExpired('keyword_data');
  await vault.purgeExpired('review_logs');
  await vault.purgeExpired('competitor_data');
  
  // Cleanup old sync logs
  await vault.purgeSyncLogs();
}, 24 * 60 * 60 * 1000);
```

---

You now have a complete, scalable, production-ready multi-store caching system! 🚀
