/**
 * GET /api/workspaces/[workspaceId]/staging/get
 *
 * Retrieves staged signals with competitor-specific filtering
 *
 * Query params:
 * - signalType: 'exploit_data' (required)
 * - language: 'en' | 'ar' (required)
 * - competitorPackageId: string (optional - filters to specific competitor)
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const { workspaceId } = await params;
    const searchParams = req.nextUrl.searchParams;

    const signalType = searchParams.get('signalType') || 'competitor_weakness';
    const language = searchParams.get('language');
    const competitorPackageId = searchParams.get('competitorPackageId');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    console.log('[Staging GET] Request:', {
      workspaceId,
      signalType,
      language,
      competitorPackageId: competitorPackageId || '(all)',
    });

    if (!language) {
      return NextResponse.json({ error: 'language is required' }, { status: 400 });
    }

    if (!['en', 'ar'].includes(language)) {
      return NextResponse.json(
        { error: `language must be 'en' or 'ar', got: ${language}` },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Build query
    let query = supabase
      .from('workspace_staging_vault')
      .select(
        `id, signal_type, source, language, metadata, content, created_at`
      )
      .eq('workspace_id', workspaceId)
      .eq('signal_type', signalType)
      .eq('language', language)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // CRITICAL: Filter by competitor if provided
    if (competitorPackageId && competitorPackageId !== '') {
      console.log('[Staging GET] Applying competitor filter:', competitorPackageId);
      // Filter JSONB metadata field using filter() method
      query = query.filter('metadata->competitorPackageId', 'eq', competitorPackageId);
    } else {
      console.log('[Staging GET] No competitor filter - returning ALL competitors');
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Staging GET] Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[Staging GET] Query returned:', data?.length || 0, 'records');

    if (!data || data.length === 0) {
      console.warn('[Staging GET] ⚠️ Zero records found. Checking:');
      console.warn('  1. Does database have exploit_data records?');
      console.warn('  2. Is language correct?');
      if (competitorPackageId) {
        console.warn(
          `  3. Does any record have metadata.competitorPackageId = '${competitorPackageId}'?`
        );
      }
    }

    // Parse metadata
    const signals = (data || []).map((record: any) => ({
      id: record.id,
      signal_type: record.signal_type,
      source: record.source,
      language: record.language,
      metadata:
        typeof record.metadata === 'string' ? JSON.parse(record.metadata) : record.metadata,
      content: record.content,
      created_at: record.created_at,
    }));

    // Log first record for debugging
    if (signals.length > 0) {
      const firstRecord = signals[0];
      console.log('[Staging GET] First record:', {
        id: firstRecord.id,
        competitor: firstRecord.metadata?.competitorPackageId,
        keywordCount: firstRecord.metadata?.keywordCount,
        language: firstRecord.language,
      });
    }

    return NextResponse.json({
      signals,
      total: signals.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[Staging GET] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
