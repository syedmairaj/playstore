# Complete Staging Vault Deployment Checklist

**Status:** Ready to implement & deploy  
**Date:** June 4, 2026

---

## Pre-Deployment Verification ✅

### Backend is Ready
```
☐ Database migration applied: workspace_staging_vault table exists
☐ API endpoints created:
  ☐ POST /api/workspaces/[id]/staging/add
  ☐ GET /api/workspaces/[id]/staging/list
☐ RLS policies configured for workspace isolation
☐ staging-vault-service.ts implemented
☐ getAppVaultContext() function ready
```

### Toast System Ready
```
☐ hooks/useToast.ts created
☐ components/Toast.tsx created
☐ ToastContainer added to root layout
☐ Test: npm run dev → Click button → Toast appears
```

### StageButton Component Ready
```
☐ components/staging/StageButton.tsx created
☐ RTL/LTR auto-detection working
☐ Props interface complete
☐ Error handling in place
☐ Loading spinner while posting
```

### Integration Modules Ready
```
☐ lib/staging-vault/keyword-tracker-staging.ts
☐ lib/staging-vault/alerts-staging.ts
☐ lib/staging-vault/staging-vault-service.ts
☐ hooks/useVault.ts (for Optimizer fetching)
```

---

## Phase 1: Code Implementation (45 minutes)

### File 1: components/reviews/IssueCard.tsx
```
Time: ~10 minutes

☐ Open file: Ctrl+P → IssueCard.tsx
☐ Line 1: ADD import { StageButton } from "@/components/staging/StageButton"
☐ Lines 137-140: DELETE state variables (status, busy)
☐ Lines 144-163: DELETE handleClick function
☐ Lines 216-264: DELETE TooltipProvider section entirely
☐ After line 215 (CardContent tag): PASTE StageButton code
☐ Top of file: DELETE unused imports:
    - ArrowRight, CheckCircle2, PlusCircle
    - TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent
☐ DELETE CTA_CONFIG constant
☐ DELETE type PipelineStatus
☐ DELETE type CtaConfig
☐ SAVE file (Ctrl+S)
```

**Copy-Paste Code Block:**
```typescript
<StageButton
  signalType="review_issue"
  content={issue.title}
  source="review_analysis"
  workspaceId={workspaceId}
  sourceAppId={appId || ""}
  language="en"
  metadata={{
    description: issue.description,
    severity: issue.severity,
    impactPercent: impactPct,
    quote: issue.quote,
  }}
  variant="primary"
  size="md"
  className="mt-1 w-full"
/>
```

✅ **Verification:**
```bash
npm run build  # Should compile without errors
# Check: No imports for deleted components
# Check: No references to handleClick or CTA_CONFIG
```

---

### File 2: components/market/MarketIntelligenceClient.tsx
```
Time: ~10 minutes

☐ Open file: Ctrl+P → MarketIntelligenceClient.tsx
☐ Line 1: ADD import { StageButton } from "@/components/staging/StageButton"
☐ Lines 142-207: DELETE entire OptimizeWithSpotlightButton function
☐ After line 141: PASTE new OptimizeWithSpotlightButton function
☐ FIND where OptimizeWithSpotlightButton is called (Ctrl+F)
☐ ADD ownAppId={ownAppId} prop to the call
☐ Top of file: DELETE unused imports:
    - ArrowRight, Wand2
    - import { useRouter } from "@/i18n/navigation"
☐ SAVE file (Ctrl+S)
```

**Copy-Paste Function:**
```typescript
function OptimizeWithSpotlightButton({
  spotlight,
  workspaceId,
  ownAppId,
  isRtl,
}: {
  spotlight: KeywordSpotlightResult;
  workspaceId: string;
  ownAppId?: string | null;
  isRtl: boolean;
}) {
  return (
    <StageButton
      signalType="keyword"
      content={spotlight.trendingKeywords.slice(0, 5).join(", ")}
      source="keyword_spotlight"
      workspaceId={workspaceId}
      sourceAppId={ownAppId || ""}
      language={isRtl ? "ar" : "en"}
      metadata={{
        allTrendingKeywords: spotlight.trendingKeywords,
        asoTip: spotlight.asoTip,
        keywordCount: spotlight.trendingKeywords.length,
      }}
      variant="primary"
      size="lg"
      label={
        isRtl
          ? "إضافة إلى الخزنة"
          : "Stage Keywords to Vault"
      }
    />
  );
}
```

✅ **Verification:**
```bash
npm run build
# Check: No references to router.push in OptimizeWithSpotlight
# Check: Component accepts ownAppId prop
```

---

### File 3: components/competitor-spy/competitor-spy-snapshot-card.tsx
```
Time: ~15 minutes

☐ Open file: Ctrl+P → competitor-spy-snapshot-card.tsx
☐ Line 1: ADD import { StageButton } from "@/components/staging/StageButton"
☐ Lines 43-57: UPDATE props type:
    ☐ ADD after line 49: workspaceId: string;
    ☐ ADD after line 50: appId?: string;
    ☐ DELETE: onSendToOptimizer: () => void;
☐ Line 59+: UPDATE function destructuring:
    ☐ ADD: workspaceId,
    ☐ ADD: appId,
    ☐ DELETE: onSendToOptimizer,
☐ Lines 199-217: DELETE TooltipProvider section entirely
☐ After line 198: PASTE StageButton code
☐ FIND where CompetitorSpySnapshotCard is called (Ctrl+F)
☐ ADD workspaceId={workspaceId} prop
☐ ADD appId={appId} prop
☐ DELETE onSendToOptimizer={...} prop
☐ Top of file: DELETE unused imports:
    - Sparkles
    - TooltipProvider, Tooltip
☐ SAVE file (Ctrl+S)
```

**Copy-Paste Code Block:**
```typescript
<StageButton
  signalType="competitor_weakness"
  content={`${competitorDisplayName}: ${liveTitle || displayName}`}
  source="competitor_spy"
  workspaceId={workspaceId}
  sourceAppId={appId || ""}
  language={isRtl ? "ar" : "en"}
  metadata={{
    competitorName: competitorDisplayName,
    competitorPackageId: packageId,
    categoryLabel,
    bestRank,
    metricsKeywordCount,
  }}
  variant="primary"
  size="md"
  className="w-full sm:flex-1"
  label={t("sendOptimizer")}
/>
```

✅ **Verification:**
```bash
npm run build
# Check: Props type updated correctly
# Check: Function destructuring correct
# Check: Component call includes new props
```

---

## Phase 2: Local Testing (15 minutes)

### Start Dev Server
```bash
cd /Users/syedmairaj/Documents/playstore
npm run dev
# Wait for "compiled successfully"
```

### Test Reviews Page
```
☐ Go to: http://localhost:3000/reviews
☐ Look for issue cards
☐ Verify button says "Stage Issue" (not "Add to Optimization Backlog")
☐ Click button
☐ Toast appears: "Successfully Staged"
☐ Page does NOT navigate away
☐ Can click other buttons
☐ Open browser console: No errors
☐ Check Network tab: POST to /api/workspaces/.../staging/add succeeds (200)
```

### Test Competitor Spy Page
```
☐ Go to: http://localhost:3000/competitor-spy
☐ Scroll to competitor card
☐ Verify button says "Stage Weakness" (not "Stage Competitor Exploit")
☐ Click button
☐ Toast appears: "Successfully Staged"
☐ Page does NOT navigate away
☐ Check Network tab: POST succeeds (200)
☐ No errors in console
```

### Test Market Intelligence Page
```
☐ Go to: http://localhost:3000/market-intelligence
☐ Scroll to spotlight card (or generate one)
☐ Verify button says "Stage Keywords to Vault"
☐ Click button
☐ Toast appears: "Successfully Staged"
☐ Page does NOT navigate away
☐ Check Network tab: POST succeeds (200)
☐ No errors in console
```

### Test Optimizer Page
```
☐ Go to: http://localhost:3000/optimizer
☐ Look for "Staged Signals" section at top
☐ Verify section shows signals you just staged
☐ Count should match (keywords + issues + weaknesses)
☐ All signals display correctly
☐ Refresh page: Signals still there (auto-fetched from DB)
☐ No errors in console
```

### Test Database (Optional but Recommended)
```
☐ Open Supabase dashboard
☐ Go to workspace_staging_vault table
☐ Look for new records
☐ Verify:
    ☐ signal_type is correct (review_issue, competitor_weakness, keyword)
    ☐ content is correct
    ☐ language is set correctly
    ☐ is_rtl matches language (ar = true, en = false)
    ☐ metadata contains all fields
☐ Records are not deleted (deleted_at is NULL)
```

### Test Arabic (If Available)
```
☐ Change UI locale to Arabic
☐ Go to Reviews page
☐ Button text should be in Arabic
☐ Click button
☐ Toast should be in Arabic
☐ Content should display RTL
☐ No layout breaks
```

---

## Phase 3: Git Commit & Push (5 minutes)

### Prepare Commit
```bash
cd /Users/syedmairaj/Documents/playstore

# Check status
git status

# Should show 3 modified files:
# - components/reviews/IssueCard.tsx
# - components/market/MarketIntelligenceClient.tsx
# - components/competitor-spy/competitor-spy-snapshot-card.tsx

# Stage files
git add components/reviews/IssueCard.tsx
git add components/market/MarketIntelligenceClient.tsx
git add components/competitor-spy/competitor-spy-snapshot-card.tsx

# Verify staged
git status  # Should show all 3 as "Changes to be committed"
```

### Create Commit
```bash
git commit -m "refactor: replace navigation buttons with staging vault integration

- Replace 'Add to Optimization Backlog' with StageButton in Reviews
- Replace 'Send to AI Optimizer' with StageButton in Market Intelligence  
- Replace 'Stage Competitor Exploit' with StageButton in Competitor Spy
- Use persistent vault storage instead of URL params
- Add toast notifications for all staging actions
- Maintain RTL/LTR support for Arabic localization
- Users now stay on current page when staging signals
- Signals auto-fetch in Optimizer from workspace_staging_vault table

Fixes: Navigation-based data loss, fragile URL params, no persistence"
```

### Push to Repository
```bash
# If main branch
git push origin main

# OR if on feature branch
git push origin feature/staging-vault-frontend
```

### Verify Push
```bash
# Check GitHub/GitLab
# Verify:
☐ Commit appears in history
☐ Files show changes
☐ CI/CD pipeline starts (if configured)
```

---

## Phase 4: Deployment (Varies by Setup)

### If Using Vercel
```
☐ Vercel auto-deploys on push to main
☐ Wait for build to complete (3-5 minutes)
☐ Check deployment status at vercel.com
☐ Verify Preview/Production environment
☐ Test production URL
```

### If Using GitHub Actions / Cloud Run / Other
```
☐ Check your CI/CD dashboard
☐ Wait for build to pass
☐ Wait for deployment to complete
☐ Monitor logs for errors
☐ Test production URL after deployment
```

### Verify Deployment
```
☐ Production: Reviews page → New buttons showing
☐ Production: Competitor Spy → New buttons showing
☐ Production: Market Intel → New buttons showing
☐ Production: Optimizer → Vault section visible
☐ Click button in production
☐ Toast appears
☐ Page doesn't navigate
☐ Check database: New records created
```

---

## Phase 5: Post-Deployment Monitoring (Ongoing)

### Monitor for Errors
```
☐ Check error tracking (Sentry, LogRocket, etc)
☐ Look for "StageButton" or "staging" related errors
☐ Check API logs for /staging/add failures
☐ Check database for unusual patterns
```

### Monitor User Adoption
```
☐ Check analytics: Users clicking "Stage" buttons
☐ Check database: Records being created
☐ Check Optimizer usage: Vault signals being used
☐ Collect feedback from early users
```

### Monitor Performance
```
☐ Page load time: Should not increase
☐ Toast response time: Should be <200ms
☐ Vault fetch time: Should be <500ms
☐ No memory leaks
```

---

## Rollback Plan (If Issues)

### Immediate Rollback
```bash
# Revert the commit
git revert <commit-hash>

# Or go back to previous commit
git reset --hard HEAD~1

# Push to trigger redeploy
git push origin main
```

### If Vercel Deployment
```
☐ Go to Vercel dashboard
☐ Click "Deployments"
☐ Find previous stable deployment
☐ Click "Promote to Production"
```

### Debugging After Rollback
```
☐ Check what went wrong in logs
☐ Test locally: npm run dev
☐ Fix issue
☐ Commit fix
☐ Push again
☐ Verify in production
```

---

## Success Criteria (All Must Be ✅)

### Functionality
```
☐ Buttons render without errors
☐ Clicking buttons posts to API
☐ Toast notifications appear
☐ Data stores in database
☐ Optimizer fetches vault signals
☐ Page doesn't navigate on click
☐ RTL content displays correctly
☐ No console errors
```

### User Experience
```
☐ Button clicks are instant (<100ms response)
☐ Toast appears immediately after click
☐ Toast auto-dismisses after 3 seconds
☐ User can click multiple buttons in sequence
☐ Page stays in same scroll position
☐ Works on mobile screens
☐ Works with slow network (toast still appears)
```

### Data Integrity
```
☐ All signals stored in database
☐ No data lost on page refresh
☐ No data lost on logout/login
☐ Metadata preserved exactly
☐ UTF-8 content (Arabic) preserved
☐ Language/RTL flags set correctly
☐ Soft delete works (deleted_at set, not hard delete)
```

### Performance
```
☐ POST /staging/add completes <500ms
☐ GET /staging/list completes <500ms
☐ Toast UI renders smoothly
☐ No page lag after click
☐ Database queries efficient
☐ No memory leaks
```

---

## Celebration Checklist ✅

When everything passes:

```
☐ All 3 button types working
☐ All toasts displaying
☐ All data persisting
☐ Optimizer showing vault
☐ No errors in logs
☐ Users happy with no navigation
☐ Team notified of deployment
☐ Documentation updated
☐ Team knows to test next features with vault
```

---

## Summary Timeline

| Phase | Task | Time |
|-------|------|------|
| 0 | Verify backend ready | 5 min |
| 1 | Implement 3 files | 45 min |
| 2 | Test locally | 15 min |
| 3 | Commit & push | 5 min |
| 4 | Deploy to prod | 5-30 min (varies) |
| 5 | Monitor | Ongoing |
| **Total** | **Implementation to Live** | **~75-100 min** |

---

## Documents to Reference While Implementing

Keep these open:
1. **QUICK_REFERENCE_CARD.md** — Copy-paste code blocks
2. **IMPLEMENTATION_VISUAL_GUIDE.md** — Line-by-line changes
3. **FINDING_THE_FILES_GUIDE.md** — Editor navigation
4. **EXACT_BUTTON_REPLACEMENTS.md** — Detailed explanations
5. **DEPLOYMENT_TRANSFORMATION_GUIDE.md** — Before/after UI

---

**Status:** ✅ Ready to execute

You have everything needed. Follow the checklist in order, and your staging vault frontend will be live in ~75-100 minutes.

**Start with Phase 1, File 1 (IssueCard.tsx). It's the simplest and good practice for the other two.**

Good luck! 🚀
