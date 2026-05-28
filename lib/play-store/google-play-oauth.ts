import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { google } from "googleapis";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// ── Constants ────────────────────────────────────────────────────────────────

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const PROVIDER = "google_play";
const ALGO = "aes-256-gcm";

// ── Env helpers ──────────────────────────────────────────────────────────────

function assertEncryptionKey(): Buffer {
  const key = process.env.GOOGLE_OAUTH_ENCRYPTION_KEY;
  if (!key) throw new Error("GOOGLE_OAUTH_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error("GOOGLE_OAUTH_ENCRYPTION_KEY must be 64 hex chars (32 bytes / 256-bit)");
  }
  return buf;
}

function assertOAuthCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing one of: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

// ── Encryption / Decryption ──────────────────────────────────────────────────

export interface EncryptedToken {
  encrypted: string; // base64 ciphertext
  iv: string;        // base64 IV
  tag: string;       // base64 GCM auth tag
}

export function encryptToken(plaintext: string): EncryptedToken {
  const key = assertEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptToken(enc: EncryptedToken): string {
  const key = assertEncryptionKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(enc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(enc.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(enc.encrypted, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// ── OAuth2 Client Factory ────────────────────────────────────────────────────

export function createOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = assertOAuthCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function buildConsentUrl(state: string): string {
  const oauth2 = createOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    scope: [ANDROID_PUBLISHER_SCOPE],
    prompt: "consent",
    state,
  });
}

// ── Token Storage ────────────────────────────────────────────────────────────

export interface ConnectedAccount {
  id: string;
  workspaceId: string;
  provider: string;
  authorizedEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function saveRefreshToken(
  workspaceId: string,
  refreshToken: string,
  authorizedEmail: string | null,
): Promise<void> {
  const enc = encryptToken(refreshToken);
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("connected_accounts").upsert(
    {
      workspace_id: workspaceId,
      provider: PROVIDER,
      authorized_email: authorizedEmail,
      encrypted_refresh_token: enc.encrypted,
      encryption_iv: enc.iv,
      encryption_tag: enc.tag,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,provider" },
  );

  if (error) throw new Error(`Failed to save refresh token: ${error.message}`);
}

export async function getRefreshToken(workspaceId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("connected_accounts")
    .select("encrypted_refresh_token, encryption_iv, encryption_tag")
    .eq("workspace_id", workspaceId)
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch refresh token: ${error.message}`);
  if (!data) return null;

  return decryptToken({
    encrypted: data.encrypted_refresh_token,
    iv: data.encryption_iv,
    tag: data.encryption_tag,
  });
}

export async function getConnectedAccount(workspaceId: string): Promise<ConnectedAccount | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("connected_accounts")
    .select("id, workspace_id, provider, authorized_email, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch connected account: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    provider: data.provider,
    authorizedEmail: data.authorized_email,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function deleteConnectedAccount(workspaceId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("connected_accounts")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("provider", PROVIDER);

  if (error) throw new Error(`Failed to delete connected account: ${error.message}`);
}

// ── Access-token resolver ────────────────────────────────────────────────────

export async function getOAuth2ClientForWorkspace(
  workspaceId: string,
): Promise<InstanceType<typeof google.auth.OAuth2>> {
  const refreshToken = await getRefreshToken(workspaceId);
  if (!refreshToken) {
    throw new Error(
      `No Google Play account connected for workspace ${workspaceId}. ` +
        "Connect via Settings → Integrations → Connected Stores.",
    );
  }

  const oauth2 = createOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export async function getAccessTokenForWorkspace(workspaceId: string): Promise<string> {
  const oauth2 = await getOAuth2ClientForWorkspace(workspaceId);
  const { token } = await oauth2.getAccessToken();
  if (!token) throw new Error("Failed to obtain access token from refresh token");
  return token;
}
