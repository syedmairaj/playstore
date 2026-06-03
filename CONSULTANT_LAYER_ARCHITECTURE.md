# Consultant Layer (Pillar 4) — Complete Architecture Guide

## Executive Overview

The Consultant Layer transforms **static insights into executable strategy**. It's an agentic loop that:

1. **Ingests** ASO Report Card (3 scores, 3 tips)
2. **Generates** 30-day Growth Roadmap (4 weekly sprints, strategic theme)
3. **Benchmarks** against top 3 competitors (competitive pressure)
4. **Queues** tasks into `workspace_listing_improvements` (automated execution)
5. **Tracks** progress and calculates Consultant Score (engagement driver)

---

## Core Architecture

```
ASO Report Card
    ↓
Strategy Generator
    ├── Prompt (Senior Consultant Tone)
    ├── Gemini-Pro (with retry middleware)
    └── Competitive Benchmarking
    ↓
Growth Roadmap
    ├── 4 Weekly Sprints
    ├── 3-5 Tactics per Sprint
    ├── Specific, Measurable Actions
    └── Competitive Gap Analysis
    ↓
Task Queueing Service
    ├── Auto-create `ConsultantQueuedTask` items
    ├── Link to `workspace_listing_improvements`
    ├── Assign due dates (Week 1-4)
    └── Set priority + suggested content
    ↓
Strategic Dashboard
    ├── Growth Score (Consultant Score)
    ├── Pending Tasks (by week/category)
    ├── Competitive Position (vs. top 3)
    └── Next Milestone & Actions
    ↓
Execution Loop
    ├── User accepts/skips tasks
    ├── Implements changes
    ├── Tracks completion
    └── Measures impact (next ASO report)
```

---

## 1. Type System (Complete)

**File:** `lib/consultant/consultant-types.ts`

Key interfaces:
- `GrowthRoadmap` — Complete 30-day strategy plan
- `WeeklySprint` — 4 sequential week-long sprints
- `TacticItem` — Individual actions (metadata, keywords, assets, etc.)
- `ConsultantScoreBreakdown` — App's positioning analysis
- `ConsultantQueuedTask` — Task to queue into backlog
- `StrategicDashboard` — UI data aggregation
- Database schemas for `growth_roadmaps` and `consultant_queued_tasks`

---

## 2. Strategy Generator (Complete)

**File:** `lib/consultant/strategy-generator.ts`

**Core Functions:**

### `buildStrategyPrompt()`
- Market-aware (English vs Arabic)
- References ASO Report scores
- Includes competitive benchmarking
- Senior consultant tone (directive, action-oriented)
- Structured JSON output

**Prompt Characteristics:**
```
"As a senior ASO strategist with 15+ years of experience..."
"The data clearly shows..."
"We recommend..."
"Your gap is ${gap} points; immediate action required"
```

### `generateGrowthRoadmap()`
```typescript
const roadmap = await generateGrowthRoadmap(
  client,
  "My App",
  "productivity",
  asoReport,
  competitiveBenchmark,
  "en"
);

// Returns:
// {
//   id: "roadmap-123",
//   consultantScore: 72,
//   growthTier: "scaling",
//   strategicTheme: "Keyword Domination in Finance Category",
//   sprints: [ Week1, Week2, Week3, Week4 ],
//   competitiveAnalysis: { gaps, opportunities, threats },
//   executiveSummary: "..."
// }
```

### `calculateConsultantScore()`
```
Composite of:
- Readability (30%): Clear listing
- Keyword Density (35%): Discovery optimization
- Conversion Potential (35%): Persuasion power

Result: 1-100 score
```

### `analyzeConsultantScore()`
- Breakdown by component
- Identify strengths/weaknesses
- Determine tier (emerging/growing/scaling/dominance)
- Competitive position analysis

---

## 3. Task Queueing Service (To Implement)

**File:** `lib/consultant/task-queuing-service.ts` (outline)

```typescript
/**
 * Auto-queue tasks from Growth Roadmap into workspace_listing_improvements
 */
export async function queueStrategyTasks(
  workspaceId: string,
  roadmap: GrowthRoadmap,
  listingOptimizer: any // Reference to existing listing optimizer
): Promise<ConsultantQueuedTask[]> {
  const queuedTasks: ConsultantQueuedTask[] = [];

  for (const sprint of roadmap.sprints) {
    for (const tactic of sprint.tacticItems) {
      // 1. Create task
      const task: ConsultantQueuedTask = {
        id: uuidv4(),
        workspaceId,
        appId: roadmap.appId,
        strategicRoadmapId: roadmap.id,
        weekNumber: sprint.week as 1 | 2 | 3 | 4,
        tacticItemId: tactic.id,

        title: tactic.title,
        description: tactic.description,
        priority: sprint.priority === 1 ? "high" : "medium",
        dueDate: calculateDueDate(sprint.week),

        // For metadata tasks: provide suggestions
        targetField: inferTargetField(tactic.category),
        suggestedContent: generateSuggestion(tactic, roadmap.appId),
        suggestedChips: tactic.category === "keywords" ? extractKeywords(tactic.action) : undefined,

        status: "suggested",
        createdAt: new Date().toISOString(),
      };

      // 2. Queue to workspace_listing_improvements
      await queueToListingImprover(workspaceId, task);

      queuedTasks.push(task);
    }
  }

  return queuedTasks;
}

/**
 * Link strategies to existing listing optimizer
 * When strategy recommends "Add keyword X", queue it as a specific suggestion
 */
function generateSuggestion(tactic: TacticItem, appId: string): string {
  switch (tactic.category) {
    case "keywords":
      // Parse tactic.action: "Add 5 long-tail keywords related to productivity"
      // Suggest: ["task automation", "workflow optimization", ...]
      return tactic.action;

    case "metadata":
      // If readability issues: suggest title restructuring
      return tactic.implementationGuide || tactic.action;

    case "assets":
      // If conversion weak: suggest screenshot captions or icon style
      return tactic.action;

    case "conversion":
      // If CTA weak: suggest specific CTA text
      return tactic.action;

    default:
      return tactic.action;
  }
}

/**
 * Map tactic category to listing field
 */
function inferTargetField(category: string): string {
  switch (category) {
    case "keywords":
      return "keywords";
    case "metadata":
      return "title"; // Often title improvements first
    case "assets":
      return "screenshotCaptions";
    case "conversion":
      return "shortDescription";
    default:
      return "fullDescription";
  }
}

/**
 * Calculate due date from sprint week
 * Week 1: 3 days from now
 * Week 2: 10 days from now
 * Week 3: 17 days from now
 * Week 4: 24 days from now
 */
function calculateDueDate(week: 1 | 2 | 3 | 4): string {
  const days = (week - 1) * 7 + 3;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}
```

---

## 4. Competitive Benchmarking Integration

**File:** `lib/consultant/competitive-benchmark.ts` (outline)

```typescript
/**
 * Compare user's Consultant Score against top 3 apps in category
 * Uses existing Market Intelligence data
 */
export async function benchmarkAgainstCompetitors(
  client: Supabase,
  workspaceId: string,
  appId: string,
  category: string,
  locale: string
): Promise<CompetitiveBenchmark> {
  // 1. Get top 3 apps in category from market_intelligence
  const topApps = await client
    .from("market_intelligence_top_charts")
    .select("app_id, app_name, ranking")
    .eq("category", category)
    .eq("locale", locale)
    .order("ranking")
    .limit(3);

  // 2. Calculate Consultant Score for each competitor
  // (by fetching their latest ASO report if available, or estimating from store data)
  const competitor1Score = await calculateCompetitorScore(
    client,
    topApps[0].app_id,
    category
  );
  const competitor2Score = await calculateCompetitorScore(
    client,
    topApps[1].app_id,
    category
  );
  const competitor3Score = await calculateCompetitorScore(
    client,
    topApps[2].app_id,
    category
  );

  // 3. Get user's current Consultant Score
  const userReport = await loadLatestAsoReport(workspaceId, appId, locale);
  const userScore = calculateConsultantScore(userReport);

  // 4. Return competitive benchmark
  return {
    userId: workspaceId,
    appId,
    categoryId: category,
    locale,
    userScore,
    competitor1Score,
    competitor2Score,
    competitor3Score,
    userRank: calculateUserRank(userScore, [competitor1Score, competitor2Score, competitor3Score]),
    categoryAverage: calculateCategoryAverage(category, locale),
    createdAt: new Date().toISOString(),
    comparisonBasedOnDate: new Date().toISOString(),
  };
}

/**
 * Competitive gap narrative
 * Used in roadmap execution plan
 */
export function generateGapNarrative(
  userScore: number,
  competitorScore: number,
  competitorName: string
): string {
  const gap = competitorScore - userScore;

  if (gap <= 0) {
    return `You lead ${competitorName} by ${Math.abs(gap)} points. Maintain dominance.`;
  } else if (gap <= 5) {
    return `You're within striking distance of ${competitorName}. Focused effort can close this gap in 2-3 weeks.`;
  } else if (gap <= 15) {
    return `${competitorName} leads by ${gap} points. Significant optimization needed, but achievable.`;
  } else {
    return `${competitorName} significantly outpaces you (${gap} point gap). This is your primary target for the 30-day roadmap.`;
  }
}
```

---

## 5. Strategic Dashboard (UI Component)

**File:** `components/consultant/StrategicDashboard.tsx` (outline)

```typescript
export function StrategicDashboard({ appId, workspaceId }: Props) {
  const dashboard = useQuery(() => fetchStrategicDashboard(appId, workspaceId));

  return (
    <div className="strategic-dashboard">
      {/* Growth Score Card */}
      <GrowthScoreCard
        consultantScore={dashboard.currentConsultantScore}
        tier={dashboard.currentGrowthTier}
        trend={calculateTrend(dashboard)}
      />

      {/* Active Roadmap */}
      {dashboard.activeRoadmap && (
        <RoadmapProgressCard
          theme={dashboard.activeRoadmap.strategicTheme}
          weekInProgress={dashboard.activeRoadmap.weekInProgress}
          progress={dashboard.activeRoadmap.weekProgress}
          nextMilestone={dashboard.activeRoadmap.nextMilestone}
        />
      )}

      {/* Pending Tasks */}
      <PendingTasksCard
        total={dashboard.pendingStrategyTasks.total}
        byWeek={dashboard.pendingStrategyTasks.byWeek}
        byCategory={dashboard.pendingStrategyTasks.byCategory}
      />

      {/* Competitive Position */}
      <CompetitivePositionCard
        userScore={dashboard.competitivePosition.userScore}
        competitors={[
          dashboard.competitivePosition.competitor1,
          dashboard.competitivePosition.competitor2,
          dashboard.competitivePosition.competitor3,
        ]}
        marketOpportunity={dashboard.competitivePosition.marketOpportunity}
      />

      {/* Top Actions */}
      <TopActionsCard actions={dashboard.topActions} />
    </div>
  );
}
```

**Component Breakdown:**

### GrowthScoreCard
```
┌─────────────────────────────────┐
│ Growth Score                    │
│ ████████░░ 72/100               │
│ Tier: Scaling                   │
│ Trend: ↑ +5 points (1 week)     │
└─────────────────────────────────┘
```

### RoadmapProgressCard
```
┌─────────────────────────────────┐
│ 30-Day Strategy: Keyword        │
│ Dominance in Finance            │
│                                 │
│ Week 1: Metadata Refinement     │
│ ████████░░ 60% Complete         │
│ Week 2: Keyword Expansion       │
│ ░░░░░░░░░░ Pending              │
└─────────────────────────────────┘
```

### PendingTasksCard
```
┌─────────────────────────────────┐
│ Pending Strategy Items          │
│ Total: 12 tasks                 │
│                                 │
│ Week 1: 5 (metadata, keywords)  │
│ Week 2: 4 (keywords, assets)    │
│ Week 3: 2 (conversion)          │
│ Week 4: 1 (scaling)             │
└─────────────────────────────────┘
```

### CompetitivePositionCard
```
┌─────────────────────────────────┐
│ Competitive Position            │
│                                 │
│ You:        ████████░░ 72       │
│ Competitor1:██████░░░░ 85       │
│ Competitor2:█████░░░░░░ 78      │
│ Competitor3:████░░░░░░░ 65      │
│                                 │
│ Gap to Leader: -13 points       │
│ Action: Close keyword gap       │
└─────────────────────────────────┘
```

### TopActionsCard
```
┌─────────────────────────────────┐
│ Next Actions (Prioritized)      │
│                                 │
│ 1. Add 8 long-tail keywords     │
│    Impact: +8 keywords score    │
│    Effort: Quick (15 min)       │
│                                 │
│ 2. Simplify title               │
│    Impact: +5 readability       │
│    Effort: Quick (10 min)       │
│                                 │
│ 3. Screenshot narrative review  │
│    Impact: +6 conversion        │
│    Effort: Medium (30 min)      │
└─────────────────────────────────┘
```

---

## 6. Database Schema

### `growth_roadmaps` Table
```sql
CREATE TABLE growth_roadmaps (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  app_id UUID NOT NULL,
  app_name VARCHAR(200),
  locale VARCHAR(10),

  consultant_score INTEGER (1-100),
  growth_tier VARCHAR(20), -- emerging, growing, scaling, dominance

  roadmap_data JSONB, -- Complete Growth Roadmap
  competitive_analysis JSONB,

  generated_from_report_id UUID,
  created_at TIMESTAMP,
  created_by_user_id UUID,

  tasks_queued_count INTEGER DEFAULT 0,
  tasks_completed_count INTEGER DEFAULT 0,
  estimated_implementation_hours INTEGER
);
```

### `consultant_queued_tasks` Table
```sql
CREATE TABLE consultant_queued_tasks (
  id UUID PRIMARY KEY,
  workspace_id UUID,
  app_id UUID,
  strategic_roadmap_id UUID,
  week_number INTEGER (1-4),
  tactic_item_id VARCHAR(100),

  title VARCHAR(500),
  description TEXT,
  priority VARCHAR(20), -- high, medium, low
  due_date DATE,

  suggested_field VARCHAR(100), -- title, shortDescription, keywords, etc.
  suggested_content TEXT,
  suggested_chips TEXT[], -- For keywords

  status VARCHAR(50), -- suggested, accepted, in_progress, completed

  created_at TIMESTAMP,
  accepted_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

---

## 7. Integration with Listing Optimizer

**Key Integration Point:** When a strategy task is queued, it appears in `workspace_listing_improvements` with suggested content.

```typescript
// In workspace_listing_improvements dashboard:
// Task: "Add 8 long-tail keywords to description"
// Suggestion: ["task automation", "workflow management", "GTD app", ...]
// User clicks "Accept" → Adds to title/description
// User clicks "Skip" → Marks as skipped

// On completion:
// Next ASO Report captures the change
// Compare to previous report
// Measure impact (readability +X, keywords +Y)
```

---

## 8. Implementation Roadmap

### Phase 1: Core (Days 1-2)
- ✅ Type definitions (`consultant-types.ts`)
- ✅ Strategy generator (`strategy-generator.ts`)
- [ ] Competitive benchmarking (`competitive-benchmark.ts`)
- [ ] Task queuing (`task-queuing-service.ts`)

### Phase 2: Database (Day 2)
- [ ] Migrations for `growth_roadmaps` and `consultant_queued_tasks`
- [ ] RLS policies
- [ ] Indexes for fast queries

### Phase 3: API Routes (Days 2-3)
- [ ] `POST /api/consultant/roadmap/generate` — Create roadmap from ASO report
- [ ] `GET /api/consultant/dashboard` — Fetch strategic dashboard data
- [ ] `POST /api/consultant/tasks/queue` — Queue tasks into listing improvements
- [ ] `GET /api/consultant/benchmark` — Get competitive analysis

### Phase 4: Frontend (Days 3-4)
- [ ] Strategic Dashboard component
- [ ] Roadmap preview modal
- [ ] Task acceptance UI (in listing improvements panel)
- [ ] Progress tracking

### Phase 5: QA & Testing (Day 5)
- [ ] End-to-end: Report → Roadmap → Tasks → Execution
- [ ] Competitive benchmarking accuracy
- [ ] Task queueing correctness
- [ ] LTR/RTL UI rendering
- [ ] Mobile responsiveness

---

## 9. Success Criteria

✅ **Consultant Layer is successful when:**

1. **Strategy Generation**
   - Roadmap generated in <30 seconds
   - Consultant Score 1-100 (no errors)
   - 4 sprints, 3-5 tactics per sprint
   - Senior tone consistently applied

2. **Task Queuing**
   - All tactics auto-queued to `workspace_listing_improvements`
   - Suggested content provided (keywords, text, etc.)
   - Due dates calculated correctly (Week 1-4)
   - Links preserved back to roadmap

3. **Competitive Benchmarking**
   - Top 3 competitors correctly identified
   - Score gap calculated accurately
   - Narrative clearly articulates opportunity/threat

4. **User Engagement**
   - >60% of users accept strategy tasks within 48h
   - >50% complete tasks within due date
   - +25% engagement vs. without consultant layer

5. **Business Impact**
   - Premium conversion lift: +15% (users see competitive pressure)
   - Retention improvement: +20% (strategic roadmap keeps users engaged)
   - Revenue per user: +$X (premium upsell)

---

## 10. Premium Gating

**Consultant Layer is a Premium Feature:**

```
Free Plan: ✘ No growth roadmaps, no competitive benchmarking
Pro Plan: ✓ 1 roadmap per app per month, basic benchmarking
Enterprise: ✓ Unlimited roadmaps, detailed competitive analysis, custom sprints
```

**Upsell Trigger:** When Consultant Score < 75, show:
```
"You're in the bottom quartile of ${category}.
Unlock your Growth Roadmap to close the gap faster.
Start Pro for just $X/month."
```

---

## Next Steps

1. **Implement remaining services** (days 1-2)
2. **Apply database migrations** (day 2)
3. **Build API routes** (days 2-3)
4. **Build UI components** (days 3-4)
5. **QA & testing** (day 5)
6. **Deploy to staging** (day 6)
7. **Monitor engagement & conversion lift** (week 2+)

---

**Pillar 4: Ready for Implementation** ✅
