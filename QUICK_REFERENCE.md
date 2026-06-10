# 🚀 QUICK REFERENCE: Full Implementation

## Files & Locations

### Backend Services
```
src/lib/validator/keyword-viability-service.ts          # Keyword scoring
src/lib/experiment/experiment-snapshots-service.ts      # A/B snapshots
src/lib/synthesis/aso-synthesizer-service.ts           # Enhanced synthesis
```

### API Endpoints
```
app/api/workspaces/[workspaceId]/validator/validate-keyword/route.ts
app/api/workspaces/[workspaceId]/experiments/snapshots/route.ts
```

### Components
```
src/components/validator/keyword-validator-card.tsx      # Viability display
src/components/experiments/experiment-snapshots-ui.tsx   # Snapshot manager
```

### Tests & Docs
```
src/__tests__/integration/validator-snapshots.test.ts
DEPLOYMENT_STRATEGY.md
ALL_PHASES_COMPLETE.md
QUICK_REFERENCE.md (this)
```

---

## API Quick Start

### Validate a Keyword
```bash
curl -X POST http://localhost:3000/api/workspaces/{workspaceId}/validator/validate-keyword \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "photo editor app",
    "category": "photo",
    "language": "en"
  }'
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "keyword": "photo editor app",
    "recommendation": "high_confidence",
    "confidence": 85,
    "difficulty": {
      "difficulty": 3.5,
      "searchVolume": 45000,
      "competition": 65
    },
    "monthlyInstalls": {
      "low": 150,
      "medium": 450,
      "high": 900
    },
    "tags": ["long-tail", "easy-rank"]
  }
}
```

---

### Create Baseline Snapshot
```bash
curl -X POST http://localhost:3000/api/workspaces/{workspaceId}/experiments/snapshots \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create_baseline",
    "appId": "{appId}",
    "title": "PhotoEdit Pro",
    "shortDescription": "Professional photo editing",
    "fullDescription": "Full description here...",
    "language": "en"
  }'
```

---

### Create Variant
```bash
curl -X POST http://localhost:3000/api/workspaces/{workspaceId}/experiments/snapshots \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create_variant",
    "appId": "{appId}",
    "baselineSnapshotId": "{baselineId}",
    "variantName": "Variant A - Emojis",
    "changes": {
      "title": "🎨 PhotoEdit Pro"
    },
    "hypothesis": "Emojis increase CTR",
    "language": "en"
  }'
```

---

### Record Metrics
```bash
curl -X POST http://localhost:3000/api/workspaces/{workspaceId}/experiments/snapshots \
  -H "Content-Type: application/json" \
  -d '{
    "action": "record_metrics",
    "snapshotId": "{snapshotId}",
    "weekNumber": 1,
    "impressions": 5000,
    "installs": 150,
    "uninstalls": 5,
    "crashRate": 0.2,
    "rating": 4.5,
    "reviews": 25,
    "metricsSource": "manual"
  }'
```

---

### List Snapshots
```bash
curl http://localhost:3000/api/workspaces/{workspaceId}/experiments/snapshots?appId={appId}
```

---

## Component Usage

### KeywordValidatorCard
```tsx
import { KeywordValidatorCard } from "@/components/validator/keyword-validator-card";

export default function MyComponent() {
  const handleSelect = (keyword: string) => {
    console.log("Selected:", keyword);
    // Stage the keyword
  };

  return (
    <KeywordValidatorCard
      keyword={viabilityScore}
      locale="en"
      isRtl={false}
      onSelect={handleSelect}
    />
  );
}
```

### ExperimentSnapshotsUI
```tsx
import { ExperimentSnapshotsUI } from "@/components/experiments/experiment-snapshots-ui";

export default function MyComponent() {
  return (
    <ExperimentSnapshotsUI
      appId={appId}
      workspaceId={workspaceId}
      locale="en"
      isRtl={false}
    />
  );
}
```

---

## Service Usage

### KeywordViabilityService
```typescript
import { KeywordViabilityService } from "@/lib/validator/keyword-viability-service";

const validator = new KeywordViabilityService();

// Validate single keyword
const score = await validator.validateKeyword(
  "photo editor app",
  "photo",
  "en"
);

// Batch validate
const scores = await validator.validateKeywordsBatch(
  ["photo app", "image editor", "photo filters"],
  "photo"
);

// Get top keywords
const top5 = await validator.getTopKeywords(keywords, 5, "photo");
```

### ExperimentSnapshotsService
```typescript
import { ExperimentSnapshotsService } from "@/lib/experiment/experiment-snapshots-service";

const service = new ExperimentSnapshotsService(appId, workspaceId);
await service.init(); // Initialize Supabase

// Create baseline
const baseline = await service.createBaseline(
  "PhotoEdit Pro",
  "Professional photo editing",
  "Full description...",
  "en"
);

// Create variant
const variant = await service.createVariant(
  baselineId,
  "Variant A",
  { title: "🎨 PhotoEdit Pro" },
  "Testing emoji titles"
);

// Record metrics
await service.recordWeeklyMetrics(snapshotId, 1, {
  impressions: 5000,
  installs: 150,
  uninstalls: 5,
  crashRate: 0.2,
  rating: 4.5,
  reviews: 25,
  metricsSource: "manual"
});

// Compare performance
const comparison = await service.comparePerformance(baselineId, variantId);
console.log(comparison.improvement); // { installs: 50, rating: 0.3 }
```

### ASOSynthesizerService
```typescript
import { ASOSynthesizerService } from "@/lib/synthesis/aso-synthesizer-service";

const synthesizer = new ASOSynthesizerService();

// With constraints
const output = await synthesizer.synthesizeListingWithConstraints({
  appName: "PhotoEdit",
  appCategory: "photo",
  language: "en",
  locale: "en-US",
  reviewItems: ["Easy interface"],
  marketItems: ["Growing demand"],
  competitorItems: ["Lacks batch processing"],
  keywordViabilityScores: [
    { keyword: "photo editor", confidence: 85, recommendation: "high_confidence" }
  ]
});

// Without constraints (backward compatible)
const output2 = await synthesizer.synthesizeListing({
  appName: "PhotoEdit",
  appCategory: "photo",
  language: "en",
  locale: "en-US",
  reviewItems: ["Easy interface"],
  marketItems: [],
  competitorItems: []
});
```

---

## Testing

### Run Tests
```bash
npm run test:integration

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Test Commands
```bash
# All tests
npm test

# Specific file
npm test validator-snapshots.test.ts

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

---

## Deployment

### Pre-Deployment Checklist
```bash
# 1. Run all tests
npm run test:integration

# 2. Build
npm run build

# 3. Check for errors
npm run lint

# 4. Type check
npx tsc --noEmit
```

### Deploy to Staging
```bash
# Set environment
export ENVIRONMENT=staging

# Deploy
vercel deploy --prod --scope aso-platform

# Run smoke tests
npm run test:smoke
```

### Deploy to Production (Canary 10%)
```bash
# Enable canary feature flags
FEATURE_FLAGS.KEYWORD_VALIDATOR=canary
FEATURE_FLAGS.EXPERIMENT_SNAPSHOTS=canary
FEATURE_FLAGS.ASO_SYNTHESIS_CONSTRAINTS=canary

# Deploy
vercel deploy --prod --scope aso-platform

# Monitor
npm run metrics:watch
```

---

## Monitoring

### Key Metrics to Watch
```
keyword_validator_error_rate        # Should be < 0.1%
keyword_validator_latency_p95       # Should be < 500ms
experiment_snapshot_creation        # Track usage
synthesis_with_constraints          # Track adoption
```

### Alert Thresholds
```
Error rate > 1%           → Page on-call
Latency p95 > 500ms       → Warning
DB latency > 1000ms       → Critical
Feature adoption < 5%     → Investigate UX
```

---

## Troubleshooting

### Keyword Validator Not Working
1. Check if `KeywordViabilityService` is initialized
2. Verify `GOOGLE_GENERATIVE_AI_API_KEY` is set
3. Check error logs for API failures

### Snapshots Not Saving
1. Verify Supabase connection
2. Check if `workspace_staging_vault` tables exist
3. Confirm RLS policies are correct

### Synthesis Not Using Constraints
1. Verify `keywordViabilityScores` are passed
2. Check if scores have `confidence >= 75%`
3. Review Gemini response parsing

---

## Performance Tips

### Optimize Keyword Validation
- Use batch validation for multiple keywords
- Cache results for 24 hours
- Use `getTopKeywords` for ranked results

### Optimize Snapshots
- Paginate snapshot lists
- Cache baseline snapshots
- Use indexes on `workspace_id`, `app_id`

### Optimize Synthesis
- Reuse service instances
- Cache Gemini responses by input hash
- Use timeouts (3s max)

---

## Bilingual Support

### English
```typescript
locale: "en"
isRtl: false
```

### Arabic
```typescript
locale: "ar"
isRtl: true
```

### Component Props
```tsx
<KeywordValidatorCard
  locale={locale === 'ar' ? 'ar' : 'en'}
  isRtl={locale === 'ar'}
/>
```

---

## Next Steps

1. **Review** the code
2. **Run** the tests
3. **Deploy** to staging
4. **Monitor** the canary rollout
5. **Expand** to 50%
6. **Go** live with GA

---

## Helpful Commands

```bash
# Check schema
psql -h localhost -U postgres -d postgres \
  -c "SELECT * FROM keyword_viability_scores LIMIT 1;"

# Clear cache
redis-cli FLUSHDB

# View logs
docker logs app-container

# Monitor performance
npm run metrics:live

# Generate report
npm run report:generate
```

---

**Last Updated:** 2026-06-10  
**Status:** 🟢 Ready for Production
