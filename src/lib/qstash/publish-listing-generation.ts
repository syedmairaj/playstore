import "server-only";

import { Client } from "@upstash/qstash";

function resolveWorkerUrl(): string {
  const explicit = process.env.QSTASH_CALLBACK_URL?.trim();
  if (explicit) return `${explicit.replace(/\/$/, "")}/api/listings/worker`;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (!appUrl) {
    throw new Error("QSTASH_CALLBACK_URL or NEXT_PUBLIC_APP_URL is required to enqueue listing jobs");
  }

  const base = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;
  return `${base.replace(/\/$/, "")}/api/listings/worker`;
}

/**
 * Returns true when the worker URL points to the local dev server.
 *
 * This is the critical guard against a common mis-configuration: a developer
 * has QSTASH_TOKEN in their .env (copied from production) but
 * NEXT_PUBLIC_APP_URL is still "http://localhost:3000".  QStash is an
 * external service — it cannot reach localhost — so every job it tries to
 * deliver silently times out, leaving the job stuck in "pending" forever and
 * causing the client polling loop to spin until the timeout fires.
 *
 * When the URL is local we force the direct-invocation path regardless of
 * whether QSTASH_TOKEN is present.
 */
function isLocalWorkerUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

/**
 * Invoke the listing worker directly (local dev).
 * Awaited so the job row is terminal before the client polls status.
 */
async function invokeWorkerRequest(
  jobId: string,
  workerUrl: string,
  secret: string,
): Promise<void> {
  console.log(
    JSON.stringify({
      event: "listing_worker_dev_invoke_start",
      jobId,
      workerUrl,
    }),
  );

  const devRes = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Worker-Secret": secret,
    },
    body: JSON.stringify({ jobId }),
  });

  if (!devRes.ok) {
    const body = await devRes.text().catch(() => "(unreadable)");
    console.error(
      JSON.stringify({
        event: "listing_worker_dev_invoke_http_error",
        jobId,
        workerUrl,
        status: devRes.status,
        body: body.slice(0, 500),
      }),
    );
    throw new Error(
      `Local worker invoke failed (${devRes.status}): ${body.slice(0, 200)}`,
    );
  }

  console.log(
    JSON.stringify({
      event: "listing_worker_dev_invoke_success",
      jobId,
      workerUrl,
      status: devRes.status,
    }),
  );
}

/**
 * Re-enqueue an existing job (e.g. client retry while row is still pending).
 */
export async function republishListingGenerationWorker(jobId: string): Promise<void> {
  return publishListingGenerationWorker(jobId);
}

export async function publishListingGenerationWorker(jobId: string): Promise<void> {
  const token = process.env.QSTASH_TOKEN?.trim();
  const workerUrl = resolveWorkerUrl();

  // ── Direct invocation path (dev / localhost) ──────────────────────────────
  // Use direct HTTP invocation when:
  //  (a) QSTASH_TOKEN is absent — explicit local-dev setup
  //  (b) QSTASH_TOKEN is present but the worker URL is localhost — the developer
  //      copied production env vars but the app is still running locally.
  //      QStash cannot deliver to localhost; using it would leave every job
  //      stuck in "pending" with no error surface.
  if (!token || isLocalWorkerUrl(workerUrl)) {
    const devSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
    if (!devSecret) {
      throw new Error(
        "INTERNAL_WORKER_SECRET is required for local development. " +
          "Add it to .env.local (any random string, e.g. openssl rand -hex 32). " +
          "For production, configure QSTASH_TOKEN and a public NEXT_PUBLIC_APP_URL instead.",
      );
    }

    // Await in local dev so the job row reaches "completed" before the client
    // polls. Fire-and-forget left jobs stuck in "pending" when the worker was
    // slow or the first status poll raced the background fetch.
    await invokeWorkerRequest(jobId, workerUrl, devSecret);
    return;
  }

  // ── QStash path (production) ──────────────────────────────────────────────
  const client = new Client({ token });
  await client.publishJSON({
    url: workerUrl,
    body: { jobId },
    retries: 3,
  });
}
