/**
 * publish-e2e.test.ts
 *
 * E2E test harness for publishListingToPlayStore — the function that pushes
 * AI-generated listing copy to Google Play Console via the androidpublisher API.
 *
 * ── Safety contract ──────────────────────────────────────────────────────────
 * No real network call is ever made.  All Google API traffic is intercepted at
 * the `googleapis` module boundary via vi.mock.  All Supabase DB reads are
 * intercepted via vi.mock on the OAuth module.  The environment is explicitly
 * NODE-ONLY (vitest.config.ts: environment: 'node').
 *
 * ── Mock architecture ────────────────────────────────────────────────────────
 * vi.hoisted() creates stable mock function references BEFORE the vi.mock
 * factory runs (vitest hoists vi.mock to the top of the file, so ordinary
 * module-level const declarations are not yet in scope at that point).
 * A beforeEach block re-establishes all default implementations after vitest's
 * mockReset pass clears them between tests.
 *
 * ── Dry-run mode ─────────────────────────────────────────────────────────────
 * Call runDryPublish(params) to execute the full code path with mocks capturing
 * but not executing API calls.  The captured payload is printed to stdout and
 * returned so callers can assert the exact Play Console requestBody shape.
 *
 * ── Test matrix ──────────────────────────────────────────────────────────────
 *  1.  resolvePlayLanguage — locale mapping table (unit)
 *  2.  Input validation — no_package_name / validation_error gates
 *  3.  Field clamping + whitespace trimming
 *  4.  Missing credentials — not_connected "silently skipped" contract
 *  5.  Happy-path en  (en → en-US)
 *  6.  Happy-path ar  (ar → ar)
 *  7.  Happy-path en-US passthrough
 *  8.  Full requestBody shape assertion
 *  9.  3-step API call sequence assertion
 * 10.  Multi-locale batch table test
 * 11.  Auth errors — invalid_grant / 401 / Token has been expired → auth_error
 * 12.  Permission error — 403 → auth_error
 * 13.  Generic API error → api_error
 * 14.  Missing editId from edits.insert → api_error
 * 15.  Dry-run captures + logs EN requestBody
 * 16.  Dry-run captures + logs AR requestBody (Arabic Unicode assertion)
 * 17.  Dry-run multi-locale comparison
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ── 1. Create stable mock references with vi.hoisted ─────────────────────────
// These refs are created before vi.mock factories run, so the factories can
// close over them.  beforeEach re-installs default implementations after reset.

type CapturedApiCall = {
  method: "edits.insert" | "edits.listings.update" | "edits.commit";
  args: unknown;
};

const {
  capturedCalls,
  mockEditsInsert,
  mockEditsListingsUpdate,
  mockEditsCommit,
  mockAndroidPublisher,
  mockOAuth2Ctor,
  mockGetOAuth2Client,
} = vi.hoisted(() => {
  const capturedCalls: CapturedApiCall[] = [];

  const mockEditsInsert = vi.fn();
  const mockEditsListingsUpdate = vi.fn();
  const mockEditsCommit = vi.fn();

  const mockAndroidPublisher = vi.fn(() => ({
    edits: {
      insert: mockEditsInsert,
      listings: { update: mockEditsListingsUpdate },
      commit: mockEditsCommit,
    },
  }));

  const mockOAuth2Ctor = vi.fn(() => ({
    setCredentials: vi.fn(),
    generateAuthUrl: vi.fn().mockReturnValue("https://accounts.google.com/mock"),
    getAccessToken: vi.fn().mockResolvedValue({ token: "mock_access_token_xyz" }),
  }));

  const mockGetOAuth2Client = vi.fn();

  return {
    capturedCalls,
    mockEditsInsert,
    mockEditsListingsUpdate,
    mockEditsCommit,
    mockAndroidPublisher,
    mockOAuth2Ctor,
    mockGetOAuth2Client,
  };
});

// ── 2. vi.mock declarations (hoisted automatically by vitest) ─────────────────

vi.mock("googleapis", () => ({
  google: {
    androidpublisher: mockAndroidPublisher,
    auth: { OAuth2: mockOAuth2Ctor },
  },
}));

vi.mock("@/lib/play-store/google-play-oauth", () => ({
  getOAuth2ClientForWorkspace: mockGetOAuth2Client,
  getRefreshToken: vi.fn().mockResolvedValue("mock_refresh_token"),
  getConnectedAccount: vi.fn().mockResolvedValue({
    id: "acct-001",
    workspaceId: "ws-test",
    provider: "google_play",
    authorizedEmail: "test@example.com",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

// ── 3. Imports (AFTER vi.mock so they receive the mocked versions) ────────────

import {
  publishListingToPlayStore,
  resolvePlayLanguage,
  type ListingFields,
  type PublishListingResult,
} from "../publish-listing-to-play-store";

// ── 4. Re-establish default implementations between tests ────────────────────

beforeEach(() => {
  // Clear call history so per-test assertion counts are accurate
  vi.clearAllMocks();
  // Clear the shared capture store
  capturedCalls.length = 0;

  // Default: oauth succeeds — returns a minimal OAuth2-client stub
  mockGetOAuth2Client.mockResolvedValue({
    setCredentials: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue({ token: "mock_access_token_xyz" }),
  });

  // Default: androidpublisher() returns a client with functional stub methods
  mockAndroidPublisher.mockReturnValue({
    edits: {
      insert: mockEditsInsert,
      listings: { update: mockEditsListingsUpdate },
      commit: mockEditsCommit,
    },
  });

  // Default: edits.insert returns a valid edit with a known ID
  mockEditsInsert.mockResolvedValue({ data: { id: "mock-edit-id-001" } });

  // Default: edits.listings.update captures args and returns success
  mockEditsListingsUpdate.mockImplementation(async (args: unknown) => {
    capturedCalls.push({ method: "edits.listings.update", args });
    return { data: {} };
  });

  // Default: edits.commit returns success
  mockEditsCommit.mockResolvedValue({ data: {} });
});

// ── Shared fixtures ───────────────────────────────────────────────────────────

const WORKSPACE_ID = "ws-test-001";
const PACKAGE_NAME = "com.example.myapp";

const EN_LISTING: ListingFields = {
  title: "Habit Tracker Pro",
  shortDescription: "Build lasting habits with streaks, reminders, and smart insights.",
  fullDescription:
    "Habit Tracker Pro helps you build and maintain powerful daily habits. " +
    "Features include streak tracking, adaptive reminders, progress analytics, " +
    "and a beautiful minimal interface. Trusted by 500 000+ users worldwide.",
};

const AR_LISTING: ListingFields = {
  title: "متتبع العادات برو",
  shortDescription: "أنشئ عادات دائمة مع التسلسلات والتذكيرات والرؤى الذكية.",
  fullDescription:
    "يساعدك متتبع العادات برو على بناء عادات يومية قوية والحفاظ عليها. " +
    "تشمل الميزات: تتبع التسلسل، والتذكيرات التكيفية، وتحليلات التقدم، " +
    "وواجهة أنيقة بسيطة. موثوق به من قبل أكثر من 500,000 مستخدم حول العالم.",
};

// ── Dry-run helper ────────────────────────────────────────────────────────────

type DryRunResult = {
  /** requestBody captured from edits.listings.update */
  capturedPayload: {
    language: string;
    title: string;
    shortDescription: string;
    fullDescription: string;
  } | null;
  /** Full params object including packageName, editId, language */
  fullUpdateArgs: Record<string, unknown> | null;
  /** The function result (ok: true/false) */
  result: PublishListingResult;
};

/**
 * Runs publishListingToPlayStore in dry-run mode.
 *
 * Clears the shared capturedCalls store, invokes the function, then extracts
 * and LOGS the requestBody sent to edits.listings.update.  Returns the
 * captured payload so tests can assert its exact shape.
 */
async function runDryPublish(params: {
  workspaceId?: string;
  packageName?: string;
  locale?: string;
  listing?: ListingFields;
}): Promise<DryRunResult> {
  const {
    workspaceId = WORKSPACE_ID,
    packageName = PACKAGE_NAME,
    locale = "en",
    listing = EN_LISTING,
  } = params;

  // Reset captures for this specific run (beforeEach already clears between tests)
  capturedCalls.length = 0;

  const result = await publishListingToPlayStore({
    workspaceId,
    packageName,
    locale,
    listing,
  });

  const updateCall = capturedCalls.find((c) => c.method === "edits.listings.update");
  const fullUpdateArgs = updateCall ? (updateCall.args as Record<string, unknown>) : null;
  const capturedPayload = fullUpdateArgs
    ? (fullUpdateArgs.requestBody as DryRunResult["capturedPayload"])
    : null;

  // ── DRY-RUN LOG ──────────────────────────────────────────────────────────
  // Inspect this in CI stdout (--reporter=verbose) or locally with vitest --ui
  console.log("\n[DRY-RUN] publishListingToPlayStore captured API payload:");
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        sandboxed: true,
        noLiveApiCallMade: true,
        input: { workspaceId, packageName, locale },
        capturedListingsUpdateArgs: fullUpdateArgs,
        functionResult: result,
      },
      null,
      2,
    ),
  );

  return { capturedPayload, fullUpdateArgs, result };
}

// ── Helper: make the OAuth client throw (simulates missing/disconnected creds) ─

function simulateMissingCredentials() {
  mockGetOAuth2Client.mockRejectedValueOnce(
    new Error(
      "No Google Play account connected for workspace ws-test-001. " +
        "Connect via Settings → Integrations → Connected Stores.",
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────────────────

// ── resolvePlayLanguage ────────────────────────────────────────────────────────

describe("resolvePlayLanguage — locale → BCP-47 Play Console mapping", () => {
  it("maps 'en' to 'en-US'", () => {
    expect(resolvePlayLanguage("en")).toBe("en-US");
  });

  it("maps 'ar' to 'ar'", () => {
    expect(resolvePlayLanguage("ar")).toBe("ar");
  });

  it("passes 'en-US' through unchanged", () => {
    expect(resolvePlayLanguage("en-US")).toBe("en-US");
  });

  it("passes 'en-GB' through unchanged", () => {
    expect(resolvePlayLanguage("en-GB")).toBe("en-GB");
  });

  it("passes unknown locale codes through as-is (safe passthrough fallback)", () => {
    expect(resolvePlayLanguage("fr")).toBe("fr");
    expect(resolvePlayLanguage("de-DE")).toBe("de-DE");
    expect(resolvePlayLanguage("pt-BR")).toBe("pt-BR");
  });
});

// ── Input validation ──────────────────────────────────────────────────────────

describe("publishListingToPlayStore — input validation", () => {
  it("returns no_package_name when packageName is empty string", async () => {
    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: "",
      locale: "en",
      listing: EN_LISTING,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("no_package_name");
      expect(result.message).toMatch(/package name/i);
    }
  });

  it("returns no_package_name when packageName is whitespace-only", async () => {
    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: "   ",
      locale: "en",
      listing: EN_LISTING,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("no_package_name");
  });

  it("returns validation_error when title is empty", async () => {
    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: { ...EN_LISTING, title: "" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("validation_error");
      expect(result.message).toMatch(/title/i);
    }
  });

  it("returns validation_error when shortDescription is empty", async () => {
    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: { ...EN_LISTING, shortDescription: "" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("validation_error");
  });

  it("returns validation_error when fullDescription is empty", async () => {
    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: { ...EN_LISTING, fullDescription: "" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("validation_error");
  });

  it("returns validation_error when all fields are whitespace-only", async () => {
    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: { title: "   ", shortDescription: "   ", fullDescription: "   " },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("validation_error");
  });

  it("does NOT call the Google API for any validation failure", async () => {
    await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: "",
      listing: EN_LISTING,
    });
    expect(mockAndroidPublisher).not.toHaveBeenCalled();
  });
});

// ── Field clamping ────────────────────────────────────────────────────────────

describe("publishListingToPlayStore — Play Console character limit enforcement", () => {
  it("clamps title to 30 characters before sending to API", async () => {
    const { capturedPayload, result } = await runDryPublish({
      listing: { ...EN_LISTING, title: "A".repeat(50) },
    });
    expect(result.ok).toBe(true);
    expect(capturedPayload!.title.length).toBe(30);
    expect(capturedPayload!.title).toBe("A".repeat(30));
  });

  it("clamps shortDescription to 80 characters", async () => {
    const { capturedPayload, result } = await runDryPublish({
      listing: { ...EN_LISTING, shortDescription: "B".repeat(120) },
    });
    expect(result.ok).toBe(true);
    expect(capturedPayload!.shortDescription.length).toBe(80);
  });

  it("clamps fullDescription to 4 000 characters", async () => {
    const { capturedPayload, result } = await runDryPublish({
      listing: { ...EN_LISTING, fullDescription: "C".repeat(5000) },
    });
    expect(result.ok).toBe(true);
    expect(capturedPayload!.fullDescription.length).toBe(4000);
  });

  it("does NOT truncate fields that are within limits", async () => {
    const { capturedPayload, result } = await runDryPublish({ listing: EN_LISTING });
    expect(result.ok).toBe(true);
    expect(capturedPayload!.title).toBe(EN_LISTING.title.trim());
    expect(capturedPayload!.shortDescription).toBe(EN_LISTING.shortDescription.trim());
    expect(capturedPayload!.fullDescription).toBe(EN_LISTING.fullDescription.trim());
  });

  it("trims leading and trailing whitespace from all three fields", async () => {
    const { capturedPayload, result } = await runDryPublish({
      listing: {
        title: "  My App  ",
        shortDescription: "  Short desc  ",
        fullDescription: "  Long desc  ",
      },
    });
    expect(result.ok).toBe(true);
    expect(capturedPayload!.title).toBe("My App");
    expect(capturedPayload!.shortDescription).toBe("Short desc");
    expect(capturedPayload!.fullDescription).toBe("Long desc");
  });
});

// ── Missing credentials (silently skipped) ───────────────────────────────────

describe("publishListingToPlayStore — missing credentials (not_connected / silently skipped)", () => {
  it("returns { ok: false, code: 'not_connected' } when no account is connected", async () => {
    simulateMissingCredentials();

    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: EN_LISTING,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_connected");
      expect(result.message).toMatch(/connect/i);
    }
  });

  it("does NOT throw — batch callers can silently skip without try/catch", async () => {
    simulateMissingCredentials();

    let threw = false;
    let result: PublishListingResult | null = null;
    try {
      result = await publishListingToPlayStore({
        workspaceId: WORKSPACE_ID,
        packageName: PACKAGE_NAME,
        locale: "en",
        listing: EN_LISTING,
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result?.ok).toBe(false);
    if (result && !result.ok) expect(result.code).toBe("not_connected");
  });

  it("never calls the Google API when credentials are missing", async () => {
    simulateMissingCredentials();

    await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: EN_LISTING,
    });

    expect(mockAndroidPublisher).not.toHaveBeenCalled();
    expect(mockEditsInsert).not.toHaveBeenCalled();
  });
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe("publishListingToPlayStore — happy path", () => {
  it("returns { ok: true, editId, language } for a successful English publish", async () => {
    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: EN_LISTING,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.editId).toBe("mock-edit-id-001");
      expect(result.language).toBe("en-US");
    }
  });

  it("maps locale 'ar' to Play language 'ar' and returns ok: true", async () => {
    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "ar",
      listing: AR_LISTING,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.language).toBe("ar");
  });

  it("accepts 'en-US' as an explicit locale and passes it through to Play", async () => {
    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en-US",
      listing: EN_LISTING,
    });
    if (result.ok) expect(result.language).toBe("en-US");
  });

  it("defaults to locale 'en' / Play language 'en-US' when locale is omitted", async () => {
    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      listing: EN_LISTING,
    });
    if (result.ok) expect(result.language).toBe("en-US");
  });

  it("sends requestBody with the correct shape to edits.listings.update", async () => {
    const { capturedPayload, fullUpdateArgs, result } = await runDryPublish({
      locale: "en",
      listing: EN_LISTING,
    });

    expect(result.ok).toBe(true);
    expect(capturedPayload).not.toBeNull();

    // requestBody fields match exactly what Play Console API expects
    expect(capturedPayload!.language).toBe("en-US");
    expect(capturedPayload!.title).toBe(EN_LISTING.title.trim());
    expect(capturedPayload!.shortDescription).toBe(EN_LISTING.shortDescription.trim());
    expect(capturedPayload!.fullDescription).toBe(EN_LISTING.fullDescription.trim());

    // Outer call params carry packageName, editId, and language
    expect(fullUpdateArgs!.packageName).toBe(PACKAGE_NAME);
    expect(fullUpdateArgs!.editId).toBe("mock-edit-id-001");
    expect(fullUpdateArgs!.language).toBe("en-US");
  });

  it("sends Arabic listing with language tag 'ar' inside requestBody", async () => {
    const { capturedPayload, result } = await runDryPublish({
      locale: "ar",
      listing: AR_LISTING,
    });

    expect(result.ok).toBe(true);
    expect(capturedPayload!.language).toBe("ar");
    expect(capturedPayload!.title).toBe(AR_LISTING.title.trim());
    expect(capturedPayload!.shortDescription).toBe(AR_LISTING.shortDescription.trim());
  });

  it("executes exactly 3 API calls: edits.insert → edits.listings.update → edits.commit", async () => {
    await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: EN_LISTING,
    });

    expect(mockEditsInsert).toHaveBeenCalledTimes(1);
    expect(mockEditsListingsUpdate).toHaveBeenCalledTimes(1);
    expect(mockEditsCommit).toHaveBeenCalledTimes(1);
  });

  it("calls edits.insert with the correct packageName", async () => {
    await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: EN_LISTING,
    });

    expect(mockEditsInsert).toHaveBeenCalledWith({ packageName: PACKAGE_NAME });
  });

  it("calls edits.commit with the packageName and editId from edits.insert", async () => {
    await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: EN_LISTING,
    });

    expect(mockEditsCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        packageName: PACKAGE_NAME,
        editId: "mock-edit-id-001",
      }),
    );
  });
});

// ── Multi-locale batch ────────────────────────────────────────────────────────

describe("publishListingToPlayStore — multi-locale batch", () => {
  const LOCALE_MATRIX: Array<{
    inputLocale: string;
    expectedPlayLanguage: string;
    listing: ListingFields;
  }> = [
    { inputLocale: "en",    expectedPlayLanguage: "en-US", listing: EN_LISTING },
    { inputLocale: "en-US", expectedPlayLanguage: "en-US", listing: EN_LISTING },
    { inputLocale: "en-GB", expectedPlayLanguage: "en-GB", listing: EN_LISTING },
    { inputLocale: "ar",    expectedPlayLanguage: "ar",    listing: AR_LISTING },
    { inputLocale: "fr",    expectedPlayLanguage: "fr",    listing: EN_LISTING },   // passthrough
    { inputLocale: "de-DE", expectedPlayLanguage: "de-DE", listing: EN_LISTING },  // passthrough
  ];

  it.each(LOCALE_MATRIX)(
    "locale '$inputLocale' → Play language '$expectedPlayLanguage'",
    async ({ inputLocale, expectedPlayLanguage, listing }) => {
      const result = await publishListingToPlayStore({
        workspaceId: WORKSPACE_ID,
        packageName: PACKAGE_NAME,
        locale: inputLocale,
        listing,
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.language).toBe(expectedPlayLanguage);
    },
  );

  it("publishes to en + ar concurrently and returns ok for each", async () => {
    const [enResult, arResult] = await Promise.all([
      publishListingToPlayStore({
        workspaceId: WORKSPACE_ID,
        packageName: PACKAGE_NAME,
        locale: "en",
        listing: EN_LISTING,
      }),
      publishListingToPlayStore({
        workspaceId: WORKSPACE_ID,
        packageName: PACKAGE_NAME,
        locale: "ar",
        listing: AR_LISTING,
      }),
    ]);

    expect(enResult.ok).toBe(true);
    expect(arResult.ok).toBe(true);
    if (enResult.ok) expect(enResult.language).toBe("en-US");
    if (arResult.ok) expect(arResult.language).toBe("ar");
  });
});

// ── Google API error classification ──────────────────────────────────────────

describe("publishListingToPlayStore — Google API error classification", () => {
  it("classifies 'invalid_grant' as auth_error", async () => {
    mockEditsInsert.mockRejectedValueOnce(
      new Error("invalid_grant: Token has been revoked."),
    );

    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: EN_LISTING,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("auth_error");
  });

  it("classifies '401 unauthorized' as auth_error", async () => {
    mockEditsInsert.mockRejectedValueOnce(
      new Error("401 unauthorized: Request had invalid authentication credentials."),
    );

    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: EN_LISTING,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("auth_error");
  });

  it("classifies 'Token has been expired' as auth_error", async () => {
    mockEditsInsert.mockRejectedValueOnce(
      new Error("Token has been expired or revoked."),
    );

    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: EN_LISTING,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("auth_error");
  });

  it("classifies '403 does not have permission' as auth_error with a role hint", async () => {
    mockEditsInsert.mockRejectedValueOnce(
      new Error("403: The caller does not have permission"),
    );

    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: EN_LISTING,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("auth_error");
      expect(result.message).toMatch(/permission|role/i);
    }
  });

  it("classifies a generic API error as api_error", async () => {
    mockEditsInsert.mockRejectedValueOnce(
      new Error("Something unexpected happened on the server."),
    );

    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: EN_LISTING,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("api_error");
  });

  it("returns api_error when edits.insert returns no editId", async () => {
    mockEditsInsert.mockResolvedValueOnce({ data: { id: null } });

    const result = await publishListingToPlayStore({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: EN_LISTING,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("api_error");
      expect(result.message).toMatch(/edit without an ID/i);
    }
  });
});

// ── Dry-run mode ──────────────────────────────────────────────────────────────

describe("Dry-run mode — capture and inspect API payloads without live calls", () => {
  it("captures the English listing requestBody and confirms its exact Play Console shape", async () => {
    const { capturedPayload, result } = await runDryPublish({
      workspaceId: WORKSPACE_ID,
      packageName: PACKAGE_NAME,
      locale: "en",
      listing: EN_LISTING,
    });

    expect(result.ok).toBe(true);

    // Shape: requestBody must have exactly these four fields
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload).toMatchObject({
      language: "en-US",
      title: expect.any(String),
      shortDescription: expect.any(String),
      fullDescription: expect.any(String),
    });

    // No extra/unexpected fields on requestBody
    const allowed = new Set(["language", "title", "shortDescription", "fullDescription"]);
    Object.keys(capturedPayload!).forEach((k) => {
      expect(allowed.has(k)).toBe(true);
    });
  });

  it("captures the Arabic listing requestBody and validates Arabic Unicode", async () => {
    const { capturedPayload, result } = await runDryPublish({
      locale: "ar",
      listing: AR_LISTING,
    });

    expect(result.ok).toBe(true);
    expect(capturedPayload!.language).toBe("ar");

    // Validate that title and shortDescription contain Arabic characters
    expect(capturedPayload!.title).toMatch(/[\u0600-\u06FF]/);
    expect(capturedPayload!.shortDescription).toMatch(/[\u0600-\u06FF]/);
  });

  it("dry-run confirms no live network call occurs (mock returns deterministic editId)", async () => {
    const { result } = await runDryPublish({ listing: EN_LISTING });
    expect(result.ok).toBe(true);
    // A live call would return a real Play Console UUID; the mock always returns this sentinel
    if (result.ok) expect(result.editId).toBe("mock-edit-id-001");
  });

  it("multi-locale dry-run produces distinct payloads for en + ar", async () => {
    // Run sequentially so capturedCalls doesn't interleave
    const enRun = await runDryPublish({ locale: "en", listing: EN_LISTING });
    const arRun = await runDryPublish({ locale: "ar", listing: AR_LISTING });

    expect(enRun.capturedPayload!.language).toBe("en-US");
    expect(arRun.capturedPayload!.language).toBe("ar");

    // Titles are different per locale
    expect(enRun.capturedPayload!.title).not.toBe(arRun.capturedPayload!.title);
  });
});
