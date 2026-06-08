/**
 * COMPETITOR DATA ISOLATION TEST SUITE
 *
 * Purpose: Validate that the three-dimensional isolation prevents data collision
 * when users switch between competitors or languages.
 *
 * Isolation Dimensions:
 * 1. workspace_id
 * 2. competitor_id (from metadata)
 * 3. language (en/ar)
 *
 * Test Scenarios:
 * - Single competitor, multiple languages
 * - Multiple competitors, single language
 * - Multiple competitors, multiple languages
 * - Switching competitors doesn't show old data
 * - Language switching shows correct language keywords
 */

import { createClient } from '@/lib/supabase/server';

interface TestCompetitorSignal {
  workspace_id: string;
  competitor_id: string;
  competitor_name: string;
  language: 'en' | 'ar';
  keywords_by_strategy: {
    high_volume: string[];
    intent_based: string[];
    competitor_gap: string[];
  };
}

class CompetitorIsolationTestSuite {
  private supabase: any;
  private workspaceId = 'test-workspace-001';
  private competitors = [
    {
      id: 'com.fittrack.pro',
      name: 'FitTrack Pro',
      keywords_en: ['fitness tracker', 'gym tracker', 'workout planner'],
      keywords_ar: ['متتبع اللياقة', 'متتبع الرياضة', 'مخطط التمرين'],
    },
    {
      id: 'com.myfitnesspal.pro',
      name: 'MyFitnessPal Pro',
      keywords_en: ['calorie tracker', 'nutrition planner', 'diet tracker'],
      keywords_ar: ['متتبع السعرات', 'مخطط التغذية', 'متتبع النظام الغذائي'],
    },
    {
      id: 'com.strongapp.fitness',
      name: 'StrongApp',
      keywords_en: ['strength training', 'workout log', 'progressive overload'],
      keywords_ar: ['تمارين القوة', 'سجل التمرين', 'الحمل التدريجي'],
    },
  ];

  async setup() {
    this.supabase = await createClient();
    console.log('✓ TestSuite initialized');
  }

  async teardown() {
    // Clean up test data
    const { error } = await this.supabase
      .from('workspace_staging_vault')
      .delete()
      .eq('workspace_id', this.workspaceId);

    if (error) {
      console.error('Teardown error:', error);
    } else {
      console.log('✓ Test data cleaned up');
    }
  }

  async storeSignal(signal: TestCompetitorSignal) {
    const { data, error } = await this.supabase
      .from('workspace_staging_vault')
      .insert([
        {
          workspace_id: signal.workspace_id,
          signal_type: 'competitor_weakness',
          source: 'competitor_spy',
          source_context: 'competitor_weakness',
          language: signal.language,
          content: JSON.stringify(signal.keywords_by_strategy),
          metadata: {
            competitor_id: signal.competitor_id,
            competitor_name: signal.competitor_name,
            keywords_by_strategy: signal.keywords_by_strategy,
          },
        },
      ])
      .select();

    if (error) {
      throw new Error(`Failed to store signal: ${error.message}`);
    }

    return data[0];
  }

  async querySignals(competitorId: string, language: 'en' | 'ar') {
    const { data, error } = await this.supabase
      .from('workspace_staging_vault')
      .select('metadata, content, created_at')
      .eq('workspace_id', this.workspaceId)
      .eq('signal_type', 'competitor_weakness')
      .eq('language', language)
      .filter('metadata->competitor_id', 'eq', competitorId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Failed to query signals: ${error.message}`);
    }

    return data;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 1: Single Competitor, Multiple Languages
  // ═══════════════════════════════════════════════════════════════════════════
  async test_single_competitor_multiple_languages() {
    console.log('\n[TEST 1] Single Competitor, Multiple Languages');
    const competitor = this.competitors[0];

    // Store English signal
    await this.storeSignal({
      workspace_id: this.workspaceId,
      competitor_id: competitor.id,
      competitor_name: competitor.name,
      language: 'en',
      keywords_by_strategy: {
        high_volume: competitor.keywords_en.slice(0, 1),
        intent_based: competitor.keywords_en.slice(1, 2),
        competitor_gap: competitor.keywords_en.slice(2, 3),
      },
    });

    // Store Arabic signal
    await this.storeSignal({
      workspace_id: this.workspaceId,
      competitor_id: competitor.id,
      competitor_name: competitor.name,
      language: 'ar',
      keywords_by_strategy: {
        high_volume: competitor.keywords_ar.slice(0, 1),
        intent_based: competitor.keywords_ar.slice(1, 2),
        competitor_gap: competitor.keywords_ar.slice(2, 3),
      },
    });

    // Query English
    const enSignals = await this.querySignals(competitor.id, 'en');
    if (enSignals.length === 0) {
      throw new Error('English signal not found');
    }

    const enKeywords = Object.values(
      enSignals[0].metadata.keywords_by_strategy
    ).flat();
    if (!enKeywords.includes(competitor.keywords_en[0])) {
      throw new Error('English keywords not correct');
    }

    // Query Arabic
    const arSignals = await this.querySignals(competitor.id, 'ar');
    if (arSignals.length === 0) {
      throw new Error('Arabic signal not found');
    }

    const arKeywords = Object.values(
      arSignals[0].metadata.keywords_by_strategy
    ).flat();
    if (!arKeywords.includes(competitor.keywords_ar[0])) {
      throw new Error('Arabic keywords not correct');
    }

    console.log('  ✓ English signal isolated correctly');
    console.log('  ✓ Arabic signal isolated correctly');
    console.log('  ✓ No cross-language contamination');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 2: Multiple Competitors, Single Language
  // ═══════════════════════════════════════════════════════════════════════════
  async test_multiple_competitors_single_language() {
    console.log('\n[TEST 2] Multiple Competitors, Single Language');

    // Store signals for all competitors (English only)
    for (const competitor of this.competitors) {
      await this.storeSignal({
        workspace_id: this.workspaceId,
        competitor_id: competitor.id,
        competitor_name: competitor.name,
        language: 'en',
        keywords_by_strategy: {
          high_volume: competitor.keywords_en.slice(0, 1),
          intent_based: competitor.keywords_en.slice(1, 2),
          competitor_gap: competitor.keywords_en.slice(2, 3),
        },
      });
    }

    // Query each competitor individually
    for (const competitor of this.competitors) {
      const signals = await this.querySignals(competitor.id, 'en');

      if (signals.length !== 1) {
        throw new Error(`Expected 1 signal for ${competitor.id}, got ${signals.length}`);
      }

      const keywords = Object.values(
        signals[0].metadata.keywords_by_strategy
      ).flat();
      const expectedKeyword = competitor.keywords_en[0];

      if (!keywords.includes(expectedKeyword)) {
        throw new Error(
          `Competitor ${competitor.id} has wrong keywords: ${keywords}`
        );
      }

      // Verify no cross-contamination
      for (const otherCompetitor of this.competitors) {
        if (otherCompetitor.id === competitor.id) continue;

        const otherKeywords = Object.values(
          signals[0].metadata.keywords_by_strategy
        ).flat();

        for (const otherKeyword of otherCompetitor.keywords_en) {
          if (otherKeywords.includes(otherKeyword)) {
            throw new Error(
              `Data collision: ${competitor.id} contains ${otherCompetitor.id}'s keywords`
            );
          }
        }
      }
    }

    console.log('  ✓ Competitor A isolated correctly');
    console.log('  ✓ Competitor B isolated correctly');
    console.log('  ✓ Competitor C isolated correctly');
    console.log('  ✓ No cross-competitor contamination');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 3: Multiple Competitors, Multiple Languages
  // ═══════════════════════════════════════════════════════════════════════════
  async test_multiple_competitors_multiple_languages() {
    console.log('\n[TEST 3] Multiple Competitors, Multiple Languages');

    // Store signals for all competitors in both languages
    for (const competitor of this.competitors) {
      // English
      await this.storeSignal({
        workspace_id: this.workspaceId,
        competitor_id: competitor.id,
        competitor_name: competitor.name,
        language: 'en',
        keywords_by_strategy: {
          high_volume: competitor.keywords_en.slice(0, 1),
          intent_based: competitor.keywords_en.slice(1, 2),
          competitor_gap: competitor.keywords_en.slice(2, 3),
        },
      });

      // Arabic
      await this.storeSignal({
        workspace_id: this.workspaceId,
        competitor_id: competitor.id,
        competitor_name: competitor.name,
        language: 'ar',
        keywords_by_strategy: {
          high_volume: competitor.keywords_ar.slice(0, 1),
          intent_based: competitor.keywords_ar.slice(1, 2),
          competitor_gap: competitor.keywords_ar.slice(2, 3),
        },
      });
    }

    // Verify isolation for each combination
    for (const competitor of this.competitors) {
      // Query English
      const enSignals = await this.querySignals(competitor.id, 'en');
      const enKeywords = Object.values(
        enSignals[0].metadata.keywords_by_strategy
      ).flat();

      if (!enKeywords.includes(competitor.keywords_en[0])) {
        throw new Error(`${competitor.id} English keywords incorrect`);
      }

      // Verify no Arabic keywords in English result
      for (const arKeyword of competitor.keywords_ar) {
        if (enKeywords.includes(arKeyword)) {
          throw new Error(
            `${competitor.id} English result contains Arabic keywords`
          );
        }
      }

      // Query Arabic
      const arSignals = await this.querySignals(competitor.id, 'ar');
      const arKeywords = Object.values(
        arSignals[0].metadata.keywords_by_strategy
      ).flat();

      if (!arKeywords.includes(competitor.keywords_ar[0])) {
        throw new Error(`${competitor.id} Arabic keywords incorrect`);
      }

      // Verify no English keywords in Arabic result
      for (const enKeyword of competitor.keywords_en) {
        if (arKeywords.includes(enKeyword)) {
          throw new Error(
            `${competitor.id} Arabic result contains English keywords`
          );
        }
      }
    }

    console.log('  ✓ All competitors isolated in EN');
    console.log('  ✓ All competitors isolated in AR');
    console.log('  ✓ No language mixing');
    console.log('  ✓ No competitor cross-contamination');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 4: Switching Competitors Shows Fresh Data
  // ═══════════════════════════════════════════════════════════════════════════
  async test_switching_competitors_no_stale_data() {
    console.log('\n[TEST 4] Switching Competitors Shows Fresh Data');

    const competitorA = this.competitors[0];
    const competitorB = this.competitors[1];

    // Store signal for Competitor A
    await this.storeSignal({
      workspace_id: this.workspaceId,
      competitor_id: competitorA.id,
      competitor_name: competitorA.name,
      language: 'en',
      keywords_by_strategy: {
        high_volume: ['old-keyword-from-a'],
        intent_based: [],
        competitor_gap: [],
      },
    });

    // Query Competitor A
    let signals = await this.querySignals(competitorA.id, 'en');
    if (
      !Object.values(signals[0].metadata.keywords_by_strategy).flat().includes('old-keyword-from-a')
    ) {
      throw new Error('Competitor A signal not correct');
    }

    // Switch to Competitor B
    await this.storeSignal({
      workspace_id: this.workspaceId,
      competitor_id: competitorB.id,
      competitor_name: competitorB.name,
      language: 'en',
      keywords_by_strategy: {
        high_volume: ['new-keyword-from-b'],
        intent_based: [],
        competitor_gap: [],
      },
    });

    // Query Competitor B
    signals = await this.querySignals(competitorB.id, 'en');
    const bKeywords = Object.values(signals[0].metadata.keywords_by_strategy).flat();

    if (!bKeywords.includes('new-keyword-from-b')) {
      throw new Error('Competitor B signal not correct');
    }

    if (bKeywords.includes('old-keyword-from-a')) {
      throw new Error('Stale data from Competitor A still present');
    }

    // Query Competitor A again - should still be there
    signals = await this.querySignals(competitorA.id, 'en');
    const aKeywords = Object.values(signals[0].metadata.keywords_by_strategy).flat();

    if (!aKeywords.includes('old-keyword-from-a')) {
      throw new Error('Competitor A signal lost after switch');
    }

    if (aKeywords.includes('new-keyword-from-b')) {
      throw new Error('New data from Competitor B leaked into Competitor A');
    }

    console.log('  ✓ Competitor A data remains isolated');
    console.log('  ✓ Competitor B data is clean (no stale A data)');
    console.log('  ✓ Switching competitors prevents data collision');
  }

  async runAll() {
    try {
      await this.setup();

      await this.test_single_competitor_multiple_languages();
      await this.teardown();

      await this.test_multiple_competitors_single_language();
      await this.teardown();

      await this.test_multiple_competitors_multiple_languages();
      await this.teardown();

      await this.test_switching_competitors_no_stale_data();
      await this.teardown();

      console.log('\n✅ ALL TESTS PASSED');
      return true;
    } catch (error) {
      console.error('\n❌ TEST FAILED:', error);
      await this.teardown();
      return false;
    }
  }
}

// Export for use in test runners
export default CompetitorIsolationTestSuite;

// Run if executed directly
if (require.main === module) {
  const suite = new CompetitorIsolationTestSuite();
  suite.runAll().then(success => process.exit(success ? 0 : 1));
}
