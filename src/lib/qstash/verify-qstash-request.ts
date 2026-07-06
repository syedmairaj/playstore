import "server-only";

import { Receiver } from "@upstash/qstash";
import type { NextRequest } from "next/server";

export async function verifyQStashRequest(
  request: NextRequest,
  rawBody: string,
): Promise<boolean> {
  const internalSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  const headerSecret = request.headers.get("x-internal-worker-secret");
  if (internalSecret && headerSecret === internalSecret) {
    return true;
  }

  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY?.trim();
  const signature = request.headers.get("upstash-signature");

  if (!currentSigningKey || !nextSigningKey || !signature) {
    return false;
  }

  const receiver = new Receiver({
    currentSigningKey,
    nextSigningKey,
  });

  try {
    await receiver.verify({
      signature,
      body: rawBody,
    });
    return true;
  } catch {
    return false;
  }
}
