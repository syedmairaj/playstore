/**
 * Consultant Layer Types & Interfaces
 *
 * Transforms ASO Report Card insights into executable 30-day growth strategy.
 * Includes competitive benchmarking, task queueing, and professional recommendations.
 *
 * Core Loop:
 * ASO Report Card → Strategy Generator → Growth Roadmap → Task Queueing → Execution
 */

/**
 * Weekly Sprint (Part of Growth Roadmap)
 */
export interface WeeklySprint {
  week: 1 | 2 | 3 | 4;
  title: string; // e.g., "Metadata Refinement Sprint"
  objective: string; // What we're solving this week
  rationale: string; // Why this week, why this order
  tacticItems: TacticItem[]; // 3-5 specific actions
  expectedImpact: {
    readabilityIncrease?: number; // Expected score change
    keywordDensityIncrease?: number;
    conversionIncrease?: number;
  };
  effort: "light" | "medium" | "heavy";
  priority: number; // 1 = first, 4 = last
}

/**
 * Single tactic (action) within a sprint
 */
export interface TacticItem {
  id: string;
  title: string; // e.g., "Add 3 long-tail keywords"
  description: string; // Why this matters
  action: string; // What to do
  implementationGuide?: string; // Step-by-step instructions
  metrics: {
    currentValue?: string | number; // Current state (e.g., "8 keywords")
    targetValue: string | number; // Goal (e.g., "15 keywords")
    measurementMethod: string; // How to track it
  };
  estimatedDurationMinutes: number;
  category: "metadata" | "keywords" | "assets" | "conversion" | "structure";
  linkedToReportInsight?: string; // Reference to ASO report tip
}

/**
 * Complete Growth Roadmap (30-day strategic plan)
 */
export interface GrowthRoadmap {
  id: string;
  appId: string;
  workspaceId: string;
  locale: string;
  generatedFromReportId: string; // Reference to ASO Report Card

  // Strategic Framework
  consultantScore: number; // 1-100, composite of readability + keywords + conversion + category position
  growthTier: "emerging" | "growing" | "scaling" | "dominance"; // Position in category
  strategicTheme: string; // e.g., "Competitive Keyword Capture" or "Conversion Optimization"

  // 30-Day Plan
  sprints: WeeklySprint[]; // Always 4 sprints
  totalEstimatedDurationHours: number;

  // Competitive Context
  competitiveAnalysis: {
    userConsultantScore: number; // User's current score
    topCompetitor1: {
      appName: string;
      consultantScore: number;
      gaps: string[]; // Where user is behind
    };
    topCompetitor2: {
      appName: string;
      consultantScore: number;
      gaps: string[];
    };
    topCompetitor3: {
      appName: string;
      consultantScore: number;
      gaps: string[];
    };
    marketOpportunity: string; // Narrative: where you can win
    marketThreat: string; // Narrative: where you're vulnerable
  };

  // Tone & Voice
  executiveSummary: string; // 2-3 sentences from senior consultant
  confidenceLevel: "high" | "medium" | "low"; // Based on data completeness

  // Metadata
  createdAt: string;
  createdBy: "user" | "automated";
  version: "1.0";
  locale: string; // For LTR/RTL rendering
}

/**
 * Consultant Score Breakdown
 * Composite metric: how well positioned is the app vs. category leaders
 */
export interface ConsultantScoreBreakdown {
  score: number; // 1-100
  tier: "emerging" | "growing" | "scaling" | "dominance";

  // Component scores
  readabilityAlignment: number; // How clear is the listing vs. top apps
  keywordOptimization: number; // How well are keywords targeted
  conversionPotential: number; // How compelling is the offer
  competitivePosition: number; // How do you rank vs. top 3

  // Narrative
  strength: string; // What you do well
  weakness: string; // Where you're weak
  opportunity: string; // Biggest win available
  threat: string; // Biggest risk if you don't act

  recommendations: string[]; // Top 3 actions
}

/**
 * Task to queue into workspace_listing_improvements backlog
 * Created by Consultant Layer from Growth Roadmap
 */
export interface ConsultantQueuedTask {
  id: string;
  workspaceId: string;
  appId: string;

  // Link back to strategy
  strategicRoadmapId: string;
  weekNumber: 1 | 2 | 3 | 4;
  tacticItemId: string;

  // Task Details
  title: string; // What to do
  description: string; // Why it matters
  suggestedContent?: string; // For keyword/metadata tasks: specific suggestions
  priority: "high" | "medium" | "low"; // Based on roadmap priority + impact
  dueDate: string; // ISO date (calculated from week number)

  // Field mappings
  targetField?: "title" | "shortDescription" | "fullDescription" | "keywords" | "screenshotCaptions";
  suggestedReplacement?: string; // For specific metadata changes
  suggestedChips?: string[]; // For keyword tasks

  // Tracking
  status: "suggested" | "accepted" | "in_progress" | "completed" | "skipped";
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;

  // Outcome
  implementation?: {
    whatWasChanged: string;
    actualValueAfter?: string;
  };
}

/**
 * Competitive Benchmark (for market intelligence comparison)
 * Links Consultant Score to Market Intelligence top charts
 */
export interface CompetitiveBenchmark {
  userId: string;
  appId: string;
  categoryId: string;
  locale: string;

  userScore: number; // Consultant Score
  competitor1Score: number;
  competitor2Score: number;
  competitor3Score: number;

  userRank: number; // Position in top 100 by Consultant Score
  categoryAverage: number; // Average score for category

  createdAt: string;
  comparisonBasedOnDate: string; // When market data was captured
}

/**
 * Strategic Dashboard Data
 * Aggregated view for UI: growth score + pending actions
 */
export interface StrategicDashboard {
  appId: string;
  appName: string;
  locale: string;

  // Current State
  currentConsultantScore: number;
  currentGrowthTier: "emerging" | "growing" | "scaling" | "dominance";
  lastReportDate: string;
  lastRoadmapDate: string;

  // Active Roadmap
  activeRoadmap?: {
    id: string;
    strategicTheme: string;
    weekInProgress: 1 | 2 | 3 | 4;
    weekProgress: number; // 0-100%
    nextMilestone: string;
  };

  // Pending Tasks (from workspace_listing_improvements)
  pendingStrategyTasks: {
    total: number;
    byWeek: {
      week1: number;
      week2: number;
      week3: number;
      week4: number;
    };
    byCategory: {
      metadata: number;
      keywords: number;
      assets: number;
      conversion: number;
      structure: number;
    };
  };

  // Competitive Context
  competitivePosition: {
    userScore: number;
    competitor1: {
      appName: string;
      score: number;
    };
    competitor2: {
      appName: string;
      score: number;
    };
    competitor3: {
      appName: string;
      score: number;
    };
    marketOpportunity: string;
  };

  // Recommendations (from last roadmap)
  topActions: {
    action: string;
    impact: string;
    effort: string;
  }[];
}

/**
 * Database Schema: growth_roadmaps
 * Stores generated 30-day strategy plans
 */
export interface GrowthRoadmapDatabase {
  id: string;
  workspace_id: string;
  app_id: string;
  app_name: string;
  locale: string;

  // Scores
  consultant_score: number;
  growth_tier: string; // enum

  // Strategic Plan (JSON)
  roadmap_data: GrowthRoadmap;

  // Competitive Data (JSON)
  competitive_analysis: any; // Embedded analysis

  // Metadata
  generated_from_report_id: string;
  created_at: string;
  created_by_user_id: string;

  // Tracking
  tasks_queued_count: number;
  tasks_completed_count: number;
  estimated_implementation_hours: number;
}

/**
 * Database Schema: consultant_queued_tasks
 * Extends workspace_listing_improvements with strategy metadata
 */
export interface ConsultantTaskDatabase {
  id: string;
  workspace_listing_improvement_id?: string; // FK to existing table
  workspace_id: string;
  app_id: string;

  strategic_roadmap_id: string;
  week_number: number; // 1-4
  tactic_item_id: string;

  title: string;
  description: string;
  priority: string; // high, medium, low
  due_date: string;

  suggested_field?: string; // title, shortDescription, etc.
  suggested_content?: string; // Specific keyword or text
  suggested_chips?: string[]; // For keywords

  status: string; // suggested, accepted, in_progress, completed

  created_at: string;
  accepted_at?: string;
  completed_at?: string;
}
