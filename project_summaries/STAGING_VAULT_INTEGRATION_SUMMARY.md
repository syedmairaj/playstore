# Staging Vault Integration Summary

**Document Version:** 1.0  
**Last Updated:** June 10, 2026  
**Scope:** Growth Hub Staged-State Architecture Pattern  
**Audience:** Senior developers, architects, future maintainers  

---

## Executive Overview

The **Staging Vault** is the architectural foundation of Growth Hub. It implements a **Producer-Consumer pattern** with strict feature isolation, bilingual state separation, and zero-breaking-changes evolution semantics.

**Core Value:** Enables unlimited feature scaling without cross-feature data corruption while maintaining backwards compatibility across all client versions.

---

## Architecture Foundation

### Problem Statement

Traditional feature architecture in ASO platforms suffers from:
- **Feature Coupling:** One feature's bug corrupts another's data
- **State Bloat:** Monolithic state grows uncontrollably
- **Breaking Changes:** Schema migrations require client updates
- **Bilingual Complexity:** EN/AR state entanglement

### Solution: Staged-State Producer Pattern

The Staging Vault enforces:
1. **Strict Producer Isolation** - Each feature owns its state boundary
2. **Bilingual State Separation** - Locale-keyed state (state_en, state_ar)
3. **Backwards Compatibility** - Schema never breaks, only evolves
4. **Audit Trail** - Complete change history per feature

---

## JSONB Schema Structure

### Root Vault Structure

```typescript
interface WorkspaceStagingVault {
  id: UUID;
  workspace_id: UUID;
  
  // Bilingual state separation
  state_en: StateSnapshot;      // English (LTR) state
  state_ar: StateSnapshot;      // Arabic (RTL) state
  
  // Audit tracking
  created_at: Timestamp;
  updated_at: Timestamp;
  last_modified_by: UUID;
  change_count: Integer;
  
  // Soft delete
  deleted_at: Timestamp | null;
  is_deleted: Boolean;
  
  // Feature tracking
  active_features: String[];
}
```

### State Snapshot (EN/AR)

```typescript
interface StateSnapshot {
  // Keyword Validator Producer
  keywords: {
    [keyword_id: string]: {
      keyword: string;
      difficulty: number;        // 0-10
      confidence: number;        // 0-100
      searchVolume: number;
      competition: number;       // 0-100
      monthlyInstalls: {
        low: number;
        realistic: number;
        high: number;
      };
      recommendation: 'HIGH_CONFIDENCE' | 'MEDIUM_OPPORTUNITY' | 'SKIP';
      createdAt: Timestamp;
      addedBy: UUID;
      deleted_at?: Timestamp;   // Soft delete
    };
  };
  
  // Experiment Snapshots Producer
  snapshots: {
    [snapshot_id: string]: {
      appId: string;
      type: 'BASELINE' | 'VARIANT';
      name: string;
      title: string;
      description: string;
      hypothesis?: string;       // For variants
      metrics: {
        installs: number;
        rating: number;
        reviews: number;
        recordedAt: Timestamp;
      }[];
      status: 'DRAFT' | 'ACTIVE' | 'PUBLISHED';
      createdAt: Timestamp;
      publishedAt?: Timestamp;
      deleted_at?: Timestamp;   // Soft delete
    };
  };
  
  // Synthesis Context Producer
  synthesis: {
    context: {
      keywords: string[];
      keywordScores: {
        [keyword: string]: number;  // Confidence 0-100
      };
      baselineSnapshot?: {
        id: string;
        title: string;
        description: string;
      };
      competitors: string[];
      reviewSignals: string[];
      tokenCount: number;
      generatedAt: Timestamp;
    };
    lastGeneration?: {
      prompt: string;
      result: string;
      strategy: string;
      timestamp: Timestamp;
    };
  };
}
```

### Complete Example (EN state)

```json
{
  "state_en": {
    "keywords": {
      "kw-001": {
        "keyword": "photo editor app",
        "difficulty": 4.5,
        "confidence": 87,
        "searchVolume": 45000,
        "competition": 62,
        "monthlyInstalls": {
          "low": 150,
          "realistic": 450,
          "high": 900
        },
        "recommendation": "HIGH_CONFIDENCE",
        "createdAt": "2026-06-10T05:30:00Z",
        "addedBy": "user-123"
      }
    },
    "snapshots": {
      "snap-001": {
        "appId": "app-456",
        "type": "BASELINE",
        "name": "PhotoEdit Pro - Current",
        "title": "PhotoEdit Pro - Professional Photo Editing",
        "description": "Edit photos with professional-grade tools...",
        "metrics": [
          {
            "installs": 5200,
            "rating": 4.3,
            "reviews": 2340,
            "recordedAt": "2026-06-03T00:00:00Z"
          }
        ],
        "status": "ACTIVE",
        "createdAt": "2026-05-20T10:15:00Z"
      }
    },
    "synthesis": {
      "context": {
        "keywords": ["photo editor app", "image editor"],
        "keywordScores": {
          "photo editor app": 87,
          "image editor": 65
        },
        "baselineSnapshot": {
          "id": "snap-001",
          "title": "PhotoEdit Pro - Professional Photo Editing",
          "description": "Edit photos with professional-grade tools..."
        },
        "competitors": ["Snapseed", "Adobe Lightroom"],
        "reviewSignals": ["easy to use", "powerful filters"],
        "tokenCount": 3240,
        "generatedAt": "2026-06-10T05:45:00Z"
      }
    }
  },
  "state_ar": {
    "keywords": { /* Same structure in Arabic labels */ },
    "snapshots": { /* Same structure, Arabic descriptions */ },
    "synthesis": { /* Arabic prompts and context */ }
  }
}
```

---

## Strict Data Lifecycle Rules

### Rule 1: Producer Isolation (Mandatory)

**Definition:** Each Producer owns exclusive write access to its domain within state.

**Boundaries:**
- **KeywordValidatorProducer** owns: state.keywords.*
- **ExperimentSnapshotsProducer** owns: state.snapshots.*
- **ASOSynthesizerProducer** owns: state.synthesis.*

**Enforcement:**
```typescript
class ProducerRegistry {
  verifyIsolation(
    vaultBefore: WorkspaceStagingVault,
    vaultAfter: WorkspaceStagingVault,
    producerName: string
  ): boolean {
    // Throw IsolationViolationError if producer modifies 
    // any state outside its boundary
    const changedPaths = diffVault(vaultBefore, vaultAfter);
    const allowedPaths = getProducerBoundary(producerName);
    
    for (const path of changedPaths) {
      if (!allowedPaths.includes(path)) {
        throw new IsolationViolationError(
          `Producer ${producerName} attempted to modify ${path}`
        );
      }
    }
    return true;
  }
}
```

**Violation Examples:**
- ❌ KeywordValidator tries to write to snapshots.*
- ❌ ExperimentSnapshots tries to write to synthesis.context
- ❌ ASOSynthesizer tries to write to keywords.*

**Cross-Feature Access (Allowed):**
- ✅ ASOSynthesizer reads keywords.* to build context
- ✅ ExperimentSnapshots reads synthesis.lastGeneration for UI
- ✅ KeywordValidator reads snapshots.* for metadata

### Rule 2: Synthesis Context Priority (Mandatory)

**Definition:** ASOSynthesizerService must consume vault data in strict priority order for token-aware extraction.

**Priority Stack (Descending):**

1. **High-Confidence Keywords** (confidence ≥ 75%)
   - Maximum 2,000 tokens allocated
   - First choice for synthesis
   - Example: "photo editor app" (confidence: 87%)

2. **Medium-Confidence Keywords** (50-75%)
   - Maximum 1,500 tokens allocated
   - Used if high-confidence exhausted
   - Example: "image editor" (confidence: 65%)

3. **Baseline Snapshot Metadata**
   - Maximum 1,000 tokens allocated
   - Current title, description, category
   - Prevents generating replacements, only variants

4. **Competitive Intelligence**
   - Maximum 1,000 tokens allocated
   - Competitor packages, top keywords
   - Market positioning context

5. **Review Signals**
   - Maximum 500 tokens allocated
   - User feedback themes, pain points
   - Secondary optimization hints

**Token Budget Enforcement:**
```typescript
class SynthesisContextBuilder {
  buildContext(vault: WorkspaceStagingVault): ContextWithTokenCount {
    const budgetRemaining = 6000;  // Max token budget
    const context = {};
    
    // Priority 1: High-confidence keywords (0-2000 tokens)
    const highConfidence = vault.state_en.keywords
      .filter(k => k.confidence >= 75)
      .slice(0, highConfidenceTokenBudget / avgTokensPerKeyword);
    context.keywords = highConfidence;
    budgetRemaining -= tokenCount(highConfidence);
    
    // Priority 2: Medium-confidence keywords (0-1500 tokens)
    const mediumConfidence = vault.state_en.keywords
      .filter(k => k.confidence < 75 && k.confidence >= 50)
      .slice(0, (1500 / avgTokensPerKeyword));
    context.keywords.push(...mediumConfidence);
    budgetRemaining -= tokenCount(mediumConfidence);
    
    // ... continue for priorities 3-5
    
    // Auto-truncate if over budget
    if (context.totalTokens > 6000) {
      truncateToTokenBudget(context, 6000);
    }
    
    return { context, tokenCount: context.totalTokens };
  }
}
```

**Example Consumption by ASOSynthesizerService:**
```typescript
const synthesizer = new ASOSynthesizerService();
const context = contextBuilder.buildContext(vault);

const prompt = `
You are an App Store Optimization expert.

Current app: ${context.baselineSnapshot.title}
Description: ${context.baselineSnapshot.description}

Top keywords (high-confidence):
${context.keywords
  .filter(k => k.confidence >= 75)
  .map(k => \`- \${k.keyword} (confidence: \${k.confidence}%)\`)
  .join('\n')}

Competitor positioning:
${context.competitors.map(c => \`- \${c}\`).join('\n')}

User feedback themes:
${context.reviewSignals.join(', ')}

Generate an optimized listing that:
1. Incorporates high-confidence keywords naturally
2. Does NOT make false promises
3. Maintains current structure as baseline
4. Improves upon current rating by 0.5+ stars
`;

const result = await callGemini(prompt);
```

### Rule 3: Safety & Backwards Compatibility (Mandatory)

**Definition:** Vault schema never breaks existing clients. Evolution is additive only.

**Core Principles:**

1. **Never Delete Keys**
   ```typescript
   // ❌ WRONG: Hard delete
   delete vaultAfter.state_en.keywords['kw-001'];
   
   // ✅ CORRECT: Soft delete
   vaultAfter.state_en.keywords['kw-001'].deleted_at = now();
   ```

2. **Never Rename Fields**
   ```typescript
   // ❌ WRONG: Rename field
   vaultAfter.state_en.keywords[id].difficulty_score = 4.5;
   delete vaultAfter.state_en.keywords[id].difficulty;
   
   // ✅ CORRECT: Add new field, deprecate old
   vaultAfter.state_en.keywords[id].difficulty_score_v2 = 4.5;
   // Keep difficulty for backward compatibility
   ```

3. **Additive Schema Evolution Only**
   ```typescript
   // ✅ CORRECT: Add new fields
   interface Keyword {
     // Existing fields (unchanged)
     keyword: string;
     difficulty: number;
     confidence: number;
     
     // NEW FIELDS (non-breaking)
     aiRecommendation?: string;      // Optional
     costPerInstall?: number;        // Optional with default
     lastValidatedAt?: Timestamp;    // Optional
   }
   
   // Old clients ignore new fields
   // New clients handle missing fields gracefully
   ```

4. **Feature Flag Gating**
   ```typescript
   if (flags.advanced_metrics_enabled) {
     // Display new cost_per_install metric
     showCostPerInstallColumn = true;
   }
   // Graceful degradation if flag disabled
   ```

**Soft Delete Pattern:**
```typescript
interface SoftDeletableEntity {
  id: string;
  // ... data fields ...
  deleted_at: Timestamp | null;  // null = active, timestamp = deleted
  is_deleted: boolean;           // Convenience flag
}

// Querying (always filter soft-deleted)
const activeKeywords = vault.state_en.keywords
  .filter(k => !k.is_deleted);

// Recovery (undelete by clearing deleted_at)
vault.state_en.keywords[id].deleted_at = null;
vault.state_en.keywords[id].is_deleted = false;
```

---

## How ASOSynthesizerService Consumes Vault Data

### Data Flow Diagram

```
WorkspaceStagingVault
  │
  ├─ state_en.keywords → SynthesisContextBuilder → High/Medium confidence filter
  ├─ state_en.snapshots → Baseline metadata extraction
  ├─ state_en.synthesis.context → Token-aware prioritization
  └─ Competitors/Review signals → Context enrichment
       │
       ↓
    ContextWithTokenCount (6000 token max)
       │
       ↓
    ASOSynthesizerService.generateListing()
       │
       ├─ Constraint validation (no false promises)
       ├─ Gemini 2.5-Flash API call
       └─ Result staging in vault.state_en.synthesis.lastGeneration

       ↓
    User reviews → Publish or iterate
```

### Implementation

```typescript
class ASOSynthesizerService {
  async generateListing(
    vaultId: UUID,
    workspaceId: UUID,
    locale: 'en' | 'ar'
  ): Promise<GeneratedListing> {
    // 1. Fetch vault
    const vault = await vaultRouter.getVault(workspaceId, vaultId);
    const state = locale === 'en' ? vault.state_en : vault.state_ar;
    
    // 2. Build token-aware context
    const context = await contextBuilder.buildContext(state);
    
    // 3. Construct prompt with constraints
    const prompt = this.buildPrompt(context, state);
    
    // 4. Call LLM
    const result = await gemini.generateText(prompt);
    
    // 5. Validate framing (no false promises)
    this.validateFraming(result);
    
    // 6. Stage result in vault
    const producer = this.producerRegistry.getProducer('synthesizer');
    const vaultAfter = {
      ...vault,
      state_en: {
        ...state,
        synthesis: {
          ...state.synthesis,
          lastGeneration: {
            prompt: prompt,
            result: result.text,
            strategy: result.strategy,
            timestamp: now()
          }
        }
      }
    };
    
    // 7. Verify isolation
    producer.verifyIsolation(vault, vaultAfter);
    
    // 8. Persist
    await vaultRouter.persistVault(vaultAfter);
    
    return {
      title: result.title,
      description: result.description,
      strategy: result.strategy,
      stagedAt: now()
    };
  }
  
  private buildPrompt(context: ContextWithTokenCount, state: StateSnapshot): string {
    return `
You are an App Store Optimization expert for ${state.synthesis.context.baselineSnapshot?.title}.

CONSTRAINTS:
- Do NOT make false promises or absolute claims
- Use language like "Designed to" and "Helps" instead of "Guaranteed"
- Incorporate high-confidence keywords naturally (confidence ≥ 75%)
- This is a VARIANT of existing listing, not a replacement

HIGH-CONFIDENCE KEYWORDS (use these):
${state.keywords
  .filter(k => k.confidence >= 75)
  .map(k => `- ${k.keyword} (confidence: ${k.confidence}%)`)
  .join('\n')}

CURRENT BASELINE:
Title: ${state.synthesis.context.baselineSnapshot?.title}
Description: ${state.synthesis.context.baselineSnapshot?.description}

GENERATE: An improved variant title and description that:
1. Incorporates high-confidence keywords
2. Maintains framing validity (no false promises)
3. Targets 0.5+ star improvement
4. Stays within word limits
    `;
  }
  
  private validateFraming(result: LLMResult): void {
    const forbiddenPhrases = [
      'guaranteed',
      '100% will',
      'always works',
      'never fails',
      'proven to'
    ];
    
    const text = (result.title + ' ' + result.description).toLowerCase();
    for (const phrase of forbiddenPhrases) {
      if (text.includes(phrase)) {
        throw new FramingViolationError(
          `Generated text contains forbidden phrase: "${phrase}"`
        );
      }
    }
  }
}
```

---

## Zero-Breaking-Changes Deployment Strategy

### Core Principle

**All updates maintain 100% backwards compatibility.** Old clients work with new vault schema. New clients handle missing fields gracefully.

### Implementation

#### Schema Evolution (Additive Only)
```typescript
// Version 1.0 (Original)
interface Keyword {
  keyword: string;
  difficulty: number;
  confidence: number;
}

// Version 1.1 (Non-breaking addition)
interface Keyword {
  keyword: string;
  difficulty: number;
  confidence: number;
  searchVolume?: number;      // NEW: Optional with default
  competition?: number;       // NEW: Optional with default
}

// Version 1.2 (Non-breaking addition)
interface Keyword {
  keyword: string;
  difficulty: number;
  confidence: number;
  searchVolume?: number;
  competition?: number;
  aiRecommendation?: 'HIGH_CONFIDENCE' | 'MEDIUM_OPPORTUNITY' | 'SKIP';  // NEW
}

// Old client (v1.0) reads v1.2 vault:
// - Ignores searchVolume, competition, aiRecommendation
// - Continues working with keyword, difficulty, confidence

// New client (v1.2) reads v1.0 vault:
// - Gets undefined for searchVolume, competition, aiRecommendation
// - Handles gracefully with default values
```

#### Feature Flag Gating
```typescript
// Deploy new feature behind flag (disabled by default)
if (flags.advanced_keyword_metrics_enabled) {
  // Display search volume, competition, recommendations
  showAdvancedMetrics = true;
}

// Gradual rollout
// Day 1: 10% of users see flag=true
// Day 2: Monitor error rates, metrics
// Day 3: 50% of users
// Day 5: 100% of users
// Day 7: Remove flag, feature permanent

// Instant rollback: Set flag=false for all users
```

#### Deployment Checklist
- [ ] All schema changes are additive (no deletes/renames)
- [ ] All new fields are optional or have defaults
- [ ] Old clients can read new vault (graceful degradation)
- [ ] New clients can read old vault (sensible defaults)
- [ ] Feature flags guard new UI/logic
- [ ] Soft-delete used instead of hard-delete
- [ ] Change count incremented for audit trail
- [ ] Tests verify backwards compatibility

---

## Maintenance Guidelines

### Adding a New Feature (Step-by-Step)

1. **Create New Producer Class**
   ```typescript
   class MyNewFeatureProducer implements StagedStateProducer {
     featureName = 'my_new_feature';
     targetFeature = 'my_new_feature';
     
     canModify(feature: string): boolean {
       return feature === 'my_new_feature';
     }
     
     verifyIsolation(before, after): boolean {
       // Verify only my_new_feature.* changed
     }
   }
   ```

2. **Register with ProducerRegistry**
   ```typescript
   registry.registerProducer(new MyNewFeatureProducer());
   ```

3. **Extend Vault Schema (Additive)**
   ```typescript
   interface StateSnapshot {
     // ... existing ...
     my_new_feature?: {  // Optional, non-breaking
       // Your feature state
     };
   }
   ```

4. **Build Service Layer**
   - Read from vault via SynthesisContextBuilder if needed
   - Write to vault via Producer pattern
   - Always verify isolation before persist

5. **Build UI Components**
   - Use useLocale() for bilingual support
   - Use CSS logical properties for RTL
   - Handle missing vault fields gracefully

6. **Add Feature Flag**
   ```typescript
   if (flags.my_new_feature_enabled) {
     // Show UI component
   }
   ```

7. **Test Backwards Compatibility**
   - Old client (without new_feature flag) reads new vault → works
   - New client (with flag) reads old vault → works with defaults

---

## Summary Table

| Aspect | Rule | Enforcement |
|--------|------|-------------|
| **Producer Isolation** | One feature, one boundary | ProducerRegistry.verifyIsolation() |
| **Synthesis Priority** | Keywords → Snapshots → Competitors → Reviews | SynthesisContextBuilder priority stack |
| **Token Budget** | Max 6,000 tokens per generation | Auto-truncation in contextBuilder |
| **Soft Delete** | Never hard-delete, use deleted_at | Soft-delete pattern on all entities |
| **Additive Evolution** | Never rename/delete fields | Schema review before deploy |
| **Feature Flags** | Guard new features | Gradual rollout: 10% → 50% → 100% |
| **Backwards Compatibility** | Old clients work with new schema | Optional fields with sensible defaults |

---

**End of Document**

**Version:** 1.0  
**Last Updated:** June 10, 2026  
**Scope:** Growth Hub Staging Vault Architecture  
**Status:** Production Reference
