/**
 * DATABASE VERIFICATION UTILITY
 * Handles PostgREST PGRST116 errors by correctly parsing array responses
 *
 * Error: PGRST116 - Cannot coerce result to single JSON object
 * Root Cause: Query returning array instead of single object
 * Solution: Always handle responses as arrays, extract first element if needed
 */

import type { CacheResponse } from '@/lib/cache/schemas';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TYPE DEFINITIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface VerificationResult<T = unknown> {
  success: boolean;
  found: boolean;
  data?: T;
  recordCount: number;
  error?: {
    code: string;
    message: string;
    hint?: string;
  };
  timestamp: number;
  source: 'database' | 'cache' | 'verification-failure';
}

export interface ListingImprovement {
  id: string;
  listing_id: string;
  workspace_id: string;
  user_id: string;
  improvements: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  unutilized?: boolean | number;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CORE VERIFICATION FUNCTION (PGRST116 FIX)
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Verify data exists in database by querying endpoint
 * Correctly handles PostgREST array responses
 *
 * @param endpoint API endpoint to query
 * @param workspaceId Workspace ID for query filter
 * @param filters Additional filter parameters
 * @param options Request options (auth, etc)
 * @returns VerificationResult with data or error details
 */
export async function verifyDataInDatabase<T = ListingImprovement>(
  endpoint: string,
  workspaceId: string,
  filters: Record<string, string | number | boolean> = {},
  options: RequestInit = {}
): Promise<VerificationResult<T>> {
  const startTime = Date.now();

  try {
    console.log('[DatabaseVerification] 🔍 VERIFICATION START', {
      endpoint,
      workspaceId,
      filters,
      timestamp: new Date().toISOString(),
    });

    // Build query string with all filters
    const queryParams = new URLSearchParams();

    // Add workspace filter (always)
    queryParams.append('workspace_id', `eq.${workspaceId}`);

    // Add custom filters
    Object.entries(filters).forEach(([key, value]) => {
      // Handle different filter types
      if (value === null || value === undefined) return;

      if (typeof value === 'boolean') {
        queryParams.append(key, value ? 'eq.true' : 'eq.false');
      } else if (typeof value === 'number') {
        queryParams.append(key, `eq.${value}`);
      } else {
        queryParams.append(key, `eq.${String(value)}`);
      }
    });

    // ✅ CRITICAL: Add limit to get first result (prevents unexpected large arrays)
    queryParams.append('limit', '1');

    // ✅ CRITICAL: Order by creation date (get most recent)
    queryParams.append('order', 'created_at.desc');

    const url = `${endpoint}?${queryParams.toString()}`;

    console.log('[DatabaseVerification] 📡 SENDING QUERY', {
      url,
      method: 'GET',
    });

    // Execute query with proper headers
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    console.log('[DatabaseVerification] 📨 RESPONSE RECEIVED', {
      status: response.status,
      statusText: response.statusText,
      headers: {
        contentType: response.headers.get('content-type'),
      },
    });

    // Check for HTTP errors
    if (!response.ok) {
      console.error('[DatabaseVerification] ❌ HTTP ERROR', {
        status: response.status,
        statusText: response.statusText,
      });

      return {
        success: false,
        found: false,
        recordCount: 0,
        error: {
          code: 'HTTP_ERROR',
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
        timestamp: Date.now(),
        source: 'verification-failure',
      };
    }

    // ✅ PGRST116 FIX: Always parse response as array
    let jsonData: unknown;

    try {
      jsonData = await response.json();
    } catch (parseError) {
      console.error('[DatabaseVerification] ❌ JSON PARSE ERROR', {
        error: parseError instanceof Error ? parseError.message : parseError,
      });

      return {
        success: false,
        found: false,
        recordCount: 0,
        error: {
          code: 'JSON_PARSE_ERROR',
          message: 'Failed to parse response as JSON',
        },
        timestamp: Date.now(),
        source: 'verification-failure',
      };
    }

    // ✅ PGRST116 FIX: Handle both array and single object responses
    let dataArray: T[] = [];

    if (Array.isArray(jsonData)) {
      dataArray = jsonData as T[];
    } else if (jsonData && typeof jsonData === 'object') {
      // Single object response (shouldn't happen with our query, but handle it)
      dataArray = [jsonData as T];
    } else {
      console.error('[DatabaseVerification] ❌ UNEXPECTED RESPONSE FORMAT', {
        received: typeof jsonData,
        value: jsonData,
      });

      return {
        success: false,
        found: false,
        recordCount: 0,
        error: {
          code: 'UNEXPECTED_FORMAT',
          message: 'Response was neither array nor object',
        },
        timestamp: Date.now(),
        source: 'verification-failure',
      };
    }

    const duration = Date.now() - startTime;
    const found = dataArray.length > 0;
    const firstRecord = dataArray[0];

    if (found) {
      console.log('[DatabaseVerification] ✅ VERIFICATION SUCCESS', {
        found: true,
        recordCount: dataArray.length,
        firstRecord: JSON.stringify(firstRecord).substring(0, 100),
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        found: true,
        data: firstRecord,
        recordCount: dataArray.length,
        timestamp: Date.now(),
        source: 'database',
      };
    } else {
      console.warn('[DatabaseVerification] ⚠️ NO DATA FOUND', {
        endpoint,
        filters,
        recordCount: 0,
        duration: `${duration}ms`,
      });

      return {
        success: true,
        found: false,
        recordCount: 0,
        error: {
          code: 'NO_DATA_FOUND',
          message: 'Query executed successfully but no records found',
          hint: 'Data may not have been inserted or filters do not match',
        },
        timestamp: Date.now(),
        source: 'database',
      };
    }
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('[DatabaseVerification] ❌ VERIFICATION EXCEPTION', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    });

    return {
      success: false,
      found: false,
      recordCount: 0,
      error: {
        code: 'EXCEPTION',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
      source: 'verification-failure',
    };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SPECIALIZED VERIFICATION FUNCTIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Verify listing improvement was saved
 */
export async function verifyListingImprovementSaved(
  apiBaseUrl: string,
  workspaceId: string,
  listingId: string,
  authToken?: string
): Promise<VerificationResult<ListingImprovement>> {
  console.log('[ListingImprovementVerification] 🔍 Verifying listing improvement saved', {
    listingId,
    workspaceId,
  });

  const result = await verifyDataInDatabase<ListingImprovement>(
    `${apiBaseUrl}/listing-improvements`,
    workspaceId,
    {
      listing_id: listingId,
    },
    {
      headers: authToken
        ? { Authorization: `Bearer ${authToken}` }
        : undefined,
    }
  );

  return result;
}

/**
 * Verify keyword data was cached correctly
 */
export async function verifyKeywordsCached(
  cacheResult: CacheResponse<unknown>,
  expectedItemCount?: number
): Promise<VerificationResult> {
  console.log('[KeywordCacheVerification] 🔍 Verifying cache integrity', {
    source: cacheResult.source,
    isStale: cacheResult.isStale,
    age: cacheResult.age,
  });

  // Check if data exists
  if (!cacheResult.data) {
    return {
      success: false,
      found: false,
      recordCount: 0,
      error: {
        code: 'NO_DATA',
        message: 'Cache response has no data',
      },
      timestamp: Date.now(),
      source: 'cache',
    };
  }

  // Check if it's an array
  if (!Array.isArray(cacheResult.data)) {
    return {
      success: false,
      found: false,
      recordCount: 0,
      error: {
        code: 'INVALID_FORMAT',
        message: 'Expected array, got ' + typeof cacheResult.data,
      },
      timestamp: Date.now(),
      source: 'cache',
    };
  }

  const itemCount = (cacheResult.data as unknown[]).length;

  // Check item count if specified
  if (expectedItemCount && itemCount !== expectedItemCount) {
    console.warn('[KeywordCacheVerification] ⚠️ Item count mismatch', {
      expected: expectedItemCount,
      actual: itemCount,
    });
  }

  console.log('[KeywordCacheVerification] ✅ Cache verification success', {
    itemCount,
    source: cacheResult.source,
    isStale: cacheResult.isStale,
  });

  return {
    success: true,
    found: true,
    recordCount: itemCount,
    timestamp: Date.now(),
    source: 'cache',
  };
}

/**
 * Verify cache response structure
 */
export function verifyCacheResponseStructure(data: unknown): VerificationResult {
  try {
    if (!data || typeof data !== 'object') {
      return {
        success: false,
        found: false,
        recordCount: 0,
        error: {
          code: 'INVALID_OBJECT',
          message: 'Response is not an object',
        },
        timestamp: Date.now(),
        source: 'verification-failure',
      };
    }

    const response = data as Record<string, unknown>;

    // Check required fields
    const requiredFields = ['data', 'source', 'isStale', 'age'];
    const missingFields = requiredFields.filter((field) => !(field in response));

    if (missingFields.length > 0) {
      return {
        success: false,
        found: false,
        recordCount: 0,
        error: {
          code: 'MISSING_FIELDS',
          message: `Missing required fields: ${missingFields.join(', ')}`,
        },
        timestamp: Date.now(),
        source: 'verification-failure',
      };
    }

    // Validate field types
    if (typeof response.source !== 'string') {
      return {
        success: false,
        found: false,
        recordCount: 0,
        error: {
          code: 'INVALID_SOURCE',
          message: 'source field must be string (cache|fresh)',
        },
        timestamp: Date.now(),
        source: 'verification-failure',
      };
    }

    if (typeof response.isStale !== 'boolean') {
      return {
        success: false,
        found: false,
        recordCount: 0,
        error: {
          code: 'INVALID_STALE_FLAG',
          message: 'isStale field must be boolean',
        },
        timestamp: Date.now(),
        source: 'verification-failure',
      };
    }

    if (typeof response.age !== 'number') {
      return {
        success: false,
        found: false,
        recordCount: 0,
        error: {
          code: 'INVALID_AGE',
          message: 'age field must be number (milliseconds)',
        },
        timestamp: Date.now(),
        source: 'verification-failure',
      };
    }

    console.log('[StructureVerification] ✅ Cache response structure valid', {
      source: response.source,
      isStale: response.isStale,
      age: response.age,
    });

    return {
      success: true,
      found: true,
      recordCount: 1,
      timestamp: Date.now(),
      source: 'cache',
    };
  } catch (error) {
    return {
      success: false,
      found: false,
      recordCount: 0,
      error: {
        code: 'EXCEPTION',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: Date.now(),
      source: 'verification-failure',
    };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEBUGGING & DIAGNOSTICS
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Generate diagnostic report for verification failures
 */
export function generateVerificationDiagnostics(result: VerificationResult): string {
  const lines = [
    '═══════════════════════════════════════════════════════════════',
    '📋 DATABASE VERIFICATION DIAGNOSTICS',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Status: ${result.success ? '✅ SUCCESS' : '❌ FAILURE'}`,
    `Data Found: ${result.found ? '✅ YES' : '❌ NO'}`,
    `Record Count: ${result.recordCount}`,
    `Source: ${result.source}`,
    `Timestamp: ${new Date(result.timestamp).toISOString()}`,
    '',
  ];

  if (result.error) {
    lines.push('🔴 ERROR DETAILS');
    lines.push(`Code: ${result.error.code}`);
    lines.push(`Message: ${result.error.message}`);
    if (result.error.hint) {
      lines.push(`Hint: ${result.error.hint}`);
    }
    lines.push('');
  }

  if (result.data) {
    lines.push('✅ DATA FOUND');
    lines.push(JSON.stringify(result.data, null, 2));
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

export default {
  verifyDataInDatabase,
  verifyListingImprovementSaved,
  verifyKeywordsCached,
  verifyCacheResponseStructure,
  generateVerificationDiagnostics,
};
