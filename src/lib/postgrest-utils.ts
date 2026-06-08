/**
 * PostgREST Utility Functions
 * Fixes PGRST116 errors by properly handling array responses
 *
 * Problem: PostgREST returns arrays for GET queries
 * but some code expects single objects → PGRST116 error
 *
 * Solution: Use these utilities instead of direct fetch().json()
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TYPE DEFINITIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface PostgRESTResponse<T = unknown> {
  success: boolean;
  found: boolean;
  data?: T;
  items: T[];
  count: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: Record<string, unknown> | string | null;
  baseUrl?: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CORE: Parse PostgREST Response
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Safely parse PostgREST response (handles arrays and single objects)
 *
 * ✅ PostgREST ALWAYS returns arrays for GET queries
 * ✅ This handles both array and single object formats
 * ✅ Returns consistent interface for all cases
 *
 * @param jsonData Raw JSON from PostgREST endpoint
 * @returns Normalized response with items array and first item
 */
export function parsePostgRESTResponse<T = unknown>(
  jsonData: unknown
): PostgRESTResponse<T> {
  try {
    // Handle null/undefined
    if (jsonData === null || jsonData === undefined) {
      return {
        success: true,
        found: false,
        items: [],
        count: 0,
      };
    }

    // Convert to array
    let items: T[] = [];

    if (Array.isArray(jsonData)) {
      // Already array - use directly
      items = jsonData as T[];
    } else if (typeof jsonData === 'object') {
      // Single object - wrap in array
      items = [jsonData as T];
    } else {
      // Unexpected type
      return {
        success: false,
        found: false,
        items: [],
        count: 0,
        error: {
          code: 'INVALID_FORMAT',
          message: `Expected object or array, got ${typeof jsonData}`,
        },
      };
    }

    return {
      success: true,
      found: items.length > 0,
      data: items[0],  // First item for convenience
      items,            // All items
      count: items.length,
    };
  } catch (error) {
    return {
      success: false,
      found: false,
      items: [],
      count: 0,
      error: {
        code: 'PARSE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FETCH: Safe PostgREST Fetch
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Fetch from PostgREST endpoint with automatic array handling
 *
 * ✅ Handles PGRST116 errors automatically
 * ✅ Returns normalized response format
 * ✅ Includes error handling
 * ✅ Works with GET, POST, PATCH, DELETE
 *
 * @param url PostgREST endpoint URL
 * @param options Fetch options (headers, method, body, etc)
 * @returns Normalized PostgRESTResponse with items array
 *
 * @example
 * ```typescript
 * // GET query
 * const result = await fetchFromPostgREST('/api/competitors?workspace_id=eq.xxx');
 * if (result.found) {
 *   console.log('Found competitors:', result.items);
 * }
 *
 * // POST query
 * const result = await fetchFromPostgREST('/api/staging/add', {
 *   method: 'POST',
 *   body: { signal_type: 'competitor_weakness', data: {...} },
 *   headers: { 'Authorization': `Bearer ${token}` },
 * });
 * if (result.success) {
 *   console.log('Signal added:', result.data);
 * }
 * ```
 */
export async function fetchFromPostgREST<T = unknown>(
  url: string,
  options?: FetchOptions
): Promise<PostgRESTResponse<T>> {
  try {
    // Prepare fetch options
    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    };

    // Handle body serialization
    if (options?.body && typeof options.body === 'object') {
      fetchOptions.body = JSON.stringify(options.body);
    }

    console.log('[PostgRESTUtils] 📡 Fetching:', {
      url,
      method: fetchOptions.method || 'GET',
    });

    // Execute fetch
    const response = await fetch(url, fetchOptions);

    console.log('[PostgRESTUtils] 📨 Response:', {
      status: response.status,
      statusText: response.statusText,
    });

    // Check HTTP status
    if (!response.ok) {
      console.error('[PostgRESTUtils] ❌ HTTP Error:', {
        status: response.status,
        statusText: response.statusText,
      });

      return {
        success: false,
        found: false,
        items: [],
        count: 0,
        error: {
          code: 'HTTP_ERROR',
          message: `${response.status} ${response.statusText}`,
        },
      };
    }

    // Parse JSON
    let jsonData: unknown;
    try {
      jsonData = await response.json();
    } catch (parseError) {
      console.error('[PostgRESTUtils] ❌ JSON Parse Error');

      return {
        success: false,
        found: false,
        items: [],
        count: 0,
        error: {
          code: 'JSON_PARSE_ERROR',
          message: parseError instanceof Error ? parseError.message : 'Failed to parse JSON',
        },
      };
    }

    // ✅ CRITICAL: Parse with array handling
    const result = parsePostgRESTResponse<T>(jsonData);

    if (result.success) {
      console.log('[PostgRESTUtils] ✅ Success:', {
        found: result.found,
        count: result.count,
      });
    } else {
      console.error('[PostgRESTUtils] ❌ Parse Error:', result.error);
    }

    return result;
  } catch (error) {
    console.error('[PostgRESTUtils] ❌ Fetch Exception:', {
      error: error instanceof Error ? error.message : error,
    });

    return {
      success: false,
      found: false,
      items: [],
      count: 0,
      error: {
        code: 'FETCH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SPECIALIZED: Query-Specific Helpers
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Verify data exists in database
 * Returns single item if found, null if not
 */
export async function verifyInDatabase<T = unknown>(
  url: string,
  options?: FetchOptions
): Promise<T | null> {
  const result = await fetchFromPostgREST<T>(url, options);

  if (result.found && result.data) {
    console.log('[PostgRESTUtils] ✅ Verification SUCCESS:', {
      found: true,
      count: result.count,
    });
    return result.data;
  }

  console.warn('[PostgRESTUtils] ⚠️ Verification NO DATA:', {
    found: false,
    count: result.count,
  });

  return null;
}

/**
 * Get all items from query
 * Returns array of all results
 */
export async function getAll<T = unknown>(
  url: string,
  options?: FetchOptions
): Promise<T[]> {
  const result = await fetchFromPostgREST<T>(url, options);

  if (result.success) {
    console.log('[PostgRESTUtils] ✅ Got all items:', {
      count: result.count,
    });
    return result.items;
  }

  console.error('[PostgRESTUtils] ❌ Get all failed:', result.error);
  return [];
}

/**
 * Get first item from query (like limit=1)
 * Returns single item or null
 */
export async function getFirst<T = unknown>(
  url: string,
  options?: FetchOptions
): Promise<T | null> {
  const result = await fetchFromPostgREST<T>(url, options);
  return result.data || null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BATCH OPERATIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Execute multiple PostgREST queries in parallel
 */
export async function fetchBatch<T = unknown>(
  queries: Array<{ url: string; options?: FetchOptions }>
): Promise<PostgRESTResponse<T>[]> {
  try {
    console.log('[PostgRESTUtils] 🔀 Batch fetch started:', {
      count: queries.length,
    });

    const results = await Promise.all(
      queries.map((query) => fetchFromPostgREST<T>(query.url, query.options))
    );

    console.log('[PostgRESTUtils] ✅ Batch fetch completed');
    return results;
  } catch (error) {
    console.error('[PostgRESTUtils] ❌ Batch fetch error:', error);
    return [];
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONVERSION HELPERS
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Convert fetch response to array (safe)
 * @example
 * const data = await response.json();
 * const items = toArray(data);  // Always array
 */
export function toArray<T = unknown>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return [data as T];
  return [];
}

/**
 * Convert fetch response to single item (safe)
 * @example
 * const data = await response.json();
 * const item = toSingle(data);  // Single item or null
 */
export function toSingle<T = unknown>(data: unknown): T | null {
  if (Array.isArray(data)) return data[0] || null;
  if (data && typeof data === 'object') return data as T;
  return null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MIGRATION HELPER: Wrap existing fetch calls
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Wrap an existing fetch call to add PGRST116 protection
 *
 * @example
 * ```typescript
 * // BEFORE (risky)
 * const data = await fetch(url).then(r => r.json());
 *
 * // AFTER (safe)
 * const data = await safeFetch(url).then(r => r.data);
 * ```
 */
export async function safeFetch<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<{
  ok: boolean;
  status: number;
  data?: T | T[];
  error?: string;
}> {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    const jsonData = await response.json();
    const items = toArray<T>(jsonData);

    return {
      ok: response.ok,
      status: response.status,
      data: items.length === 1 ? items[0] : items,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPORT DEFAULT
 * ═══════════════════════════════════════════════════════════════════════════
 */

export default {
  parsePostgRESTResponse,
  fetchFromPostgREST,
  verifyInDatabase,
  getAll,
  getFirst,
  fetchBatch,
  toArray,
  toSingle,
  safeFetch,
};
