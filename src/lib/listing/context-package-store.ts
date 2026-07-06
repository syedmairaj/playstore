import "server-only";

import { redis } from "@/lib/redis/redis-client";
import type { ContextPackageV1 } from "@/lib/listing/context-package.types";
import { CONTEXT_PACKAGE_TTL_SECONDS } from "@/lib/listing/context-package.types";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";

export function contextPackageRedisKey(args: {
  workspaceId: string;
  locale: OptimizationQueueLocale;
  appId?: string | null;
}): string {
  const appSegment = args.appId?.trim() || "_workspace";
  return `ctxpkg:v1:${args.workspaceId}:${args.locale}:${appSegment}`;
}

export async function writeContextPackage(pkg: ContextPackageV1): Promise<void> {
  const key = contextPackageRedisKey({
    workspaceId: pkg.workspaceId,
    locale: pkg.locale,
    appId: pkg.appId,
  });
  await redis.set(key, JSON.stringify(pkg), { ex: CONTEXT_PACKAGE_TTL_SECONDS });
}

export async function readContextPackage(args: {
  workspaceId: string;
  locale: OptimizationQueueLocale;
  appId?: string | null;
}): Promise<ContextPackageV1 | null> {
  const key = contextPackageRedisKey(args);
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ContextPackageV1;
    if (parsed?.version !== "1") return null;
    return parsed;
  } catch {
    return null;
  }
}
