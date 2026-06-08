/**
 * API Endpoint: GET /api/workspaces/[workspaceId]/staging
 *
 * Retrieves staged signals (exploit_data) with competitor and language filtering
 *
 * CRITICAL: This must match the frontend requests from AIListingOptimizerExploit.tsx
 */

import { NextApiRequest, NextApiResponse } from 'next';

interface StagingRecord {
  id: string;
  signal_type: string;
  source: string;
  language: string;
  metadata: Record<string, any>;
  content: string;
  created_at: string;
  updated_at: string;
}

interface StagingResponse {
  signals: StagingRecord[];
  total: number;
  limit: number;
  offset: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StagingResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { workspaceId } = req.query;
  const {
    signalType = 'exploit_data',
    language,
    competitorPackageId,
    limit = '100',
    offset = '0',
  } = req.query;

  // ═══════════════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════════════

  console.log('[Staging API GET] Request received:', {
    workspaceId,
    signalType,
    language,
    competitorPackageId: competitorPackageId || '(all)',
  });

  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  if (!language || language === '') {
    return res.status(400).json({ error: 'language parameter is required' });
  }

  const validLanguages = ['en', 'ar'];
  if (!validLanguages.includes(language as string)) {
    return res.status(400).json({
      error: `language must be 'en' or 'ar', got: ${language}`,
    });
  }

  const limitNum = Math.min(parseInt(limit as string) || 100, 500);
  const offsetNum = parseInt(offset as string) || 0;

  // ═══════════════════════════════════════════════════════════════════
  // BUILD QUERY
  // ═══════════════════════════════════════════════════════════════════

  try {
    // Import your database connection - ADJUST THIS TO YOUR SETUP
    // const db = require('@/lib/db');
    // OR
    // import { db } from '@/lib/db';
    // For now, showing the SQL you should execute

    const whereConditions: string[] = [
      'workspace_id = $1',
      "signal_type = 'exploit_data'",
      'language = $2',
    ];

    const params: any[] = [workspaceId, language];

    // CRITICAL: Filter by competitor if provided
    if (competitorPackageId && competitorPackageId !== '') {
      console.log('[Staging API GET] Applying competitor filter:', competitorPackageId);
      whereConditions.push(`metadata->>'competitorPackageId' = $${params.length + 1}`);
      params.push(competitorPackageId);
    } else {
      console.log('[Staging API GET] No competitor filter - returning ALL competitors');
    }

    const whereClause = whereConditions.join(' AND ');

    // Build the final SQL query
    const query = `
      SELECT
        id,
        signal_type,
        source,
        language,
        metadata,
        content,
        created_at,
        updated_at
      FROM workspace_staging_vault
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;

    params.push(limitNum);
    params.push(offsetNum);

    console.log('[Staging API GET] Executing query with:', {
      whereClause,
      paramCount: params.length,
      limit: limitNum,
      offset: offsetNum,
    });

    // ═══════════════════════════════════════════════════════════════════
    // EXECUTE QUERY - UNCOMMENT YOUR DATABASE IMPORT ABOVE
    // ═══════════════════════════════════════════════════════════════════

    // const result = await db.query(query, params);
    //
    // if (!result.rows) {
    //   return res.status(500).json({ error: 'Database query failed' });
    // }

    // FOR NOW - MOCK RESPONSE (REMOVE IN PRODUCTION)
    console.log('[Staging API GET] MOCK MODE - Enable database connection above');
    const mockResult = {
      rows: [],
    };
    const result = mockResult;

    // ═══════════════════════════════════════════════════════════════════
    // PROCESS RESULTS
    // ═══════════════════════════════════════════════════════════════════

    console.log('[Staging API GET] Query returned:', result.rows.length, 'records');

    if (result.rows.length === 0) {
      console.warn('[Staging API GET] ⚠️ Zero records found');
      console.warn('  Checking:');
      console.warn('  1. Does database have exploit_data records?');
      console.warn('  2. Is language correct?');
      if (competitorPackageId) {
        console.warn(`  3. Does any record have metadata.competitorPackageId = '${competitorPackageId}'?`);
      }
    }

    // Parse metadata and build response
    const signals: StagingRecord[] = result.rows.map((row: any) => {
      const metadata =
        typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;

      return {
        id: row.id,
        signal_type: row.signal_type,
        source: row.source,
        language: row.language,
        metadata: metadata,
        content: row.content,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    // Log competitor info from first record
    if (signals.length > 0) {
      const firstRecord = signals[0];
      console.log('[Staging API GET] First record:', {
        id: firstRecord.id,
        competitor: firstRecord.metadata?.competitorPackageId,
        keywordCount: firstRecord.metadata?.keywordCount,
        language: firstRecord.language,
      });
    }

    return res.status(200).json({
      signals,
      total: signals.length,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    console.error('[Staging API GET] Database error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// REFERENCE: SQL QUERY FOR POSTGRESQL
// ═══════════════════════════════════════════════════════════════════

/**
 * Use this exact SQL in your database query:
 *
 * SELECT
 *   id,
 *   signal_type,
 *   source,
 *   language,
 *   metadata,
 *   content,
 *   created_at,
 *   updated_at
 * FROM workspace_staging_vault
 * WHERE
 *   workspace_id = $1
 *   AND signal_type = 'exploit_data'
 *   AND language = $2
 *   AND (
 *     $3::text IS NULL
 *     OR metadata->>'competitorPackageId' = $3
 *   )
 * ORDER BY created_at DESC
 * LIMIT $4
 * OFFSET $5
 *
 * Parameters:
 * $1 = workspaceId
 * $2 = language ('en' or 'ar')
 * $3 = competitorPackageId (can be NULL)
 * $4 = limit
 * $5 = offset
 */
