/**
 * Google Play OAuth2 Authentication
 *
 * Handles service-account JWT signing and access-token exchange for all
 * Google Play / GCS API calls.
 *
 * ── How Google Service Account auth works ───────────────────────────────────
 *
 *  1. We load the service-account JSON from the GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
 *     environment variable (the full JSON key file, base64-encoded or raw).
 *
 *  2. We build a JWT signed with the private_key (RS256) claiming the requested
 *     OAuth2 scopes and send it to the token_uri to exchange for a short-lived
 *     (1-hour) Bearer access token.
 *
 *  3. The access token is cached in-process for 55 minutes so multiple API
 *     calls within the same Lambda/Edge invocation share one token fetch.
 *
 * ── Environment variables ────────────────────────────────────────────────────
 *
 *  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
 *    Full contents of the Google service account JSON key file.
 *    Can be raw JSON or base64-encoded JSON (auto-detected).
 *    The service account must have:
 *      • roles/storage.objectViewer on the GCS bucket
 *        (pubsite_prod_rev_{developerAccountId})
 *      • androidpublisher scope for future Publisher API calls
 *
 *  GOOGLE_PLAY_DEVELOPER_ACCOUNT_ID
 *    The numeric Play Console developer account ID.
 *    Found in Play Console URL: play.google.com/console/u/0/developers/{ID}
 *    Used to construct the GCS bucket name: pubsite_prod_rev_{ID}
 */

import "server-only";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServiceAccountCredentials = {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
};

export type GoogleAccessToken = {
  token: string;
  /** Unix timestamp (seconds) when this token expires. */
  expiresAt: number;
  scopes: string[];
};

// ─── Scopes ───────────────────────────────────────────────────────────────────

export const PLAY_SCOPES = {
  /** Read GCS objects (acquisition CSVs, stats). */
  GCS_READ: "https://www.googleapis.com/auth/devstorage.read_only",
  /** Android Publisher API (listings, reviews, edits). */
  ANDROID_PUBLISHER: "https://www.googleapis.com/auth/androidpublisher",
  /** Play Developer Reporting API (crash rates, ANRs). */
  PLAY_REPORTING: "https://www.googleapis.com/auth/playdeveloperreporting",
} as const;

// ─── In-process token cache ───────────────────────────────────────────────────
// Keyed by sorted scope string so different scope sets don't collide.
// Valid for 55 minutes (tokens last 60; 5-minute buffer guards clock skew).

const TOKEN_CACHE = new Map<string, GoogleAccessToken>();
const TOKEN_TTL_SECONDS = 55 * 60; // 55 minutes

function cacheKey(scopes: string[]): string {
  return [...scopes].sort().join(" ");
}

function isCachedTokenValid(token: GoogleAccessToken): boolean {
  return token.expiresAt > Math.floor(Date.now() / 1000) + 30; // 30-second grace
}

// ─── Credentials loader ───────────────────────────────────────────────────────

let _credentials: ServiceAccountCredentials | null | undefined = undefined;

/**
 * Loads and validates service-account credentials from the environment.
 * Supports both raw JSON and base64-encoded JSON.
 * Returns null when the env var is missing or malformed.
 */
export function loadServiceAccountCredentials(): ServiceAccountCredentials | null {
  if (_credentials !== undefined) return _credentials;

  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    _credentials = null;
    return null;
  }

  try {
    // Auto-detect base64 encoding.
    const json = raw.trimStart().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf-8");

    const parsed = JSON.parse(json) as Partial<ServiceAccountCredentials>;

    if (!parsed.client_email || !parsed.private_key || !parsed.token_uri) {
      console.error("[google-play-auth] Service account JSON is missing required fields.");
      _credentials = null;
      return null;
    }

    _credentials = parsed as ServiceAccountCredentials;
    return _credentials;
  } catch (err) {
    console.error("[google-play-auth] Failed to parse GOOGLE_PLAY_SERVICE_ACCOUNT_JSON:", err);
    _credentials = null;
    return null;
  }
}

/**
 * Returns true when all required environment variables are present and parseable.
 */
export function isGooglePlayConfigured(): boolean {
  return (
    loadServiceAccountCredentials() !== null &&
    !!process.env.GOOGLE_PLAY_DEVELOPER_ACCOUNT_ID
  );
}

export function getDeveloperAccountId(): string | null {
  return process.env.GOOGLE_PLAY_DEVELOPER_ACCOUNT_ID ?? null;
}

// ─── JWT signing (RS256) ──────────────────────────────────────────────────────

/**
 * Signs a JWT with RS256 using the service account's private key.
 * Uses Node.js built-in `crypto` — no external JWT library required.
 */
async function signJwtRs256(
  payload: Record<string, unknown>,
  privateKey: string,
): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };

  const toBase64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const headerB64 = toBase64url(header);
  const payloadB64 = toBase64url(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const { createSign } = await import("crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput, "utf8");
  const signature = signer.sign(privateKey, "base64url");

  return `${signingInput}.${signature}`;
}

// ─── Token exchange ───────────────────────────────────────────────────────────

/**
 * Exchanges a signed JWT for a Google access token.
 * Throws on network failure; returns null on auth rejection.
 */
async function exchangeJwtForToken(
  jwt: string,
  tokenUri: string,
): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth2:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error("[google-play-auth] Token exchange failed:", res.status, body);
    return null;
  }

  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type GetAccessTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not_configured" | "sign_failed" | "exchange_failed" };

/**
 * Returns a valid Google access token for the requested scopes.
 *
 * Checks the in-process cache first; only fetches a new token when the
 * cached one is missing or within 30 seconds of expiry.
 *
 * @param scopes  Array of OAuth2 scope URLs (use PLAY_SCOPES constants).
 */
export async function getGooglePlayAccessToken(
  scopes: string[],
): Promise<GetAccessTokenResult> {
  const key = cacheKey(scopes);
  const cached = TOKEN_CACHE.get(key);
  if (cached && isCachedTokenValid(cached)) {
    return { ok: true, token: cached.token };
  }

  const creds = loadServiceAccountCredentials();
  if (!creds) return { ok: false, reason: "not_configured" };

  const now = Math.floor(Date.now() / 1000);

  let jwt: string;
  try {
    jwt = await signJwtRs256(
      {
        iss: creds.client_email,
        scope: scopes.join(" "),
        aud: creds.token_uri,
        iat: now,
        exp: now + 3600,
      },
      creds.private_key,
    );
  } catch (err) {
    console.error("[google-play-auth] JWT signing failed:", err);
    return { ok: false, reason: "sign_failed" };
  }

  const tokenResponse = await exchangeJwtForToken(jwt, creds.token_uri);
  if (!tokenResponse) return { ok: false, reason: "exchange_failed" };

  const cachedToken: GoogleAccessToken = {
    token: tokenResponse.access_token,
    expiresAt: now + (tokenResponse.expires_in ?? 3600),
    scopes,
  };

  TOKEN_CACHE.set(key, cachedToken);
  return { ok: true, token: tokenResponse.access_token };
}

/**
 * Clears the in-process token cache.
 * Useful in tests or when credentials are rotated mid-process.
 */
export function clearTokenCache(): void {
  TOKEN_CACHE.clear();
  _credentials = undefined;
}
