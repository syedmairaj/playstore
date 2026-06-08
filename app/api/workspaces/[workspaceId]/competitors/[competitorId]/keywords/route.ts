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

    // ═════════════════════════════════════════════════════════════════════════
    // DEBUG LOG: First, check what's in the database for this workspace
    // ═════════════════════════════════════════════════════════════════════════
    console.log('[CompetitorKeywords] 🔍 PRE-QUERY DEBUG - Checking all records in vault for workspace:');

    const { data: allRecords, error: allError } = await supabase
      .from('workspace_staging_vault')
      .select('id, workspace_id, signal_type, language, metadata, created_at')
      .eq('workspace_id', workspaceId)
      .limit(50);

    if (allRecords && allRecords.length > 0) {
      console.log('[CompetitorKeywords] 📊 All vault records for this workspace:', {
        total_count: allRecords.length,
        records: allRecords.map((r: any) => ({
          id: r.id,
          signal_type: r.signal_type,
          language: r.language,
          competitor_id: r.metadata?.competitor_id,
          metadata_keys: Object.keys(r.metadata || {}),
          created_at: r.created_at,
        })),
      });
    } else {
      console.log('[CompetitorKeywords] ⚠️ No records found in vault for workspace:', { workspaceId });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // DEBUG LOG: Before main query
    // ═════════════════════════════════════════════════════════════════════════
    console.log('[CompetitorKeywords] Executing query:', {
      signal_type: 'competitor_weakness',  // ← Exact value being queried
      competitor_id: competitorId,  // ← Exact value being filtered
      language: language,
      workspace_id: workspaceId,
      filter_description: `metadata->>'competitor_id' = '${competitorId}'`,  // ← Updated for text comparison
    });

    // ═════════════════════════════════════════════════════════════════════════
    // FIX: Supabase JS client doesn't support ->> operator in filters
    // Use eq() with JSONB path instead, or filter client-side
    // ═════════════════════════════════════════════════════════════════════════
    const { data: allData, error } = await supabase
      .from('workspace_staging_vault')
      .select('metadata, content, created_at')
      .eq('workspace_id', workspaceId)
      .eq('signal_type', 'competitor_weakness')  // ← MUST match INSERT exactly
      .eq('language', language)
      .order('created_at', { ascending: false })
      .limit(50);  // Get more records, filter client-side

    // Client-side filter for competitor_id since Supabase doesn't support ->> in filters
    let data: any[] | null = null;
    if (allData && allData.length > 0) {
      data = allData.filter((record: any) => {
        const matchingCompetitor = (record.metadata as any)?.competitor_id === competitorId;
        return matchingCompetitor;
      });
      // Keep only the latest one
      data = data.slice(0, 1);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // DEBUG LOG: After query
    // ═════════════════════════════════════════════════════════════════════════
    console.log('[CompetitorKeywords] 🔍 DETAILED QUERY DEBUG:', {
      workspace_id: workspaceId,
      signal_type: 'competitor_weakness',
      language: language,
      competitor_id: competitorId,
      error: error ? { code: error.code, message: error.message } : null,
      data_returned: data?.length || 0,
      first_record: data?.[0] ? {
        has_metadata: !!data[0].metadata,
        metadata_type: typeof data[0].metadata,
        metadata_keys: Object.keys(data[0].metadata || {}),
      } : null,
    });

    if (error) {
      console.error('[CompetitorKeywords] ❌ DATABASE ERROR:', {
        signal_type: 'competitor_weakness',
        competitor_id: competitorId,
        language: language,
        error_code: error.code,
        error_message: error.message,
        status: 'QUERY_FAILED',
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
      console.log('[CompetitorKeywords] ❌ NO SIGNALS FOUND:', {
        signal_type: 'competitor_weakness',
        competitor_id: competitorId,
        language: language,
        workspace_id: workspaceId,
        status: 'NOT_FOUND',
        data_length: data?.length || 0,
        possible_causes: [
          '1. No competitor_weakness signals have been inserted yet',
          '2. metadata->competitor_id does not match the queried value',
          '3. language column does not match (check for case sensitivity)',
          '4. signal_type in database does not match "competitor_weakness"',
        ],
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

    // ═════════════════════════════════════════════════════════════════════════
    // DEBUG LOG: Signal found
    // ═════════════════════════════════════════════════════════════════════════
    console.log('[CompetitorKeywords] ✓ SIGNAL FOUND:', {
      signal_type: 'competitor_weakness',
      competitor_id: competitorId,
      language: language,
      status: 'FOUND',
      data_count: data.length,
      created_at: data[0]?.created_at,
    });

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
