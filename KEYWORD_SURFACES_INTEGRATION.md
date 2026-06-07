# Keyword Surfaces Integration Guide

## What Changed

The `CompetitorSpySnapshotCard` now accepts real keyword data via a new prop.

---

## New Prop Added

```typescript
export type CompetitorSpySnapshotCardProps = {
  // ... existing props
  keywordSurfaces?: string[];  // ← NEW: List of actual keywords
};
```

---

## How to Pass Keywords

The keywords come from your competitor spy data. You need to pass them from the parent component.

### Example 1: If keywords come from snapshot data

```typescript
// In CompetitorSpyClient.tsx or wherever you instantiate CompetitorSpySnapshotCard

<CompetitorSpySnapshotCard
  isRtl={isRtl}
  workspaceAppName={workspaceAppDisplayName}
  competitorDisplayName={activeCompetitor.displayName}
  displayName={activeCompetitor.displayName}
  categoryLabel={categoryLabel}
  packageId={activeCompetitor.packageId}
  bestRank={bestRankForActive}
  metricsKeywordCount={metricsKeywordCount}
  liveTitle={liveTitleForActive}
  rankLabels={rankLabels}
  workspaceId={workspaceId}
  onManageCompetitors={() => setManageOpen(true)}
  manageCompetitorsLabel={t("manage.button")}
  
  // ← NEW: Pass actual keywords here
  keywordSurfaces={activeCompetitor.keywordSurfaces || []}
  // OR if they're in a different object:
  // keywordSurfaces={snapshot.trendingKeywords || []}
/>
```

### Example 2: If keywords need to be fetched

```typescript
// Component state
const [keywords, setKeywords] = useState<string[]>([]);

// Fetch keywords
useEffect(() => {
  if (activeCompetitor) {
    fetchCompetitorKeywords(activeCompetitor.packageId).then(keywords => {
      setKeywords(keywords);
    });
  }
}, [activeCompetitor]);

// Pass to component
<CompetitorSpySnapshotCard
  {...otherProps}
  keywordSurfaces={keywords}
/>
```

---

## What Happens Now

### If keywords are provided:
```
User sees: [12 keywords] ← clickable badge
    ↓
Click to see:
  - High-Volume Keywords (4 items)
  - Intent-Based Keywords (4 items)
  - Competitor Gap Opportunities (4 items)
    ↓
Click any keyword to copy
```

### If keywords are NOT provided:
```
User sees: "12 keywords" ← static text (fallback)
No popover appears
```

---

## Current Status

- ✅ Component updated to accept `keywordSurfaces` prop
- ✅ Fallback UI implemented (shows static text if no keywords)
- ✅ Lightweight tooltip component (no Radix dependency issues)
- ✅ Full EN/AR localization
- ⏳ **You need to:** Pass actual keywords from parent component

---

## Next Steps

1. **Find where keywords come from** in your data flow
   - Look in `CompetitorSpyClient.tsx`
   - Check what data the snapshot/competitor object contains
   - Find the API response that includes keywords

2. **Update the parent component** to pass `keywordSurfaces`
   ```typescript
   <CompetitorSpySnapshotCard
     {...existing props}
     keywordSurfaces={actualKeywordArray}
   />
   ```

3. **Test the popover**
   - Click the badge to see it populate
   - Keywords should be grouped by strategy
   - Click to copy should work

---

## Quick Checklist

- [ ] Find keyword data source in `CompetitorSpyClient.tsx`
- [ ] Add `keywordSurfaces` prop to CompetitorSpySnapshotCard call
- [ ] Test in browser (click "12 keywords" badge)
- [ ] Verify keywords display correctly
- [ ] Test copy-to-clipboard functionality
- [ ] Test in Arabic language

---

## If You Can't Find Keywords

If the keyword data doesn't exist in your current API response:

1. **Option A:** Add keywords to the API response
   - Update competitor spy endpoint to return keyword list
   - This gives real data for the popover

2. **Option B:** Leave keywords empty
   - Falls back to static "12 keywords" text
   - Popover won't appear
   - Feature disabled but no errors

3. **Option C:** Mock keywords for demo
   ```typescript
   <CompetitorSpySnapshotCard
     {...otherProps}
     keywordSurfaces={[
       "fitness tracker",
       "calorie counter",
       "workout app",
       "weight loss",
       "step counter",
       "meal tracker",
       "food logging",
       "nutrition guide",
       "health monitoring",
       "exercise routine",
       "diet planner",
       "activity tracker"
     ]}
   />
   ```

---

## Troubleshooting

### Popover doesn't appear
- Check: Is `keywordSurfaces` array provided and non-empty?
- Check: Are keywords being passed from parent component?

### Wrong keywords showing
- Check: Are the keywords coming from the correct data source?
- Check: Is the competitor object being refreshed when competitor selection changes?

### Radix UI error gone?
- ✅ Yes - we're using the lightweight tooltip component instead
- No Radix dependency = no import errors

---

**Update the parent component to pass real keywords and the feature will work.**
