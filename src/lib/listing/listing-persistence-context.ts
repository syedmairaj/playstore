import "server-only";

import { WorkspaceHandshakeError } from "@/lib/workspace/workspace-handshake";
import type { ListingModularGenerateBody } from "@/lib/validation/listing-modular-generate-body";

export type ListingPersistenceContext = {
  workspaceId: string;
  userId: string;
  appId: string | null;
};

export type ListingPersistenceResolveInput = {
  workspaceId: string;
  userId: string;
  appId?: string;
  body: Pick<ListingModularGenerateBody, "workspaceId" | "appId">;
  headerWorkspaceId?: string | null;
};

/**
 * Resolve session-scoped persistence keys from the authenticated orchestrator context
 * and validated request body (never hard-coded workspace ids).
 */
export function resolveListingPersistenceContext(
  ctx: ListingPersistenceResolveInput,
): ListingPersistenceContext {
  const workspaceId =
    ctx.workspaceId?.trim() || ctx.body.workspaceId?.trim() || "";
  const bodyWorkspaceId = ctx.body.workspaceId?.trim();

  if (!workspaceId) {
    throw new WorkspaceHandshakeError(
      "Workspace ID is missing from the request. Re-select your workspace in Keyword Tracker, then try again.",
      { field: "workspaceId" },
    );
  }

  if (bodyWorkspaceId && bodyWorkspaceId !== workspaceId) {
    throw new WorkspaceHandshakeError(
      "Workspace header does not match the request body. Refresh workspace context and try again.",
      { field: "workspaceId", body: bodyWorkspaceId, context: workspaceId },
    );
  }

  const headerId = ctx.headerWorkspaceId?.trim();
  if (headerId && headerId !== workspaceId) {
    throw new WorkspaceHandshakeError(
      "Workspace header does not match the request body. Refresh workspace context and try again.",
      { field: "workspaceId", header: headerId, body: workspaceId },
    );
  }

  if (!ctx.userId?.trim()) {
    throw new WorkspaceHandshakeError(
      "Authenticated user is required for listing persistence.",
      { field: "userId" },
    );
  }

  return {
    workspaceId,
    userId: ctx.userId,
    appId: ctx.appId ?? ctx.body.appId ?? null,
  };
}

export function listingPersistParamsFromBody(
  body: ListingModularGenerateBody,
  persistence: ListingPersistenceContext,
) {
  return {
    workspaceId: persistence.workspaceId,
    userId: persistence.userId,
    appId: persistence.appId,
    appName: body.appName,
    category: body.category,
    targetKeywords: body.targetKeywords,
    appFeatures: body.appFeatures,
    toneStyle: body.toneStyle,
  };
}
