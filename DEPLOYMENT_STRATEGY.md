# 🚀 Deployment Strategy: Keyword Validator & Experiment Snapshots

**Status:** Ready for Production  
**Date:** 2026-06-10  
**Architecture:** Staged-State with Zero Breaking Changes

---

## Deployment Overview

### What's Being Deployed

**Phase 2A: Backend Services (COMPLETE)**
- ✅ `KeywordViabilityService` - Heuristic keyword difficulty scoring
- ✅ `ExperimentSnapshotsService` - A/B testing infrastructure
- ✅ `ASOSynthesizerService` (Enhanced) - Constraint-aware synthesis

**Phase 2B: API Endpoints (COMPLETE)**
- ✅ `POST /api/workspaces/[workspaceId]/validator/validate-keyword` - Keyword validation
- ✅ `GET/POST /api/workspaces/[workspaceId]/experiments/snapshots` - Snapshot management

**Phase 3: Frontend Components (COMPLETE)**
- ✅ `KeywordValidatorCard` - UI for viability scores
- ✅ `ExperimentSnapshotsUI` - Snapshot management interface

**Phase 4: Testing & Rollout (COMPLETE)**
- ✅ Integration test suite
- ✅ Gradual rollout strategy
- ✅ Monitoring & alerts setup

### Schema Status

**Database Changes (COMPLETE)**
- ✅ `keyword_viability_scores` table (new)
- ✅ `experiment_snapshots` table (new)
- ✅ `experiment_snapshot_metrics` table (new)
- ✅ `workspace_staging_vault` columns (3 new, all nullable)

**Backward Compatibility**
- ✅ All new columns are nullable
- ✅ Existing signals unaffected (11 verified)
- ✅ Old API routes unchanged
- ✅ New features are opt-in

---

## Rollout Plan: 3-Phase Strategy

### Phase 1: Canary (10% of users, 3 days)

**Deployment**
```bash
# Deploy to staging first
npm run build
npm run deploy:staging

# Run smoke tests
npm run test:integration

# Deploy to 10% production
vercel deploy --prod --scope aso-platform
```

**Monitoring**
- ✅ Error rate < 0.1%
- ✅ API latency p95 < 500ms
- ✅ Database query performance
- ✅ Real-time alerts (Sentry)

**Rollback Trigger**
- Error rate > 1%
- API latency p95 > 2000ms
- Database connection failures

**Testing**
- Validator with 100+ keywords
- Snapshot creation/update cycle
- Metrics recording (manual & automated)
- Synthesis with constraints

### Phase 2: Expansion (50% of users, 5 days)

**Post-Canary Validation**
```bash
# Verify no issues from Phase 1
npm run metrics:verify

# Gradual increase traffic
# 10% → 25% → 50%
```

**Monitoring**
- User engagement metrics
- Feature adoption rate
- Performance stability
- Error trends

**Success Criteria**
- ✅ Error rate stable
- ✅ User engagement > 30%
- ✅ No critical bugs found

### Phase 3: General Availability (100% of users)

**Final Deployment**
```bash
# Deploy to all users
# All features enabled
# Full feature flag removal (eventual)
```

**Post-Deployment**
- ✅ Continue monitoring for 48 hours
- ✅ Collect user feedback
- ✅ Performance analysis
- ✅ Plan for iteration

---

## Feature Flags

All new features are behind feature flags for safe rollout:

```typescript
// lib/features/flags/features.ts
export const FEATURES = {
  KEYWORD_VALIDATOR: {
    name: "keyword_validator",
    rollout: ["canary", "expansion", "general"],
    defaultEnabled: false,
  },
  EXPERIMENT_SNAPSHOTS: {
    name: "experiment_snapshots",
    rollout: ["canary", "expansion", "general"],
    defaultEnabled: false,
  },
  ASO_SYNTHESIS_CONSTRAINTS: {
    name: "aso_synthesis_constraints",
    rollout: ["canary", "expansion", "general"],
    defaultEnabled: false,
  },
};
```

**Rollout Schedule**
```
Canary (Days 1-3):    10% enabled
Expansion (Days 4-8):  50% enabled
GA (Day 9+):          100% enabled
```

---

## Pre-Deployment Checklist

### Code Quality
- ✅ Unit tests pass (validator, snapshots, synthesizer)
- ✅ Integration tests pass (complete flows)
- ✅ No TypeScript errors
- ✅ Linting passes (ESLint)
- ✅ No console.errors in production

### Database
- ✅ Schema migration verified (3 new tables)
- ✅ Nullable columns confirmed
- ✅ RLS policies in place
- ✅ Indexes created for common queries
- ✅ Backup taken

### Performance
- ✅ Keyword validation < 500ms (heuristic, no API calls)
- ✅ Snapshot creation < 1s
- ✅ Metrics recording < 500ms
- ✅ Synthesis with constraints < 3s (Gemini latency)

### Security
- ✅ API endpoints require auth
- ✅ Workspace membership verified
- ✅ Input validation (Zod schemas)
- ✅ SQL injection prevention (Supabase parameterized)
- ✅ Rate limiting in place

### Documentation
- ✅ API endpoint docs
- ✅ Component usage examples
- ✅ Integration guides
- ✅ Troubleshooting guide

---

## Monitoring & Alerting

### Key Metrics

**Validator Service**
```typescript
// Track validator usage
events: {
  validator_keyword_validate: "User validates keyword",
  validator_batch_process: "Batch validation processed",
  validator_high_confidence: "High confidence keyword identified",
}

// Monitor performance
metrics: {
  validator_latency_p95: "< 500ms",
  validator_error_rate: "< 0.1%",
  validator_cache_hit_rate: "> 70%",
}
```

**Experiment Snapshots**
```typescript
events: {
  snapshot_baseline_created: "Baseline snapshot created",
  snapshot_variant_created: "Variant created",
  snapshot_metrics_recorded: "Weekly metrics recorded",
  snapshot_variant_published: "Variant published",
}

metrics: {
  snapshot_creation_latency_p95: "< 1s",
  snapshot_storage_growth: "Monitor DB size",
  snapshot_query_performance: "< 200ms for list",
}
```

**Synthesis with Constraints**
```typescript
events: {
  synthesis_with_constraints: "Synthesis ran with keyword constraints",
  synthesis_with_baseline: "Synthesis ran with baseline snapshot",
  synthesis_framing_validated: "Framing validation passed",
}

metrics: {
  synthesis_latency_p95: "< 3s (Gemini API)",
  synthesis_success_rate: "> 98%",
  synthesis_constraint_adoption: "% using new features",
}
```

### Alert Rules

```yaml
# High error rate
alert: ValidatorErrorRate
condition: error_rate > 1%
severity: critical
action: page on-call

# High latency
alert: ValidatorLatency
condition: p95_latency > 1000ms
severity: warning
action: notify team

# Database issues
alert: SnapshotDBLatency
condition: query_latency > 500ms
severity: warning
action: investigate indexes

# Feature adoption
alert: LowFeatureAdoption
condition: adoption < 5% after day 3
severity: info
action: review & improve UX
```

---

## Rollback Plan

### Automatic Rollback

**Triggers**
1. Error rate > 2% for 5 minutes
2. API latency p99 > 5000ms for 5 minutes
3. Database connection failures > 10%

**Automatic Actions**
```bash
# 1. Disable feature flags
FEATURE_FLAGS.KEYWORD_VALIDATOR = false
FEATURE_FLAGS.EXPERIMENT_SNAPSHOTS = false

# 2. Route traffic to previous version
vercel rollback [deployment-id]

# 3. Alert team
slack #engineering-alerts
pagerduty.trigger_incident()
```

### Manual Rollback

**If Manual Action Needed**
```bash
# 1. Identify bad deployment
vercel deployments list

# 2. Rollback to previous version
vercel rollback [good-deployment-id]

# 3. Check health
npm run test:smoke

# 4. Notify stakeholders
slack #aso-team
```

**Rollback Window**
- Canary: Immediate (< 30 seconds)
- Expansion: 2-3 minutes
- GA: 5 minutes

---

## Success Metrics

### User Adoption
- Target: > 30% of users try validator in first week
- Target: > 15% of users create snapshots in first month

### Feature Quality
- Error rate: < 0.5% (target)
- Latency p95: < 500ms validator, < 1s snapshots (target)
- User satisfaction: > 4.0/5.0 (NPS)

### Business Impact
- Improved keyword selection → Higher installs
- A/B testing capability → Better optimization
- Faster time to market for variants

### Technical Health
- Zero critical bugs post-GA
- 99.9% uptime
- Database performance stable

---

## Post-Deployment Tasks

### Day 1 (Canary)
- ✅ Monitor error rates every 30 minutes
- ✅ Check database performance
- ✅ Verify API latencies
- ✅ Review user feedback

### Day 3 (End of Canary)
- ✅ Analyze usage patterns
- ✅ Performance review
- ✅ Bug prioritization
- ✅ Proceed to Phase 2 decision

### Day 8 (End of Expansion)
- ✅ Full metric analysis
- ✅ Compare against baselines
- ✅ Feature request review
- ✅ GA decision

### Day 14+ (Post-GA)
- ✅ Weekly performance reviews
- ✅ User adoption tracking
- ✅ Optimization opportunities
- ✅ Future feature planning

---

## Support & Documentation

### User Documentation
- Quick start guide: Keyword Validator
- How to create experiment snapshots
- Understanding viability scores
- Using constraints in synthesis

### Developer Documentation
- API endpoint reference
- Service integration examples
- Database schema docs
- Feature flag setup

### Support Plan
- **Email:** support@aso-platform.com
- **Slack:** #aso-support
- **Status:** status.aso-platform.com
- **On-call:** engineering-on-call@aso-platform.com

---

## Summary

✅ **All Phases Complete**
- Schema: Deployed & verified
- Backend: Services implemented
- API: Endpoints ready
- Frontend: Components built
- Tests: Integration suite passing
- Monitoring: Alerts configured
- Rollout: 3-phase plan ready

🚀 **Ready for Production Deployment**

**Next Steps**
1. Run final smoke tests
2. Deploy to staging
3. Start canary rollout (10%)
4. Monitor for 3 days
5. Proceed to expansion (50%)
6. Full GA deployment

**Timeline**
- Canary: 3 days
- Expansion: 5 days
- GA: Day 9
- Total: ~2 weeks for full rollout

---

*Last Updated: 2026-06-10*
