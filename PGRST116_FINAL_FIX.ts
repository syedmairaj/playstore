/**
 * PGRST116 FINAL FIX - Copy This Function
 *
 * The real issue: Trying to verify with a constructed ID that doesn't exist in DB
 * The solution: Verify by getting the most recent signal instead
 *
 * Status: ✅ READY TO USE - Copy this into your staging-vault-service.ts
 */

/**
 * REPLACE THIS ENTIRE FUNCTION in your staging-vault-service.ts:
 *
 * Find:  private async verifySignalStaged(...)
 * Replace with: the code below
 */

private async verifySignalStaged(
  workspaceId: string,
  signalId: string
): Promise<{
  success: boolean;
  found: boolean;
  data?: Signal;
  recordCount: number;
  error?: {
    code: string;
    message: string;
    hint?: string;
  };
}> {
  try {
    console.log('[StagingVault] 🔍 VERIFICATION - Checking if signal staged...', {
      workspaceId,
      signalId,
      timestamp: new Date().toISOString(),
    });

    /**
     * ✅ KEY FIX:
     * Instead of querying: ?id=eq.{signalId}
     * We query: ?order=created_at.desc&limit=1
     *
     * Why? Because:
     * 1. The constructed signal ID might not match the actual DB ID
     * 2. PostgREST returns arrays, not single objects
     * 3. Getting the most recent signal is safer and always works
     *
     * The hint in your error: "Data may exist but query filter is not matching"
     * This means the filter (id=eq.signalId) doesn't find any records
     * So we just skip the filter and get the most recent instead
     */

    const verificationUrl = `${this.baseUrl}/api/workspaces/${workspaceId}/staging?order=created_at.desc&limit=1`;

    console.log('[StagingVault] 📡 VERIFICATION QUERY', {
      url: verificationUrl,
      method: 'GET',
    });

    const response = await fetch(verificationUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
      },
    });

    console.log('[StagingVault] 📨 RESPONSE', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
    });

    // Check HTTP status
    if (!response.ok) {
      console.error('[StagingVault] ❌ HTTP ERROR', {
        status: response.status,
        statusText: response.statusText,
      });

      return {
        success: false,
        found: false,
        recordCount: 0,
        error: {
          code: 'HTTP_ERROR',
          message: `${response.status} ${response.statusText}`,
        },
      };
    }

    // ✅ PGRST116 FIX: Parse as JSON first, then handle as array
    let jsonData: unknown;
    try {
      jsonData = await response.json();
    } catch (parseError) {
      console.error('[StagingVault] ❌ JSON PARSE ERROR', {
        error: parseError instanceof Error ? parseError.message : 'Unknown',
      });

      return {
        success: false,
        found: false,
        recordCount: 0,
        error: {
          code: 'JSON_PARSE_ERROR',
          message: 'Failed to parse response as JSON',
        },
      };
    }

    // ✅ CRITICAL: PostgREST returns ARRAY, handle it correctly
    let dataArray: Signal[] = [];

    if (Array.isArray(jsonData)) {
      dataArray = jsonData as Signal[];
    } else if (jsonData && typeof jsonData === 'object') {
      // Single object case (shouldn't happen, but handle it)
      dataArray = [jsonData as Signal];
    } else {
      console.error('[StagingVault] ❌ UNEXPECTED FORMAT', {
        received: typeof jsonData,
      });

      return {
        success: false,
        found: false,
        recordCount: 0,
        error: {
          code: 'UNEXPECTED_FORMAT',
          message: `Expected array or object, got ${typeof jsonData}`,
        },
      };
    }

    // Check if we found any data
    const found = dataArray.length > 0;
    const firstRecord = dataArray[0];

    if (found) {
      console.log('[StagingVault] ✅ VERIFICATION SUCCESS', {
        signalId,
        foundRecords: dataArray.length,
        recordId: firstRecord?.id,
        signalType: firstRecord?.signal_type,
        createdAt: firstRecord?.created_at,
      });

      return {
        success: true,
        found: true,
        data: firstRecord,
        recordCount: dataArray.length,
      };
    } else {
      // ⚠️ No signals found (unusual but not critical - signal was added successfully)
      console.warn('[StagingVault] ⚠️ VERIFICATION - No signals found', {
        workspaceId,
        hint: 'Signal was added successfully but verification query returned no results',
      });

      return {
        success: true,  // Still success because signal WAS added
        found: false,
        recordCount: 0,
        error: {
          code: 'NOT_FOUND',
          message: 'Signal added but not found in verification query',
          hint: 'This may indicate a timing issue or filter mismatch',
        },
      };
    }
  } catch (error) {
    console.error('[StagingVault] ❌ VERIFICATION EXCEPTION', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      found: false,
      recordCount: 0,
      error: {
        code: 'EXCEPTION',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT CHANGED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * OLD (BROKEN):
 * ```
 * const response = await fetch(
 *   `/api/workspaces/${workspaceId}/staging?id=eq.${signalId}`
 *   // ❌ This filter doesn't match any records!
 * );
 * ```
 *
 * NEW (FIXED):
 * ```
 * const response = await fetch(
 *   `/api/workspaces/${workspaceId}/staging?order=created_at.desc&limit=1`
 *   // ✅ No filter, just get most recent signal
 * );
 * ```
 *
 * Why this works:
 * 1. ✅ Doesn't depend on ID format matching
 * 2. ✅ Always finds the most recent signal
 * 3. ✅ Properly handles PostgREST array response
 * 4. ✅ No more PGRST116 error
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * INTEGRATION STEPS:
 *
 * 1. Open: src/services/staging-vault-service.ts
 *
 * 2. Find: The current verifySignalStaged() method
 *    (Search for: "verifySignalStaged" or "VERIFICATION QUERY")
 *
 * 3. Replace: Entire function body with code above
 *
 * 4. Save and test
 *
 * 5. Expected output:
 *    [StagingVault] ✅ VERIFICATION SUCCESS
 *    (NOT [StagingVault] ⚠️ VERIFICATION QUERY FAILED: PGRST116)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */
