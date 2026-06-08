/**
 * COMPETITOR SPY INTEGRATION EXAMPLE
 *
 * Shows EXACTLY how to capture competitor analysis results and stage them
 * with proper validation and error handling (EN/AR bilingual)
 *
 * This is the pattern to use in CompetitorSpyClient.tsx when analysis completes
 */

import { stageCompetitorAnalysis } from '@/lib/competitor-spy/capture-and-stage-keywords';
import type { LanguageCode } from '@/types/staging-contract';

/**
 * Call this function when competitor analysis is complete
 * Replace/adapt this example in your actual CompetitorSpyClient.tsx
 */
async function handleCompetitorAnalysisComplete(input: {
  competitorId: string;
  competitorName: string;
  categoryLabel: string;
  keywords: string[];
  vulnerabilities: string[];
  workspaceId: string;
  language: LanguageCode;  // 'en' | 'ar'
}): Promise<void> {
  console.log('[CompetitorSpy] Analysis complete, staging keywords...');

  // Call the capture-and-stage service
  // It will:
  // 1. Validate all fields are present and correct types
  // 2. Log exact JSON structure before database insert
  // 3. Post to API with comprehensive error handling
  // 4. Return success/error
  const result = await stageCompetitorAnalysis(
    {
      competitorId: input.competitorId,      // REQUIRED: 'com.fittrack.pro'
      competitorName: input.competitorName,  // REQUIRED: 'FitTrack Pro'
      categoryLabel: input.categoryLabel,    // REQUIRED: 'Health & Fitness'
      keywords: input.keywords,              // REQUIRED: ['fitness', 'tracker', ...]
      vulnerabilities: input.vulnerabilities,// OPTIONAL: []
      workspaceId: input.workspaceId,        // REQUIRED: 'ws-123'
      language: input.language,              // REQUIRED: 'en' | 'ar'
      isRtl: input.language === 'ar',        // REQUIRED: boolean
    },
    input.workspaceId  // Workspace ID for API endpoint
  );

  if (!result.success) {
    console.error('[CompetitorSpy] Failed to stage:', result.error);
    alert(`Failed to stage keywords: ${result.error}`);
    return;
  }

  console.log(`[CompetitorSpy] Success! Signal ID: ${result.signalId}`);
  alert(`Keywords staged successfully!`);
}

/**
 * EXAMPLE: Real-world integration in CompetitorSpyClient
 *
 * Inside the analysis completion handler, you would call:
 *
 * await handleCompetitorAnalysisComplete({
 *   competitorId: 'com.fittrack.pro',
 *   competitorName: 'FitTrack Pro',
 *   categoryLabel: 'Health & Fitness',
 *   keywords: ['fitness tracker', 'calorie counter', 'workout planner'],
 *   vulnerabilities: ['missing offline', 'slow sync'],
 *   workspaceId: 'ws-123',
 *   language: userLanguage === 'ar' ? 'ar' : 'en',
 * });
 */

/**
 * ════════════════════════════════════════════════════════════════════════════
 * WHAT THE CAPTURE SERVICE DOES (step by step)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * STEP 1: VALIDATE INPUT
 * ✓ Checks competitorId is non-empty string
 * ✓ Checks competitorName is non-empty string
 * ✓ Checks categoryLabel is non-empty string
 * ✓ Checks keywords is non-empty array of strings
 * ✓ Checks vulnerabilities is array (can be empty)
 * ✓ Checks workspaceId is non-empty string
 * ✓ Checks language is 'en' or 'ar'
 * ✓ Checks isRtl is boolean
 *
 * STEP 2: LOG EXACT JSON STRUCTURE
 * Shows in console:
 * - competitorId: "com.fittrack.pro"
 * - competitorName: "FitTrack Pro"
 * - categoryLabel: "Health & Fitness"
 * - keywords.length: 12
 * - Sample keywords: ["fitness tracker", "calorie counter", "workout planner"]
 * - metadata object (EXACT structure being sent to DB):
 *   {
 *     competitor_id: "com.fittrack.pro",
 *     competitor_name: "FitTrack Pro",
 *     category_label: "Health & Fitness",
 *     language: "en",
 *     keywords_by_strategy: {
 *       high_volume: [...],
 *       intent_based: [...],
 *       competitor_gap: [...]
 *     },
 *     vulnerabilities: [],
 *     is_rtl: false
 *   }
 *
 * STEP 3: VERIFY JSON SERIALIZABILITY
 * ✓ JSON.stringify(metadata) succeeds
 * ✓ Metadata size logged (e.g., "1234 bytes")
 *
 * STEP 4: POST TO STAGING API
 * POST /api/workspaces/{workspaceId}/staging/add
 * Headers: { "Content-Type": "application/json" }
 * Body: {
 *   signalType: "competitor_weakness",
 *   content: "...",
 *   source: "competitor_spy",
 *   sourceContext: "competitor_weakness",
 *   sourceContextId: "com.fittrack.pro",
 *   language: "en",
 *   metadata: { ... }  // ← The object with competitor_id
 * }
 *
 * STEP 5: DATABASE INSERT
 * workspace_staging_vault INSERT with:
 * - workspace_id: "ws-123"
 * - signal_type: "competitor_weakness"
 * - source: "competitor_spy"
 * - source_context: "competitor_weakness"
 * - source_context_id: "com.fittrack.pro"
 * - content: "..."
 * - language: "en"
 * - metadata: { competitor_id: "com.fittrack.pro", ... }  ← JSONB column
 *
 * STEP 6: RETURN RESULT
 * { success: true, signalId: "uuid-here" }
 * OR
 * { success: false, error: "descriptive error message" }
 */

/**
 * ════════════════════════════════════════════════════════════════════════════
 * BILINGUAL EXAMPLE (EN vs AR)
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * ENGLISH (user.language === 'en')
 */
async function exampleEnglish() {
  await handleCompetitorAnalysisComplete({
    competitorId: 'com.fittrack.pro',
    competitorName: 'FitTrack Pro',
    categoryLabel: 'Health & Fitness',
    keywords: [
      'fitness tracker',
      'calorie counter',
      'workout planner',
      'weight loss',
      'step counter',
      'meal tracker',
      'food scanner app',
      'diet goals app',
      'nutrition tracking',
      'health monitoring',
      'exercise routine',
      'activity tracker',
    ],
    vulnerabilities: [
      'Missing offline mode',
      'Slow sync between devices',
      'Poor privacy controls',
    ],
    workspaceId: 'ws-123',
    language: 'en',
  });

  // Server logs will show:
  // ✓ competitorId: "com.fittrack.pro"
  // ✓ keywords.length: 12
  // ✓ language: "en"
  // ✓ isRtl: false
  // Database will store: metadata->competitor_id = "com.fittrack.pro"
}

/**
 * ARABIC (user.language === 'ar')
 */
async function exampleArabic() {
  await handleCompetitorAnalysisComplete({
    competitorId: 'com.fittrack.pro',
    competitorName: 'FitTrack Pro',
    categoryLabel: 'Health & Fitness',
    keywords: [
      'متتبع اللياقة',
      'عداد السعرات الحرارية',
      'مخطط التمارين',
      'فقدان الوزن',
      'عداد الخطوات',
      'متتبع الوجبات',
      'تطبيق ماسح الطعام',
      'تطبيق أهداف النظام الغذائي',
      'تتبع التغذية',
      'مراقبة الصحة',
      'روتين التمارين',
      'متتبع النشاط',
    ],
    vulnerabilities: [
      'لا يوجد وضع بدون إنترنت',
      'مزامنة بطيئة بين الأجهزة',
      'عناصر تحكم الخصوصية ضعيفة',
    ],
    workspaceId: 'ws-123',
    language: 'ar',
  });

  // Server logs will show:
  // ✓ competitorId: "com.fittrack.pro"
  // ✓ keywords.length: 12
  // ✓ language: "ar"
  // ✓ isRtl: true
  // Database will store: metadata->competitor_id = "com.fittrack.pro"
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * WHERE TO PUT THIS IN CompetitorSpyClient.tsx
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Find the location where competitor analysis results are ready, then call:
 *
 * await stageCompetitorAnalysis({
 *   competitorId: selectedCompetitor.packageId,
 *   competitorName: selectedCompetitor.displayName,
 *   categoryLabel: 'Inferred from app category',  // TODO: pass from parent
 *   keywords: analysisResult.keywords,
 *   vulnerabilities: analysisResult.vulnerabilities || [],
 *   workspaceId: workspaceId,
 *   language: locale === 'ar' ? 'ar' : 'en',
 *   isRtl: locale === 'ar',
 * }, workspaceId);
 */

export { handleCompetitorAnalysisComplete };
