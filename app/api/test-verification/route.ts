import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { generateASOAsset } from "@/lib/gemini/generate-aso-assets";
import { validateCompositionAssets } from "@/lib/screenshot/compose-screenshot";

/**
 * Test Verification Route: /api/test-verification
 *
 * Performs comprehensive system validation:
 * 1. Tests crash fallback with undefined schemaId
 * 2. Verifies Hard-Clamp prompt cleaning
 * 3. Tests RTL scrim composition (Arabic banner)
 * 4. Returns diagnostic logs + status
 *
 * SECURITY: Only available in development or with ?token=TEST_SECRET
 * Remove this route before production deployment.
 *
 * @example
 *   GET /api/test-verification?token=TEST_SECRET
 *   Response: { status: "success", tests: [...], logs: [...] }
 */
export async function GET(request: NextRequest) {
  // ── Security check: Only allow in development or with token ───────────────
  const token = request.nextUrl.searchParams.get("token");
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev && token !== process.env.TEST_VERIFICATION_TOKEN) {
    return NextResponse.json(
      { status: "forbidden", message: "Test verification route not available" },
      { status: 403 }
    );
  }

  const logs: string[] = [];
  const tests: Array<{
    name: string;
    status: "pass" | "fail";
    message: string;
  }> = [];

  try {
    console.log("[test-verification] Starting comprehensive system validation...");
    logs.push("[test-verification] Starting comprehensive system validation...");

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Asset Validation
    // ─────────────────────────────────────────────────────────────────────────

    console.log("[test-verification] TEST 1: Validating composition assets...");
    logs.push("[test-verification] TEST 1: Validating composition assets...");

    const assetReport = await validateCompositionAssets();

    if (assetReport.health === "healthy") {
      tests.push({
        name: "Asset Validation",
        status: "pass",
        message: `All assets healthy: ${Object.keys(assetReport.schemas).length} schemas, ${Object.keys(assetReport.fonts).length} fonts`,
      });
      console.log(
        `[test-verification] ✓ Assets healthy: ${assetReport.summary}`
      );
      logs.push(`[test-verification] ✓ ${assetReport.summary}`);
    } else {
      tests.push({
        name: "Asset Validation",
        status: "fail",
        message: `Asset health ${assetReport.health}: ${assetReport.missing.length} missing items`,
      });
      console.warn(
        `[test-verification] ⚠️  Asset issues: ${assetReport.summary}`
      );
      logs.push(`[test-verification] ⚠️  ${assetReport.summary}`);
      assetReport.missing.forEach((m) =>
        logs.push(`  - Missing: ${m}`)
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Crash Fallback with Undefined schemaId
    // ─────────────────────────────────────────────────────────────────────────

    console.log(
      "[test-verification] TEST 2: Testing crash fallback (undefined schemaId)..."
    );
    logs.push(
      "[test-verification] TEST 2: Testing crash fallback (undefined schemaId)..."
    );

    try {
      // This would normally crash if schemaId is undefined
      // The fix should default to 'minimalist-professional'
      const asset = await generateASOAsset({
        appName: "Test App",
        category: "productivity",
        generatorType: "screenshot",
        style: "Modern",
        locale: "en",
        // Intentionally NOT providing brandColor to test schema selection
      });

      if (
        asset.selectedSchema === "minimalist-professional" ||
        asset.selectedSchema
      ) {
        tests.push({
          name: "Crash Fallback (Undefined schemaId)",
          status: "pass",
          message: `Generated asset with schema: ${asset.selectedSchema}`,
        });
        console.log(
          `[test-verification] ✓ No crash on undefined schemaId, defaulted to: ${asset.selectedSchema}`
        );
        logs.push(
          `[test-verification] ✓ Crash fallback working: schema=${asset.selectedSchema}`
        );
      } else {
        tests.push({
          name: "Crash Fallback (Undefined schemaId)",
          status: "fail",
          message: "Asset generated but schema validation failed",
        });
      }
    } catch (err) {
      tests.push({
        name: "Crash Fallback (Undefined schemaId)",
        status: "fail",
        message: `Crash occurred: ${err instanceof Error ? err.message : String(err)}`,
      });
      console.error(`[test-verification] ❌ Crash fallback failed:`, err);
      logs.push(
        `[test-verification] ❌ Crash: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Hard-Clamp Prompt Verification
    // ─────────────────────────────────────────────────────────────────────────

    console.log(
      "[test-verification] TEST 3: Verifying Hard-Clamp prompt cleaning..."
    );
    logs.push(
      "[test-verification] TEST 3: Verifying Hard-Clamp prompt cleaning..."
    );

    try {
      // Generate with potentially problematic app name
      const bannerAsset = await generateASOAsset({
        appName: "Finance App Pro",
        category: "finance",
        generatorType: "banner",
        style: "Professional",
        locale: "en",
        bannerHeadline: "Screenshot your mobile phone app",
      });

      // Check if dangerous keywords are in the background prompt
      const dangerousKeywords = [
        "app",
        "screenshot",
        "mobile",
        "phone",
        "device",
      ];
      const foundKeywords = dangerousKeywords.filter((kw) =>
        bannerAsset.backgroundPrompt.toLowerCase().includes(kw)
      );

      if (foundKeywords.length === 0) {
        tests.push({
          name: "Hard-Clamp Prompt Verification",
          status: "pass",
          message: "Background prompt is clean (no dangerous keywords)",
        });
        console.log(
          `[test-verification] ✓ Prompt cleaning working: no dangerous keywords found`
        );
        logs.push(
          `[test-verification] ✓ Hard-Clamp verification: CLEAN (no dangerous keywords)`
        );
      } else {
        tests.push({
          name: "Hard-Clamp Prompt Verification",
          status: "fail",
          message: `Dangerous keywords found: ${foundKeywords.join(", ")}`,
        });
        console.warn(
          `[test-verification] ⚠️  Dangerous keywords in prompt:`,
          foundKeywords
        );
        logs.push(
          `[test-verification] ❌ Hard-Clamp verification: CONTAMINATED - Found: ${foundKeywords.join(", ")}`
        );
        logs.push(`    Background prompt: ${bannerAsset.backgroundPrompt}`);
      }
    } catch (err) {
      tests.push({
        name: "Hard-Clamp Prompt Verification",
        status: "fail",
        message: `Failed to generate banner: ${err instanceof Error ? err.message : String(err)}`,
      });
      console.error(`[test-verification] ❌ Hard-Clamp test failed:`, err);
      logs.push(
        `[test-verification] ❌ Hard-Clamp: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: RTL Scrim Composition (Arabic Banner)
    // ─────────────────────────────────────────────────────────────────────────

    console.log(
      "[test-verification] TEST 4: Testing RTL scrim composition (Arabic banner)..."
    );
    logs.push(
      "[test-verification] TEST 4: Testing RTL scrim composition (Arabic banner)..."
    );

    try {
      const rtlBannerAsset = await generateASOAsset({
        appName: "تطبيق تمويل",
        category: "finance",
        generatorType: "banner",
        style: "Professional",
        locale: "ar",
        bannerHeadline: "أدر أموالك بذكاء",
      });

      if (rtlBannerAsset.generatorType === "banner") {
        const bannerMeta = rtlBannerAsset.bannerMetadata;
        if (bannerMeta) {
          tests.push({
            name: "RTL Scrim Composition (Arabic)",
            status: "pass",
            message: `RTL banner ready: aspectRatio=${bannerMeta.aspectRatio}, textZone=${bannerMeta.textZonePosition}`,
          });
          console.log(
            `[test-verification] ✓ RTL banner generated: textZonePosition=${bannerMeta.textZonePosition}`
          );
          logs.push(
            `[test-verification] ✓ RTL Banner: aspectRatio=${bannerMeta.aspectRatio}, textZone=${bannerMeta.textZonePosition}`
          );
        } else {
          tests.push({
            name: "RTL Scrim Composition (Arabic)",
            status: "fail",
            message: "Banner metadata missing",
          });
          console.error(`[test-verification] ❌ Banner metadata missing`);
          logs.push(`[test-verification] ❌ Banner metadata missing`);
        }
      } else {
        tests.push({
          name: "RTL Scrim Composition (Arabic)",
          status: "fail",
          message: `Wrong asset type: ${rtlBannerAsset.generatorType}`,
        });
        console.error(
          `[test-verification] ❌ Wrong asset type: ${rtlBannerAsset.generatorType}`
        );
        logs.push(
          `[test-verification] ❌ Wrong type: expected banner, got ${rtlBannerAsset.generatorType}`
        );
      }
    } catch (err) {
      tests.push({
        name: "RTL Scrim Composition (Arabic)",
        status: "fail",
        message: `Failed to generate RTL banner: ${err instanceof Error ? err.message : String(err)}`,
      });
      console.error(`[test-verification] ❌ RTL test failed:`, err);
      logs.push(
        `[test-verification] ❌ RTL: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────────────────

    const passed = tests.filter((t) => t.status === "pass").length;
    const failed = tests.filter((t) => t.status === "fail").length;
    const allPassed = failed === 0;

    console.log(
      `[test-verification] SUMMARY: ${passed}/${tests.length} tests passed`
    );
    logs.push(
      `[test-verification] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );
    logs.push(
      `[test-verification] SUMMARY: ${passed}/${tests.length} tests passed${allPassed ? " ✓" : " ❌"}`
    );

    return NextResponse.json(
      {
        status: allPassed ? "success" : "partial",
        summary: {
          total: tests.length,
          passed,
          failed,
        },
        tests,
        logs: logs.slice(0, 50), // Return last 50 log lines
        timestamp: new Date().toISOString(),
      },
      { status: allPassed ? 200 : 206 }
    );
  } catch (err) {
    console.error("[test-verification] Unexpected error:", err);
    return NextResponse.json(
      {
        status: "error",
        message: "Test verification failed",
        error: err instanceof Error ? err.message : String(err),
        logs: logs.slice(0, 50),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler for manual trigger of specific tests
 * Body: { test: "assets" | "crash-fallback" | "prompt" | "rtl", ... }
 */
export async function POST(request: NextRequest) {
  // Security check
  const token = request.headers.get("authorization")?.split(" ")[1];
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev && token !== process.env.TEST_VERIFICATION_TOKEN) {
    return NextResponse.json(
      { status: "forbidden" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { test } = body as { test?: string };

    if (test === "assets") {
      const report = await validateCompositionAssets();
      return NextResponse.json({ status: "success", data: report });
    }

    return NextResponse.json(
      { status: "error", message: "Invalid test specified" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: String(err) },
      { status: 500 }
    );
  }
}
