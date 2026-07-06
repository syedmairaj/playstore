/**
 * Standalone token decryptor — mirrors decryptToken() in
 * src/lib/play-store/google-play-oauth.ts exactly.
 *
 * Usage:
 *   GOOGLE_OAUTH_ENCRYPTION_KEY=<64-hex-chars> \
 *   node scripts/decrypt-token.mjs \
 *     --encrypted "<base64>" \
 *     --iv        "<base64>" \
 *     --tag       "<base64>"
 *
 * Or pass all values via env variables:
 *   ENCRYPTED_TOKEN=... IV=... TAG=... \
 *   GOOGLE_OAUTH_ENCRYPTION_KEY=... \
 *   node scripts/decrypt-token.mjs
 */

import { createDecipheriv } from "crypto";

// ── Argument parsing ────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const map = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    if (key) map[key] = args[i + 1] ?? "";
  }
  return map;
}

const argv = parseArgs();

const encryptedB64 = argv.encrypted ?? process.env.ENCRYPTED_TOKEN ?? "";
const ivB64        = argv.iv        ?? process.env.IV              ?? "";
const tagB64       = argv.tag       ?? process.env.TAG             ?? "";
const hexKey       = process.env.GOOGLE_OAUTH_ENCRYPTION_KEY       ?? "";

// ── Validation ───────────────────────────────────────────────────────────────

const errors = [];
if (!hexKey)        errors.push("  GOOGLE_OAUTH_ENCRYPTION_KEY env var is not set");
if (!encryptedB64)  errors.push("  --encrypted (or ENCRYPTED_TOKEN env var) is required");
if (!ivB64)         errors.push("  --iv (or IV env var) is required");
if (!tagB64)        errors.push("  --tag (or TAG env var) is required");

if (errors.length) {
  console.error("Missing required inputs:\n" + errors.join("\n"));
  process.exit(1);
}

const keyBuf = Buffer.from(hexKey, "hex");
if (keyBuf.length !== 32) {
  console.error(
    `Key length error: expected 32 bytes (64 hex chars), got ${keyBuf.length} bytes (${hexKey.length} chars).\n` +
    "Ensure GOOGLE_OAUTH_ENCRYPTION_KEY is a 64-character hex string — do NOT quote or add spaces.",
  );
  process.exit(1);
}

// ── Decrypt (mirrors decryptToken exactly) ───────────────────────────────────

try {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyBuf,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]);

  const plaintext = decrypted.toString("utf8");

  console.log("\n✅ Decryption successful\n");
  console.log("Plaintext:");
  console.log(plaintext);
  console.log("");
} catch (err) {
  console.error("\n❌ Decryption failed:", err.message);
  console.error(
    "\nCommon causes:\n" +
    "  • Wrong key — the ciphertext was encrypted with a different GOOGLE_OAUTH_ENCRYPTION_KEY\n" +
    "  • Truncated/corrupted base64 value (check for missing '=' padding)\n" +
    "  • Tag mismatch — ciphertext was tampered or fields are swapped\n",
  );
  process.exit(1);
}
