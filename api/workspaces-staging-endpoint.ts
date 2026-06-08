/**
 * API Endpoint: GET /api/workspaces/[workspaceId]/staging
 *
 * Purpose: Retrieve staged signals with competitor and language filtering
 *
 * This file shows the EXACT implementation needed on your backend
 * to make the competitor filtering work.
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

/**
 * IMPORTANT: This must be implemented in your backend at:
 * pages/api/workspaces/[workspaceId]/staging.ts
 */
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

  console.log('[Staging API] Request received:', {
    workspaceId,
    signalType,
    language,
    competitorPackageId,
  });

  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  if (!language) {
    return res.status(400).json({ error: 'language parameter is required' });
  }

  const validLanguages = ['en', 'ar'];
  if (!validLanguages.includes(language as string)) {
    return res.status(400).json({ error: `language must be 'en' or 'ar', got: ${language}` });
  }

  const limitNum = Math.min(parseInt(limit as string) || 100, 500);
  const offsetNum = parseInt(offset as string) || 0;

  // ═══════════════════════════════════════════════════════════════════
  // DATABASE QUERY
  // ═══════════════════════════════════════════════════════════════════

  try {
    const db = require('@/lib/db'); // Your database connection

    // Build WHERE conditions
    const whereConditions: string[] = [
      "workspace_id = $1",
      "signal_type = $2",
      "language = $3",
    ];

    const params: any[] = [workspaceId, signalType, language];

    // CRITICAL: Add competitor filter if provided
    if (competitorPackageId && competitorPackageId !== '') {
      console.log('[Staging API] Filtering by competitor:', competitorPackageId);
      whereConditions.push(`metadata->>'competitorPackageId' = $${params.length + 1}`);
      params.push(competitorPackageId);
    } else {
      console.log('[Staging API] No competitor filter - returning all competitors');
    }

    // Build the SQL query
    const whereClause = whereConditions.join(' AND ');
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

    console.log('[Staging API] Executing query with params:', {
      query: query.substring(0, 100) + '...',
      paramCount: params.length,
    });

    const result = await db.query(query, params);

    console.log('[Staging API] Query result:', {
      recordsFound: result.rows.length,
      competitor: competitorPackageId || 'all',
      language,
    });

    // Parse metadata if it's a string
    const signals: StagingRecord[] = result.rows.map((row: any) => ({
      id: row.id,
      signal_type: row.signal_type,
      source: row.source,
      language: row.language,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      content: row.content,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return res.status(200).json({
      signals,
      total: signals.length,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    console.error('[Staging API] Database error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// ALTERNATIVE: Using PostgreSQL directly
// ═══════════════════════════════════════════════════════════════════

/**
 * If you're using raw PostgreSQL, here's the exact query:
 */
export const STAGING_QUERY = `
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
  WHERE
    workspace_id = $1
    AND signal_type = $2
    AND language = $3
    AND (
      $4::text IS NULL
      OR metadata->>'competitorPackageId' = $4
    )
  ORDER BY created_at DESC
  LIMIT $5
  OFFSET $6
`;

/**
 * Usage example:
 *
 * const result = await db.query(STAGING_QUERY, [
 *   workspaceId,      // $1
 *   'exploit_data',   // $2
 *   'en',             // $3
 *   competitorPackageId || null,  // $4 (can be NULL)
 *   limit,            // $5
 *   offset,           // $6
 * ]);
 */

// ═══════════════════════════════════════════════════════════════════
// TESTING EXAMPLES
// ═══════════════════════════════════════════════════════════════════

/**
 * Test Case 1: Fetch all English exploit_data (no competitor filter)
 *
 * GET /api/workspaces/workspace-123/staging?signalType=exploit_data&language=en
 *
 * Expected: Returns all exploit_data records in English, all competitors mixed
 */

/**
 * Test Case 2: Fetch English exploit_data for specific competitor
 *
 * GET /api/workspaces/workspace-123/staging?
 *   signalType=exploit_data&
 *   language=en&
 *   competitorPackageId=com.strava
 *
 * Expected: Returns ONLY records where metadata->>'competitorPackageId' = 'com.strava'
 * and language = 'en'
 */

/**
 * Test Case 3: Fetch Arabic exploit_data for different competitor
 *
 * GET /api/workspaces/workspace-123/staging?
 *   signalType=exploit_data&
 *   language=ar&
 *   competitorPackageId=com.myfitnesspal
 *
 * Expected: Returns ONLY records for com.myfitnesspal in Arabic
 */

// ═══════════════════════════════════════════════════════════════════
// DEBUGGING CHECKLIST
// ═══════════════════════════════════════════════════════════════════

/**
 * If keywords still aren't filtering by competitor, check:
 *
 * 1. URL query parameters being sent:
 *    Open DevTools → Network tab → click the staging request
 *    Look at the URL - does it include competitorPackageId?
 *
 *    ✓ Should see: /staging?signalType=exploit_data&language=en&competitorPackageId=com.strava
 *    ✗ Should NOT see: /staging?signalType=exploit_data&language=en
 *
 * 2. Backend receiving the parameter:
 *    Add console.log at the top of the API handler:
 *    console.log('competitorPackageId:', req.query.competitorPackageId);
 *
 *    ✓ Should log: competitorPackageId: com.strava
 *    ✗ Should NOT log: competitorPackageId: undefined
 *
 * 3. Database records have the correct metadata:
 *    SELECT metadata->>'competitorPackageId' FROM workspace_staging_vault;
 *
 *    ✓ Should see: com.strava, com.myfitnesspal, etc.
 *    ✗ Should NOT see: NULL or empty
 *
 * 4. WHERE clause is correct:
 *    Add this before db.query():
 *    console.log('[Staging API] Final WHERE clause:', whereClause);
 *    console.log('[Staging API] Final params:', params);
 *
 *    ✓ Should see: metadata->>'competitorPackageId' = $4
 *    ✗ Should NOT see: WHERE workspace_id = $1 AND ...
 *                      (missing the competitor filter)
 */
