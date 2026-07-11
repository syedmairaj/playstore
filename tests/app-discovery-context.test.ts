import { describe, expect, it } from "vitest";
import {
  discoveryContextMatchesWorkspaceApp,
  hasConfiguredDiscoveryInputs,
  looksLikeGeneratedKeywordBlob,
  looksLikeInstantDraftHeuristicListing,
  shouldPurgeOrphanedListingPreview,
  shouldRestoreDiscoveryInputs,
  shouldRestoreFinalListingCache,
  shouldRestoreListingOutputFromHydration,
} from "@/lib/client/app-discovery-context";
import { INSTANT_DRAFT_PROMPT_VERSION } from "@/lib/listing/listing-export-unlock";

describe("discoveryContextMatchesWorkspaceApp", () => {
  it("accepts matching app names", () => {
    expect(discoveryContextMatchesWorkspaceApp("snap", "snap")).toBe(true);
    expect(discoveryContextMatchesWorkspaceApp("Salt Sugar", "salt sugar")).toBe(true);
  });

  it("rejects cross-app saved names", () => {
    expect(discoveryContextMatchesWorkspaceApp("Salt Sugar", "snap")).toBe(false);
    expect(discoveryContextMatchesWorkspaceApp("Blood Pressure", "snap")).toBe(false);
  });

  it("allows empty saved names (legacy rows)", () => {
    expect(discoveryContextMatchesWorkspaceApp("", "snap")).toBe(true);
    expect(discoveryContextMatchesWorkspaceApp(null, "snap")).toBe(true);
  });
});

describe("shouldRestoreDiscoveryInputs", () => {
  const snapSocial = {
    workspaceAppDisplayName: "snap",
    workspaceAppCategory: "Social",
  };

  it("rejects instant-draft preview rows", () => {
    expect(
      shouldRestoreDiscoveryInputs({
        ...snapSocial,
        savedAppName: "snap",
        savedCategory: "Social",
        keywordsText: "blood pressure tracker",
        promptVersion: INSTANT_DRAFT_PROMPT_VERSION,
      }),
    ).toBe(false);
  });

  it("rejects AI keyword suggestion blobs with category tags", () => {
    expect(
      shouldRestoreDiscoveryInputs({
        ...snapSocial,
        savedAppName: "snap",
        savedCategory: "Social",
        keywordsText:
          "blood pressure tracker, [competitive] salt sugar tracker",
      }),
    ).toBe(false);
  });

  it("allows user-configured paid generation rows", () => {
    expect(
      shouldRestoreDiscoveryInputs({
        ...snapSocial,
        savedAppName: "snap",
        savedCategory: "Social",
        keywordsText: "photo sharing, stories, friends",
        promptVersion: "listing-full-v2",
        publicationUnlocked: true,
      }),
    ).toBe(true);
  });
});

describe("looksLikeGeneratedKeywordBlob", () => {
  it("detects competitive/intent/gap tags", () => {
    expect(looksLikeGeneratedKeywordBlob("[competitive] diet app")).toBe(true);
    expect(looksLikeGeneratedKeywordBlob("photo editor, stories")).toBe(false);
  });
});

describe("hasConfiguredDiscoveryInputs", () => {
  it("requires keywords or features", () => {
    expect(hasConfiguredDiscoveryInputs("", "")).toBe(false);
    expect(hasConfiguredDiscoveryInputs("stories", "")).toBe(true);
    expect(hasConfiguredDiscoveryInputs("", "share photos")).toBe(true);
  });
});

describe("looksLikeInstantDraftHeuristicListing", () => {
  it("detects polluted snap social instant-draft copy", () => {
    expect(
      looksLikeInstantDraftHeuristicListing(
        {
          title: "snap: blood pressure tracker",
          shortDescription:
            "Social essentials in one app — practical everyday use.",
          fullDescription:
            "snap: blood pressure tracker helps you get more from Social.",
        },
        "snap",
        "Social",
      ),
    ).toBe(true);
  });

  it("does not flag unrelated paid-style copy", () => {
    expect(
      looksLikeInstantDraftHeuristicListing(
        {
          title: "snap — share moments",
          shortDescription: "Connect with friends and share your day.",
          fullDescription: "snap is your social hub for photos and chat.",
        },
        "snap",
        "Social",
      ),
    ).toBe(false);
  });
});

describe("shouldRestoreListingOutputFromHydration", () => {
  const snapSocial = {
    savedAppName: "snap",
    savedCategory: "Social",
    workspaceAppDisplayName: "snap",
    workspaceAppCategory: "Social",
  };

  it("blocks instant-draft listing output on refresh", () => {
    expect(
      shouldRestoreListingOutputFromHydration({
        ...snapSocial,
        promptVersion: INSTANT_DRAFT_PROMPT_VERSION,
        publicationUnlocked: false,
      }),
    ).toBe(false);
  });

  it("blocks preview output when discovery inputs are empty", () => {
    expect(
      shouldRestoreListingOutputFromHydration({
        ...snapSocial,
        keywordsText: "",
        appFeatures: "",
        promptVersion: "listing-full-v2",
        publicationUnlocked: false,
      }),
    ).toBe(false);
  });

  it("allows paid unlock output without discovery", () => {
    expect(
      shouldRestoreListingOutputFromHydration({
        ...snapSocial,
        keywordsText: "",
        appFeatures: "",
        publicationUnlocked: true,
      }),
    ).toBe(true);
  });

  it("allows preview output when discovery is configured", () => {
    expect(
      shouldRestoreListingOutputFromHydration({
        ...snapSocial,
        keywordsText: "photo sharing, stories",
        appFeatures: "Share photos with friends",
        promptVersion: "listing-full-v2",
        publicationUnlocked: false,
      }),
    ).toBe(true);
  });
});

describe("shouldRestoreFinalListingCache", () => {
  const pollutedCache = {
    title: "snap: blood pressure tracker",
    shortDescription: "Social essentials in one app — practical everyday use.",
    longDescription:
      "snap: blood pressure tracker helps you get more from Social.",
    keywordSuggestions: [],
    ctaSuggestions: [],
    generatedAt: new Date().toISOString(),
    publicationUnlocked: false,
  };

  it("rejects preview cache without discovery", () => {
    expect(
      shouldRestoreFinalListingCache({
        cache: pollutedCache,
        keywordsText: "",
        appFeatures: "",
        workspaceAppDisplayName: "snap",
        workspaceAppCategory: "Social",
      }),
    ).toBe(false);
  });

  it("rejects heuristic instant-draft cache even with discovery", () => {
    expect(
      shouldRestoreFinalListingCache({
        cache: pollutedCache,
        keywordsText: "blood pressure tracker",
        appFeatures: "track health",
        workspaceAppDisplayName: "snap",
        workspaceAppCategory: "Social",
      }),
    ).toBe(false);
  });

  it("allows paid unlock cache without discovery", () => {
    expect(
      shouldRestoreFinalListingCache({
        cache: { ...pollutedCache, publicationUnlocked: true },
        keywordsText: "",
        appFeatures: "",
        workspaceAppDisplayName: "snap",
        workspaceAppCategory: "Social",
      }),
    ).toBe(true);
  });
});

describe("shouldPurgeOrphanedListingPreview", () => {
  it("purges preview copy when discovery is empty", () => {
    expect(
      shouldPurgeOrphanedListingPreview({
        keywordsText: "",
        appFeatures: "",
        title: "snap: blood pressure tracker",
        shortDescription: "Social essentials in one app — practical everyday use.",
      }),
    ).toBe(true);
  });

  it("keeps paid unlock rows", () => {
    expect(
      shouldPurgeOrphanedListingPreview({
        keywordsText: "",
        appFeatures: "",
        publicationUnlocked: true,
        title: "snap: blood pressure tracker",
      }),
    ).toBe(false);
  });
});
