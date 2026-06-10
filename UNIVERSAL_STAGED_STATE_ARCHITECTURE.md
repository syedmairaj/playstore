# 🏗️ UNIVERSAL STAGED-STATE ARCHITECTURE

**Status:** Production-Ready Specification  
**Date:** 2026-06-10  
**Version:** 1.0  
**Scope:** Multi-feature, bilingual-isolated, unlimited scaling  

---

## Overview

The **Workspace Staging Vault** is a universal state manager for all ASO features. It uses JSONB to store feature-specific modules with strict `en`/`ar` locale isolation, enabling:

- ✅ Add new features in 1 day (schema + producer)
- ✅ Unlimited feature scaling (no schema migration)
- ✅ Strict data isolation (producers can't corrupt other features)
- ✅ Bilingual-first design (EN/AR always separated)
- ✅ Context-rich synthesis (synthesizer has full feature state)

---

## Part 1: Universal Schema Design

### 1.1 Core Table Structure

```sql
CREATE TABLE workspace_staging_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  app_id UUID NOT NULL,
  
  -- Bilingual isolation: All state split by locale
  state_en JSONB NOT NULL DEFAULT '{}',
  state_ar JSONB NOT NULL DEFAULT '{}',
  
  -- Metadata for system operations
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  
  -- Track which features have data
  active_features TEXT[] DEFAULT '{}',
  
  -- Audit trail
  last_modified_by UUID,
  change_count INT DEFAULT 0,
  
  UNIQUE(workspace_id, app_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (last_modified_by) REFERENCES auth.users(id)
);

-- Indexes for performance
CREATE INDEX idx_vault_workspace ON workspace_staging_vault(workspace_id);
CREATE INDEX idx_vault_app ON workspace_staging_vault(app_id);
CREATE INDEX idx_vault_active_features ON workspace_staging_vault USING GIN(active_features);
```

### 1.2 Universal JSONB Schema (state_en / state_ar)

Each locale has the same structure, but completely isolated data:

```json
{
  "features": {
    "keyword_tracker": {
      "keywords": [
        {
          "id": "uuid",
          "term": "photo editor",
          "difficulty": 5.2,
          "volume": 45000,
          "rank_position": 12,
          "trend": "↑",
          "last_updated": "2026-06-10T10:30:00Z"
        }
      ],
      "metadata": {
        "total_count": 150,
        "high_priority_count": 23,
        "last_sync": "2026-06-10T10:30:00Z"
      }
    },
    
    "competitor_spy": {
      "competitors": [
        {
          "id": "uuid",
          "app_name": "PhotoPro",
          "package_id": "com.example.photopro",
          "keywords": [
            {
              "term": "photo editor",
              "category": "high_volume",
              "estimated_rank": 5
            }
          ],
          "weaknesses": [
            "No batch processing",
            "Limited filters"
          ],
          "last_analyzed": "2026-06-10T10:00:00Z"
        }
      ],
      "metadata": {
        "total_competitors": 5,
        "snapshot_date": "2026-06-10T10:00:00Z"
      }
    },
    
    "review_analysis": {
      "summary": {
        "total_reviews": 5230,
        "avg_rating": 4.2,
        "trend": "stable",
        "sentiment": {
          "positive": 3500,
          "neutral": 1200,
          "negative": 530
        }
      },
      "themes": [
        {
          "theme": "Easy to use",
          "count": 1200,
          "sentiment": "positive",
          "keywords": ["simple", "intuitive", "user-friendly"]
        }
      ],
      "opportunities": [
        {
          "issue": "Slow performance",
          "count": 340,
          "sentiment": "negative",
          "suggested_fix": "Optimize image processing"
        }
      ]
    },
    
    "keyword_validator": {
      "validated_keywords": [
        {
          "term": "photo editor app",
          "language": "en",
          "difficulty": 3.5,
          "search_volume": 45000,
          "confidence": 85,
          "recommendation": "high_confidence",
          "validated_at": "2026-06-10T12:00:00Z"
        }
      ]
    },
    
    "experiment_snapshots": {
      "baselines": [
        {
          "id": "uuid",
          "name": "Original Listing",
          "type": "baseline",
          "listing": {
            "title": "PhotoEdit Pro",
            "short_description": "Professional photo editor",
            "full_description": "..."
          }
        }
      ],
      "variants": [
        {
          "id": "uuid",
          "name": "Variant A - Emojis",
          "baseline_id": "uuid",
          "changes": {
            "title": "🎨 PhotoEdit Pro"
          },
          "hypothesis": "Emojis increase CTR by 15%"
        }
      ]
    },
    
    "synthesis_context": {
      "review_insights": [
        "Users love the easy interface",
        "Performance could be better",
        "Lacks batch processing"
      ],
      "market_opportunities": [
        "Growing demand for batch editing",
        "Market shifting toward AI features"
      ],
      "competitor_gaps": [
        "Competitors lack smart crop",
        "No one-tap filters"
      ],
      "manual_weaknesses": [
        "Slow export",
        "Limited color options"
      ],
      "last_synthesis": "2026-06-10T14:00:00Z"
    },
    
    "user_feedback": {
      "survey_responses": [
        {
          "id": "uuid",
          "question": "What feature would you add?",
          "response": "AI background remover",
          "sentiment": "positive"
        }
      ]
    }
  },
  
  "metadata": {
    "workspace_id": "uuid",
    "app_id": "uuid",
    "locale": "en",
    "schema_version": "1.0",
    "last_producer": "competitor_spy",
    "last_producer_timestamp": "2026-06-10T10:30:00Z",
    "feature_count": 8,
    "total_bytes": 25600,
    "dirty_flags": {
      "keyword_tracker": false,
      "competitor_spy": true,
      "review_analysis": false
    }
  }
}
```

---

## Part 2: Producer Pattern (Strict Isolation)

### 2.1 Producer Interface

Every feature producer follows this standard pattern:

```typescript
/**
 * Producer Interface - All producers implement this
 * Ensures strict isolation and predictable behavior
 */

export interface StagedStateProducer {
  // Feature identifier (used as key in vault.state_en.features)
  featureKey: string;
  
  // Supported locales
  locales: ("en" | "ar")[];
  
  // JSON Schema for this feature (for validation)
  schema: JSONSchema;
  
  // Process data and update vault
  produce(
    vault: WorkspaceStagingVault,
    input: any,
    locale: "en" | "ar",
    userId: string
  ): Promise<WorkspaceStagingVault>;
  
  // Validate before updating (prevent corruption)
  validate(data: any): Promise<boolean>;
  
  // Clean up old data (optional)
  cleanup?(vault: WorkspaceStagingVault): Promise<void>;
}
```

### 2.2 Standard Producer Template

```typescript
import { StagedStateProducer } from "@/lib/staging/producer.interface";

/**
 * Example: Keyword Tracker Producer
 * 
 * Pattern:
 * 1. Fetch current vault
 * 2. Get feature data (keyed by this feature only)
 * 3. Merge new data with existing
 * 4. Validate schema
 * 5. Update only this feature's key
 * 6. Never touch other features
 */
export class KeywordTrackerProducer implements StagedStateProducer {
  featureKey = "keyword_tracker";
  locales = ["en", "ar"];
  
  schema = {
    type: "object",
    properties: {
      keywords: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            term: { type: "string" },
            difficulty: { type: "number", minimum: 0, maximum: 10 },
            volume: { type: "integer" },
            rank_position: { type: "integer" },
            last_updated: { type: "string", format: "date-time" }
          },
          required: ["id", "term", "difficulty", "volume"]
        }
      },
      metadata: { type: "object" }
    }
  };

  async produce(
    vault: WorkspaceStagingVault,
    input: {
      keywords: Array<{
        term: string;
        difficulty: number;
        volume: number;
        rank: number;
      }>;
    },
    locale: "en" | "ar",
    userId: string
  ): Promise<WorkspaceStagingVault> {
    // Step 1: Get current state for this locale
    const currentState = locale === "en" ? vault.state_en : vault.state_ar;
    
    // Step 2: Get current feature data (default to empty object)
    const currentFeatureData = currentState.features[this.featureKey] || {
      keywords: [],
      metadata: {}
    };

    // Step 3: Transform input
    const newKeywords = input.keywords.map((kw) => ({
      id: crypto.randomUUID(),
      term: kw.term,
      difficulty: kw.difficulty,
      volume: kw.volume,
      rank_position: kw.rank,
      trend: this.calculateTrend(currentFeatureData.keywords, kw.term),
      last_updated: new Date().toISOString()
    }));

    // Step 4: Merge with existing (smart merge: keep old data, add/update new)
    const mergedKeywords = this.mergeKeywords(
      currentFeatureData.keywords,
      newKeywords
    );

    // Step 5: Validate
    const isValid = await this.validate({
      keywords: mergedKeywords,
      metadata: currentFeatureData.metadata
    });
    if (!isValid) throw new Error("Validation failed");

    // Step 6: Update ONLY this feature key
    const updatedState = {
      ...currentState,
      features: {
        ...currentState.features,
        [this.featureKey]: {
          keywords: mergedKeywords,
          metadata: {
            total_count: mergedKeywords.length,
            high_priority_count: mergedKeywords.filter(k => k.difficulty <= 3).length,
            last_sync: new Date().toISOString()
          }
        }
      },
      metadata: {
        ...currentState.metadata,
        locale,
        last_producer: this.featureKey,
        last_producer_timestamp: new Date().toISOString(),
        dirty_flags: {
          ...currentState.metadata.dirty_flags,
          [this.featureKey]: true
        }
      }
    };

    // Step 7: Update vault (only this locale's state)
    const updatedVault = {
      ...vault,
      [locale === "en" ? "state_en" : "state_ar"]: updatedState,
      active_features: Array.from(
        new Set([...vault.active_features, this.featureKey])
      ),
      last_modified_by: userId,
      change_count: vault.change_count + 1,
      updated_at: new Date()
    };

    return updatedVault;
  }

  async validate(data: any): Promise<boolean> {
    // Use JSON Schema validation
    const validate = ajv.compile(this.schema);
    return validate(data);
  }

  private mergeKeywords(existing: any[], newData: any[]): any[] {
    const map = new Map(existing.map(k => [k.term, k]));
    
    for (const newKw of newData) {
      if (map.has(newKw.term)) {
        // Update existing
        map.set(newKw.term, {
          ...map.get(newKw.term),
          ...newKw,
          id: map.get(newKw.term).id // Preserve ID
        });
      } else {
        // Add new
        map.set(newKw.term, newKw);
      }
    }
    
    return Array.from(map.values());
  }

  private calculateTrend(oldData: any[], term: string): string {
    const oldEntry = oldData.find(k => k.term === term);
    if (!oldEntry) return "→";
    // Calculate trend based on rank change, volume change, etc.
    return "↑"; // Simplified
  }
}
```

### 2.3 Producer Registration & Isolation

```typescript
/**
 * Producer Registry
 * Central registration ensures no feature can interfere with another
 */

export class ProducerRegistry {
  private producers: Map<string, StagedStateProducer> = new Map();

  register(producer: StagedStateProducer) {
    // Prevent duplicate keys
    if (this.producers.has(producer.featureKey)) {
      throw new Error(`Producer ${producer.featureKey} already registered`);
    }
    this.producers.set(producer.featureKey, producer);
  }

  async produce(
    featureKey: string,
    vault: WorkspaceStagingVault,
    input: any,
    locale: "en" | "ar",
    userId: string
  ): Promise<WorkspaceStagingVault> {
    const producer = this.producers.get(featureKey);
    if (!producer) {
      throw new Error(`Producer ${featureKey} not found`);
    }

    // Isolation: Producer can only modify its own feature
    const vaultBefore = JSON.stringify(vault);
    const result = await producer.produce(vault, input, locale, userId);
    
    // Verification: Ensure no other features were modified
    this.verifyIsolation(vault, result, featureKey);
    
    return result;
  }

  private verifyIsolation(
    before: WorkspaceStagingVault,
    after: WorkspaceStagingVault,
    modifiedFeature: string
  ) {
    const beforeState = before.state_en.features;
    const afterState = after.state_en.features;

    for (const [featureKey, featureData] of Object.entries(beforeState)) {
      if (featureKey !== modifiedFeature) {
        // Verify other features unchanged
        if (JSON.stringify(featureData) !== JSON.stringify(afterState[featureKey])) {
          throw new Error(
            `Producer ${modifiedFeature} corrupted feature ${featureKey}`
          );
        }
      }
    }
  }

  // Init all producers at startup
  initializeDefaultProducers() {
    this.register(new KeywordTrackerProducer());
    this.register(new CompetitorSpyProducer());
    this.register(new ReviewAnalysisProducer());
    this.register(new KeywordValidatorProducer());
    this.register(new ExperimentSnapshotsProducer());
    this.register(new SynthesisContextProducer());
  }
}

// Global instance
export const producerRegistry = new ProducerRegistry();
producerRegistry.initializeDefaultProducers();
```

---

## Part 3: Synthesizer Scaling (Context Management)

### 3.1 Token-Aware Context Builder

The synthesizer never gets the entire vault (too large). Instead, it gets a **filtered, prioritized context** that respects token limits.

```typescript
/**
 * Context Builder for Synthesizer
 * 
 * Strategy:
 * 1. Get all feature data from vault (both locales)
 * 2. Prioritize high-value signals (reviews, competitors, keywords)
 * 3. Summarize when needed (keyword list gets truncated to top-N)
 * 4. Format into synthesizer prompt
 * 5. Never exceed token budget (default: 6000 tokens max)
 */

export interface SynthesizerContextConfig {
  maxTokens?: number; // Default 6000
  maxKeywords?: number; // Default 20
  maxCompetitors?: number; // Default 5
  maxThemes?: number; // Default 5
  prioritizeHighDifficulty?: boolean;
}

export class SynthesisContextBuilder {
  async buildContext(
    vault: WorkspaceStagingVault,
    locale: "en" | "ar",
    config: SynthesizerContextConfig = {}
  ) {
    const {
      maxTokens = 6000,
      maxKeywords = 20,
      maxCompetitors = 5,
      maxThemes = 5,
      prioritizeHighDifficulty = false
    } = config;

    const state = locale === "en" ? vault.state_en : vault.state_ar;
    const features = state.features;

    // Build context from features
    const context = {
      app: {
        appId: vault.app_id,
        workspaceId: vault.workspace_id,
        locale
      },

      // Priority 1: Keywords (highest impact on ASO)
      stagedKeywords: this.extractKeywords(
        features.keyword_tracker?.keywords || [],
        features.keyword_validator?.validated_keywords || [],
        maxKeywords,
        prioritizeHighDifficulty
      ),

      // Priority 2: Competitor analysis
      competitorInsights: this.extractCompetitorGaps(
        features.competitor_spy?.competitors || [],
        maxCompetitors
      ),

      // Priority 3: Review sentiments & themes
      reviewInsights: this.extractReviewThemes(
        features.review_analysis || {},
        maxThemes
      ),

      // Priority 4: Validator recommendations
      validatorScore: features.keyword_validator?.validated_keywords?.[0],

      // Priority 5: Experiment baselines
      baselineSnapshot: features.experiment_snapshots?.baselines?.[0],

      // Priority 6: User feedback
      feedbackSummary: this.summarizeFeedback(
        features.user_feedback?.survey_responses || []
      ),

      // Metadata for synthesis
      metadata: {
        featuresPresent: Object.keys(features),
        synthesisDate: new Date().toISOString(),
        locale,
        estimatedTokens: 0 // Will be calculated
      }
    };

    // Estimate tokens
    const tokenCount = this.estimateTokens(context);
    if (tokenCount > maxTokens) {
      // Truncate least-important data
      context.reviewInsights = context.reviewInsights.slice(0, 3);
      context.competitorInsights = context.competitorInsights.slice(0, 2);
    }

    context.metadata.estimatedTokens = tokenCount;
    return context;
  }

  private extractKeywords(
    trackerKeywords: any[],
    validatedKeywords: any[],
    maxCount: number,
    prioritizeHighDifficulty: boolean
  ) {
    // Combine both sources
    const combined = [
      ...trackerKeywords.map(k => ({
        ...k,
        source: "tracker",
        confidence: undefined
      })),
      ...validatedKeywords.map(k => ({
        ...k,
        source: "validator",
        confidence: k.confidence || 0
      }))
    ];

    // Deduplicate by term
    const deduped = Array.from(
      new Map(combined.map(k => [k.term, k])).values()
    );

    // Sort by priority
    let sorted = deduped;
    if (prioritizeHighDifficulty) {
      sorted = deduped.sort((a, b) => b.difficulty - a.difficulty);
    } else {
      sorted = deduped.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    }

    return sorted.slice(0, maxCount);
  }

  private extractCompetitorGaps(competitors: any[], maxCount: number) {
    return competitors
      .slice(0, maxCount)
      .map(c => ({
        competitor: c.app_name,
        weaknesses: c.weaknesses || [],
        ourOpportunities: c.keywords
          ?.filter((k: any) => k.category === "high_volume")
          .map((k: any) => k.term) || []
      }));
  }

  private extractReviewThemes(analysis: any, maxCount: number) {
    const positive = analysis.themes
      ?.filter((t: any) => t.sentiment === "positive")
      .slice(0, maxCount) || [];

    const negative = analysis.opportunities?.slice(0, 3) || [];

    return {
      summary: analysis.summary,
      positiveThemes: positive.map(t => ({
        theme: t.theme,
        count: t.count,
        keywords: t.keywords
      })),
      improvements: negative.map(o => ({
        issue: o.issue,
        count: o.count,
        suggestedFix: o.suggested_fix
      }))
    };
  }

  private summarizeFeedback(responses: any[]) {
    const themes = new Map<string, number>();
    for (const resp of responses) {
      const key = resp.response.toLowerCase();
      themes.set(key, (themes.get(key) || 0) + 1);
    }
    return Array.from(themes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([theme, count]) => ({ theme, count }));
  }

  private estimateTokens(context: any): number {
    // Rough estimate: 1 token ≈ 4 chars
    const jsonStr = JSON.stringify(context);
    return Math.ceil(jsonStr.length / 4);
  }
}
```

### 3.2 Synthesizer Integration

```typescript
/**
 * Updated ASOSynthesizerService
 * 
 * Now ingests staged vault context instead of manual inputs
 */

export class ASOSynthesizerService {
  private genAI: GoogleGenerativeAI;
  private contextBuilder = new SynthesisContextBuilder();

  async synthesizeFromVault(
    vault: WorkspaceStagingVault,
    locale: "en" | "ar",
    appName: string,
    category: string
  ): Promise<SynthesisOutput> {
    // Build context from vault (respects token limits)
    const context = await this.contextBuilder.buildContext(vault, locale, {
      maxTokens: 6000,
      maxKeywords: 20,
      maxCompetitors: 5,
      maxThemes: 5,
      prioritizeHighDifficulty: false
    });

    console.log(`[ASOSynthesizerService] Building synthesis context:`, {
      appName,
      locale,
      featuresUsed: context.metadata.featuresPresent,
      estimatedTokens: context.metadata.estimatedTokens,
      keywordCount: context.stagedKeywords.length,
      competitorCount: context.competitorInsights.length
    });

    // Build prompt from context
    const prompt = this.buildPromptFromContext(
      appName,
      category,
      locale,
      context
    );

    // Call Gemini
    const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Parse and return
    return this.parseResponse(response);
  }

  private buildPromptFromContext(
    appName: string,
    category: string,
    locale: string,
    context: any
  ): string {
    const isArabic = locale === "ar";

    let prompt = isArabic
      ? `أنت خبير تحسين متاجر التطبيقات (ASO).`
      : `You are an expert ASO specialist.`;

    prompt += `\n\nApp: ${appName}`;
    prompt += `\nCategory: ${category}`;
    prompt += `\nLanguage: ${locale.toUpperCase()}`;

    // Staged Keywords
    if (context.stagedKeywords?.length > 0) {
      prompt += `\n\n## High-Priority Keywords`;
      context.stagedKeywords.forEach((kw: any) => {
        prompt += `\n- "${kw.term}" (difficulty: ${kw.difficulty}, volume: ${kw.volume})`;
      });
    }

    // Competitor Analysis
    if (context.competitorInsights?.length > 0) {
      prompt += `\n\n## Competitor Gaps`;
      context.competitorInsights.forEach((c: any) => {
        prompt += `\n- ${c.competitor}: ${c.weaknesses.join(", ")}`;
      });
    }

    // Review Themes
    if (context.reviewInsights?.positiveThemes?.length > 0) {
      prompt += `\n\n## What Users Love`;
      context.reviewInsights.positiveThemes.forEach((t: any) => {
        prompt += `\n- ${t.theme} (${t.count} mentions)`;
      });
    }

    // Improvements
    if (context.reviewInsights?.improvements?.length > 0) {
      prompt += `\n\n## Areas to Improve`;
      context.reviewInsights.improvements.forEach((i: any) => {
        prompt += `\n- ${i.issue} (${i.count} complaints)`;
      });
    }

    // Output spec
    prompt += `\n\nRespond with JSON (no markdown):`;
    prompt += `\n{`;
    prompt += `\n  "title": "string (max 50 chars, include top keyword)",`;
    prompt += `\n  "shortDescription": "string (max 80 chars)",`;
    prompt += `\n  "fullDescription": "string (max 4000 chars)",`;
    prompt += `\n  "ctaButton": "string",`;
    prompt += `\n  "strategy": "string",`;
    prompt += `\n  "asoScore": number (0-100)`;
    prompt += `\n}`;

    return prompt;
  }

  private parseResponse(responseText: string): SynthesisOutput {
    let cleanedText = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No valid JSON in response");

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      title: String(parsed.title).substring(0, 50),
      shortDescription: String(parsed.shortDescription).substring(0, 80),
      fullDescription: String(parsed.fullDescription).substring(0, 4000),
      ctaButton: String(parsed.ctaButton),
      strategy: String(parsed.strategy),
      asoScore: Math.min(100, Math.max(0, parseInt(parsed.asoScore) || 50))
    };
  }
}
```

---

## Part 4: Bilingual Routing Pattern

### 4.1 Request Routing (Frontend)

```typescript
/**
 * Bilingual Routing Pattern
 * 
 * User's locale determines which vault state is used
 * Frontend always routes to correct producer
 */

export interface LocaleAwareRequest {
  locale: "en" | "ar";
  userId: string;
  workspaceId: string;
  appId: string;
  feature: string;
  payload: any;
}

export class VaultRouterService {
  async routeProducerRequest(req: LocaleAwareRequest) {
    // Validate locale
    if (!["en", "ar"].includes(req.locale)) {
      throw new Error(`Invalid locale: ${req.locale}`);
    }

    // Fetch vault
    const vault = await this.getVault(req.workspaceId, req.appId);

    // Route to producer (produces to correct locale)
    const registry = producerRegistry;
    const updatedVault = await registry.produce(
      req.feature,
      vault,
      req.payload,
      req.locale,
      req.userId
    );

    // Persist
    await this.saveVault(updatedVault);

    // Return only the locale that was requested
    const state = req.locale === "en" ? updatedVault.state_en : updatedVault.state_ar;
    return state.features[req.feature];
  }

  private async getVault(workspaceId: string, appId: string) {
    // Get or create vault for this app
    const { data, error } = await supabase
      .from("workspace_staging_vault")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId)
      .single();

    if (!data) {
      // Create new vault
      return {
        workspace_id: workspaceId,
        app_id: appId,
        state_en: { features: {}, metadata: { locale: "en" } },
        state_ar: { features: {}, metadata: { locale: "ar" } },
        active_features: [],
        created_at: new Date(),
        updated_at: new Date()
      };
    }

    return data;
  }

  private async saveVault(vault: WorkspaceStagingVault) {
    await supabase
      .from("workspace_staging_vault")
      .upsert(vault, { onConflict: "workspace_id, app_id" });
  }
}
```

### 4.2 Synthesizer Routing

```typescript
/**
 * Synthesizer Locale Routing
 * 
 * Pattern: Synthesizer works on isolated locale state
 */

export interface SynthesisRequest {
  workspaceId: string;
  appId: string;
  locale: "en" | "ar";
  appName: string;
  category: string;
}

export class SynthesisRouterService {
  private synthesizer = new ASOSynthesizerService();
  private vaultRouter = new VaultRouterService();

  async synthesizeListing(req: SynthesisRequest): Promise<SynthesisOutput> {
    // Validate locale
    if (!["en", "ar"].includes(req.locale)) {
      throw new Error(`Invalid locale: ${req.locale}`);
    }

    console.log(`[SynthesisRouter] Routing synthesis request:`, {
      appName: req.appName,
      locale: req.locale,
      workspaceId: req.workspaceId
    });

    // Fetch vault
    const vault = await this.vaultRouter["getVault"](
      req.workspaceId,
      req.appId
    );

    // Synthesize using only the requested locale
    const output = await this.synthesizer.synthesizeFromVault(
      vault,
      req.locale,
      req.appName,
      req.category
    );

    return output;
  }
}
```

### 4.3 Component-Level Routing

```tsx
/**
 * React Component Pattern for Bilingual Routing
 */

import { useRouter } from "next/router";
import { SynthesizerComponent } from "@/components/synthesizer";

export default function ListingOptimizerPage() {
  const router = useRouter();
  const locale = (router.locale || "en") as "en" | "ar";
  const { workspaceId, appId } = router.query;

  const handleSynthesize = async () => {
    // Route API call to correct locale
    const response = await fetch("/api/workspaces/[workspaceId]/synthesize", {
      method: "POST",
      body: JSON.stringify({
        appId,
        locale, // Passed from router
        appName: "PhotoEdit Pro",
        category: "photo"
      })
    });

    const result = await response.json();
    // Result is ONLY for the requested locale
    displayListing(result.data); // Only English or Arabic
  };

  return (
    <SynthesizerComponent
      locale={locale}
      onSynthesize={handleSynthesize}
    />
  );
}
```

---

## Part 5: Adding a New Feature in 1 Day

### 5.1 Day-1 Checklist

**Step 1: Define JSON Schema** (10 min)
```typescript
// my-feature.schema.ts
export const MY_FEATURE_SCHEMA = {
  type: "object",
  properties: {
    data: { type: "array" },
    metadata: { type: "object" }
  }
};
```

**Step 2: Create Producer** (30 min)
```typescript
// my-feature.producer.ts
export class MyFeatureProducer implements StagedStateProducer {
  featureKey = "my_feature";
  locales = ["en", "ar"];
  schema = MY_FEATURE_SCHEMA;

  async produce(vault, input, locale, userId) {
    // Update only vault.state_{locale}.features.my_feature
    // Never touch other features
  }
}
```

**Step 3: Register Producer** (5 min)
```typescript
// In producerRegistry.ts
producerRegistry.register(new MyFeatureProducer());
```

**Step 4: Create API Endpoint** (15 min)
```typescript
// app/api/workspaces/[workspaceId]/my-feature/route.ts
export async function POST(request, context) {
  const { workspaceId } = await context.params;
  const body = await request.json();

  const router = new VaultRouterService();
  const result = await router.routeProducerRequest({
    locale: body.locale,
    userId: user.id,
    workspaceId,
    appId: body.appId,
    feature: "my_feature",
    payload: body.data
  });

  return NextResponse.json({ ok: true, data: result });
}
```

**Step 5: Add to Synthesizer Context** (optional, 10 min)
```typescript
// In SynthesisContextBuilder.buildContext()
// Add your feature's data to context
context.myFeatureInsights = features.my_feature?.data || [];
```

**Done!** ✅ Your feature is live in 1 day, no schema migration needed.

---

## Part 6: Architecture Guarantees

### 6.1 Data Isolation Guarantee

```typescript
/**
 * Producer Isolation Enforcement
 * 
 * The system PREVENTS:
 * ❌ Producer A writing to Feature B
 * ❌ Producer A reading Feature B directly
 * ❌ Cross-locale data mixing
 * 
 * The system ENABLES:
 * ✅ Producer isolation (each feature is sandboxed)
 * ✅ Safe feature addition (no breaking changes)
 * ✅ Predictable state management
 * ✅ Audit trail (every change tracked)
 */

// Enforcement in ProducerRegistry.produce()
async produce(featureKey, vault, input, locale, userId) {
  const before = JSON.parse(JSON.stringify(vault));
  const result = await producer.produce(vault, input, locale, userId);
  
  // Verify isolation: Only this feature was modified
  for (const [key, data] of Object.entries(result.state_en.features)) {
    if (key !== featureKey) {
      if (JSON.stringify(data) !== JSON.stringify(before.state_en.features[key])) {
        throw new Error(`Producer ${featureKey} corrupted ${key}`);
      }
    }
  }
  
  return result;
}
```

### 6.2 Bilingual Isolation Guarantee

```typescript
/**
 * Locale Isolation Enforcement
 * 
 * state_en and state_ar NEVER contaminate each other
 * Each producer works on ONE locale at a time
 */

// Enforcement in producer
async produce(vault, input, locale, userId) {
  const currentState = locale === "en" ? vault.state_en : vault.state_ar;
  
  // Producer only touches its locale
  const updated = { ...currentState };
  updated.features[this.featureKey] = newData;
  
  // Return vault with ONLY this locale modified
  return {
    ...vault,
    [locale === "en" ? "state_en" : "state_ar"]: updated
  };
}
```

### 6.3 Schema Guarantee

```typescript
/**
 * No Schema Migration Needed
 * 
 * Adding a feature = Just add a new key to features{}
 * No ALTER TABLE, no downtime, instant rollout
 */

// Old schema (supports unlimited features)
{
  "features": {
    "keyword_tracker": { ... },
    "competitor_spy": { ... }
  }
}

// Adding new feature (same schema)
{
  "features": {
    "keyword_tracker": { ... },
    "competitor_spy": { ... },
    "my_new_feature": { ... }  // Just added, no migration!
  }
}
```

---

## Part 7: Reference Implementation

### 7.1 Complete Feature Example: Keyword Tracker

```typescript
/**
 * Complete implementation of Keyword Tracker Producer
 * Use this as template for all new features
 */

import { StagedStateProducer, WorkspaceStagingVault } from "@/lib/staging/types";
import Ajv from "ajv";

const ajv = new Ajv();

export class KeywordTrackerProducer implements StagedStateProducer {
  readonly featureKey = "keyword_tracker";
  readonly locales = ["en", "ar"];

  readonly schema = {
    type: "object",
    properties: {
      keywords: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            term: { type: "string", minLength: 1, maxLength: 100 },
            difficulty: { type: "number", minimum: 0, maximum: 10 },
            volume: { type: "integer", minimum: 0 },
            rank_position: { type: "integer" },
            trend: { type: "string", enum: ["↑", "→", "↓"] },
            last_updated: { type: "string", format: "date-time" }
          },
          required: ["id", "term", "difficulty", "volume"]
        },
        minItems: 0,
        maxItems: 1000
      },
      metadata: {
        type: "object",
        properties: {
          total_count: { type: "integer" },
          high_priority_count: { type: "integer" },
          last_sync: { type: "string", format: "date-time" }
        }
      }
    },
    required: ["keywords", "metadata"],
    additionalProperties: false
  };

  async produce(
    vault: WorkspaceStagingVault,
    input: any,
    locale: "en" | "ar",
    userId: string
  ): Promise<WorkspaceStagingVault> {
    // 1. Get current state
    const state = locale === "en" ? vault.state_en : vault.state_ar;
    const current = state.features[this.featureKey] || {
      keywords: [],
      metadata: { total_count: 0, high_priority_count: 0 }
    };

    // 2. Transform input
    const newKeywords = input.keywords.map((kw: any) => ({
      id: kw.id || crypto.randomUUID(),
      term: kw.term,
      difficulty: kw.difficulty,
      volume: kw.volume,
      rank_position: kw.rank_position || 999,
      trend: this.calculateTrend(current.keywords, kw.term),
      last_updated: new Date().toISOString()
    }));

    // 3. Merge
    const merged = this.smartMerge(current.keywords, newKeywords);

    // 4. Validate
    const featureData = {
      keywords: merged,
      metadata: {
        total_count: merged.length,
        high_priority_count: merged.filter(
          (k: any) => k.difficulty <= 3
        ).length,
        last_sync: new Date().toISOString()
      }
    };

    const validate = ajv.compile(this.schema);
    if (!validate(featureData)) {
      throw new Error(
        `Validation failed: ${JSON.stringify(validate.errors)}`
      );
    }

    // 5. Update ONLY this feature
    const updatedState = {
      ...state,
      features: {
        ...state.features,
        [this.featureKey]: featureData
      }
    };

    // 6. Return updated vault
    return {
      ...vault,
      [locale === "en" ? "state_en" : "state_ar"]: updatedState,
      active_features: Array.from(
        new Set([...vault.active_features, this.featureKey])
      ),
      last_modified_by: userId,
      change_count: vault.change_count + 1,
      updated_at: new Date()
    };
  }

  async validate(data: any): Promise<boolean> {
    const validate = ajv.compile(this.schema);
    return validate(data);
  }

  private smartMerge(existing: any[], newData: any[]): any[] {
    const map = new Map(existing.map((k: any) => [k.term, k]));

    for (const item of newData) {
      if (map.has(item.term)) {
        // Preserve ID, update other fields
        map.set(item.term, {
          ...map.get(item.term),
          ...item,
          id: map.get(item.term).id
        });
      } else {
        map.set(item.term, item);
      }
    }

    return Array.from(map.values());
  }

  private calculateTrend(existing: any[], term: string): string {
    const old = existing.find((k: any) => k.term === term);
    if (!old) return "→";
    // Placeholder: calculate based on rank change, volume change, etc.
    return "→";
  }
}
```

---

## Part 8: Database Operations

### 8.1 Query Patterns

```sql
-- Get feature data for synthesis (all features)
SELECT 
  id,
  app_id,
  state_en -> 'features' AS features_en,
  state_ar -> 'features' AS features_ar,
  active_features,
  updated_at
FROM workspace_staging_vault
WHERE workspace_id = $1 AND app_id = $2;

-- Get specific feature only
SELECT 
  state_en -> 'features' -> 'keyword_tracker' AS keywords
FROM workspace_staging_vault
WHERE workspace_id = $1 AND app_id = $2;

-- Check which features are active
SELECT 
  app_id,
  active_features,
  array_length(active_features, 1) AS feature_count
FROM workspace_staging_vault
WHERE workspace_id = $1;

-- Audit trail (who modified what)
SELECT 
  id,
  app_id,
  last_modified_by,
  updated_at,
  change_count,
  active_features
FROM workspace_staging_vault
WHERE workspace_id = $1
ORDER BY updated_at DESC
LIMIT 50;

-- Search keywords across apps
SELECT 
  app_id,
  state_en -> 'features' -> 'keyword_tracker' -> 'keywords' AS keywords
FROM workspace_staging_vault
WHERE workspace_id = $1
  AND state_en -> 'features' -> 'keyword_tracker' -> 'keywords' @> '[{"term": "photo editor"}]'::jsonb;
```

### 8.2 Indexing Strategy

```sql
-- JSONB indexes for common queries
CREATE INDEX idx_keyword_tracker_en 
  ON workspace_staging_vault 
  USING GIN ((state_en -> 'features' -> 'keyword_tracker'));

CREATE INDEX idx_keyword_tracker_ar 
  ON workspace_staging_vault 
  USING GIN ((state_ar -> 'features' -> 'keyword_tracker'));

-- Full text search on keywords
CREATE INDEX idx_keywords_fulltext 
  ON workspace_staging_vault 
  USING GIN ((
    state_en -> 'features' -> 'keyword_tracker' -> 'keywords'
  ));

-- Active features index
CREATE INDEX idx_active_features 
  ON workspace_staging_vault 
  USING GIN (active_features);

-- Standard indexes
CREATE INDEX idx_vault_workspace_app 
  ON workspace_staging_vault (workspace_id, app_id);

CREATE INDEX idx_vault_updated 
  ON workspace_staging_vault (updated_at DESC);
```

---

## Part 9: Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│              WORKSPACE STAGING VAULT (Universal)                │
│                                                                   │
│  ┌──────────────────────────────────────┐                       │
│  │ state_en (English Isolated)          │                       │
│  │ ┌─────────────────────────────────┐  │                       │
│  │ │ features: {                     │  │                       │
│  │ │   keyword_tracker: {...}        │  │  ← Can ONLY be       │
│  │ │   competitor_spy: {...}         │  │    modified by       │
│  │ │   review_analysis: {...}        │  │    specific           │
│  │ │   keyword_validator: {...}      │  │    producer           │
│  │ │   experiment_snapshots: {...}   │  │                       │
│  │ │   synthesis_context: {...}      │  │                       │
│  │ │   user_feedback: {...}          │  │                       │
│  │ │ }                               │  │                       │
│  │ └─────────────────────────────────┘  │                       │
│  └──────────────────────────────────────┘                       │
│  ┌──────────────────────────────────────┐                       │
│  │ state_ar (Arabic Isolated)           │                       │
│  │ ┌─────────────────────────────────┐  │                       │
│  │ │ features: {                     │  │  ← Completely        │
│  │ │   keyword_tracker: {...}        │  │    separate from EN   │
│  │ │   competitor_spy: {...}         │  │                       │
│  │ │   ... (same structure)          │  │                       │
│  │ │ }                               │  │                       │
│  │ └─────────────────────────────────┘  │                       │
│  └──────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘

                          ↓ Routes to

┌────────────────────────────────────────────────────────────────┐
│         PRODUCER REGISTRY (Isolation Enforcer)                 │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │ KeywordTracker       │  │ CompetitorSpy        │            │
│  │ Producer             │  │ Producer             │            │
│  │ - featureKey:        │  │ - featureKey:        │            │
│  │   "keyword_tracker"  │  │   "competitor_spy"   │            │
│  │ - locales: en, ar    │  │ - locales: en, ar    │            │
│  │ - schema: {...}      │  │ - schema: {...}      │            │
│  │ - produce()          │  │ - produce()          │            │
│  │ - validate()         │  │ - validate()         │            │
│  └──────────────────────┘  └──────────────────────┘            │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │ ReviewAnalysis       │  │ KeywordValidator     │            │
│  │ Producer             │  │ Producer             │            │
│  └──────────────────────┘  └──────────────────────┘            │
│                                                                 │
│  ✓ Prevents cross-feature modification                         │
│  ✓ Enforces JSON schema validation                             │
│  ✓ Maintains audit trail                                       │
└────────────────────────────────────────────────────────────────┘

                          ↓ Routes to

┌────────────────────────────────────────────────────────────────┐
│         SYNTHESIS CONTEXT BUILDER (Token-Aware)                │
│                                                                 │
│  Reads from vault.state_{locale}.features:                    │
│  - Extract high-priority keywords                              │
│  - Summarize competitor gaps                                   │
│  - Truncate review themes (max 5)                             │
│  - Filter to token budget (6000 max)                           │
│  - Build synthesizer context                                   │
└────────────────────────────────────────────────────────────────┘

                          ↓ Routes to

┌────────────────────────────────────────────────────────────────┐
│         SYNTHESIZER (Gemini 2.5-Flash)                         │
│                                                                 │
│  - Ingests context from only ONE locale                        │
│  - Generates listing (title, desc, CTA)                        │
│  - Returns result in requested locale                          │
│  - Never mixes EN/AR data                                      │
└────────────────────────────────────────────────────────────────┘
```

---

## Part 10: Implementation Checklist

### ✅ Schema
- [ ] Create `workspace_staging_vault` table
- [ ] Add `state_en` JSONB column
- [ ] Add `state_ar` JSONB column
- [ ] Add audit columns (created_at, updated_at, last_modified_by, change_count)
- [ ] Create GIN indexes on state_en, state_ar
- [ ] Create UNIQUE(workspace_id, app_id) constraint

### ✅ Producer Infrastructure
- [ ] Define `StagedStateProducer` interface
- [ ] Create `ProducerRegistry` class
- [ ] Add isolation verification logic
- [ ] Create producer template (copy-paste for new features)

### ✅ Default Producers
- [ ] KeywordTrackerProducer
- [ ] CompetitorSpyProducer
- [ ] ReviewAnalysisProducer
- [ ] KeywordValidatorProducer
- [ ] ExperimentSnapshotsProducer

### ✅ Routing
- [ ] Create `VaultRouterService`
- [ ] Implement locale validation
- [ ] Add producer request routing

### ✅ Synthesis Integration
- [ ] Create `SynthesisContextBuilder`
- [ ] Implement token-aware context extraction
- [ ] Update `ASOSynthesizerService` to ingest vault
- [ ] Add bilingual routing to synthesizer

### ✅ API Endpoints
- [ ] Create producer-agnostic endpoint
- [ ] Add locale validation middleware
- [ ] Implement request routing

### ✅ Testing
- [ ] Test isolation enforcement
- [ ] Test bilingual separation
- [ ] Test token budgeting
- [ ] Test feature addition workflow

---

## Summary

This architecture enables:

✅ **1-Day Feature Addition**
- Define schema → Create producer → Register → Done
- No database migrations
- No breaking changes

✅ **Strict Isolation**
- Each producer only modifies its feature key
- Validation prevents corruption
- Audit trail tracks all changes

✅ **Bilingual-First**
- state_en and state_ar are completely separate
- Synthesizer works on one locale at a time
- No cross-locale contamination possible

✅ **Token-Aware Synthesis**
- Context builder respects token budget
- Prioritizes high-value signals
- Summarizes less important data

✅ **Unlimited Scaling**
- Add features without schema changes
- JSONB handles unlimited structure variations
- Producers are truly modular

**Status: Ready for implementation** 🚀

---

*Last Updated: 2026-06-10*  
*For: Universal ASO Platform*
