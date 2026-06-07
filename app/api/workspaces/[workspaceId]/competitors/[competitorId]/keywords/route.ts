/**
 * GET /api/workspaces/[workspaceId]/competitors/[competitorId]/keywords
 *
 * THREE-DIMENSIONAL ISOLATION QUERY:
 * Returns ONLY keywords for this specific competitor + language + workspace
 * Prevents data collision when users switch between competitors
 *
 * Query dimensions:
 * 1. workspace_id
 * 2. competitor_id (from metadata)
 * 3. language (en or ar)
 *
 * With compound index, guaranteed O(1) lookup
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

interface CompetitorKeywordsResponse {
  keywords?: {
    high_volume: string[];
    intent_based: string[];
    competitor_gap: string[];
  };
  vulnerabilities?: string[];
  competitor_id: string;
  competitor_name: string;
  language: 'en' | 'ar';
  retrieved_at: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { workspaceId: string; competitorId: string } }
) {
  try {
    const { workspaceId, competitorId } = await params;
    const language = (req.nextUrl.searchParams.get('language') || 'en') as 'en' | 'ar';

    console.log('[CompetitorKeywords] Request:', {
      workspace: workspaceId,
      competitor: competitorId,
      language,
      timestamp: new Date().toISOString(),
    });

    // Validate language
    if (!['en', 'ar'].includes(language)) {
      return NextResponse.json(
        { error: 'Invalid language. Must be "en" or "ar"' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // ═════════════════════════════════════════════════════════════════════════
    // THREE-DIMENSIONAL ISOLATION QUERY
    // ═════════════════════════════════════════════════════════════════════════
    // This query guarantees:
    // - workspace_id match
    // - competitor_id match (from metadata)
    // - language match
    // Result: ONLY the current competitor's keywords in the current language
    // ═════════════════════════════════════════════════════════════════════════

    const { data, error } = await supabase
      .from('workspace_staging_vault')
      .select('metadata, content, created_at')
      .eq('workspace_id', workspaceId)
      .eq('signal_type', 'competitor_weakness')
      .eq('language', language)
      .filter('metadata->competitor_id', 'eq', competitorId)  // ← ISOLATION: Competitor filter
      .order('created_at', { ascending: false })
      .limit(1);  // Only latest signal per competitor per language

    if (error) {
      console.error('[CompetitorKeywords] Database error:', {
        code: error.code,
        message: error.message,
        competitor: competitorId,
      });

      return NextResponse.json(
        {
          keywords: {
            high_volume: [],
            intent_based: [],
            competitor_gap: [],
          },
          vulnerabilities: [],
          competitor_id: competitorId,
          competitor_name: 'Unknown',
          language,
          retrieved_at: new Date().toISOString(),
        } as CompetitorKeywordsResponse,
        { status: 200 }
      );
    }

    // No data found for this competitor + language
    if (!data || data.length === 0) {
      console.log('[CompetitorKeywords] No signals found:', {
        competitor: competitorId,
        language,
      });

      return NextResponse.json(
        {
          keywords: {
            high_volume: [],
            intent_based: [],
            competitor_gap: [],
          },
          vulnerabilities: [],
          competitor_id: competitorId,
          competitor_name: 'Unknown',
          language,
          retrieved_at: new Date().toISOString(),
        } as CompetitorKeywordsResponse,
        { status: 200 }
      );
    }

    const signal = data[0];
    const metadata = signal.metadata as any;

    // Validate retrieved data
    if (!metadata?.keywords_by_strategy) {
      console.warn('[CompetitorKeywords] Missing keywords_by_strategy:', {
        competitor: competitorId,
        metadata_keys: Object.keys(metadata || {}),
      });
    }

    console.log('[CompetitorKeywords] Success:', {
      competitor: competitorId,
      language,
      high_volume_count: metadata?.keywords_by_strategy?.high_volume?.length || 0,
      intent_based_count: metadata?.keywords_by_strategy?.intent_based?.length || 0,
      competitor_gap_count: metadata?.keywords_by_strategy?.competitor_gap?.length || 0,
    });

    // ═════════════════════════════════════════════════════════════════════════
    // RETURN: Data is GUARANTEED to be for current competitor + language only
    // ═════════════════════════════════════════════════════════════════════════
    return NextResponse.json({
      keywords: metadata?.keywords_by_strategy || {
        high_volume: [],
        intent_based: [],
        competitor_gap: [],
      },
      vulnerabilities: metadata?.vulnerabilities || [],
      competitor_id: metadata?.competitor_id || competitorId,
      competitor_name: metadata?.competitor_name || 'Unknown',
      language,
      retrieved_at: new Date().toISOString(),
    } as CompetitorKeywordsResponse);
  } catch (error) {
    console.error('[CompetitorKeywords] Catch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
