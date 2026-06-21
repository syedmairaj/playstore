import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class WorkspaceHandshakeError extends Error {
  readonly code = "workspace_handshake_failed" as const;
  readonly refreshWorkspace = true;

  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WorkspaceHandshakeError";
  }
}

export type WorkspaceHandshakeInput = {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  /** Optional `X-Workspace-Id` request header — must match body when present. */
  headerWorkspaceId?: string | null;
};

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Workspace Handshake — verifies workspace id is present, valid, and linked to the caller
 * before any listing generation orchestration or external model call.
 */
export async function assertWorkspaceHandshake(
  input: WorkspaceHandshakeInput,
): Promise<{ workspaceId: string; role: string }> {
  const workspaceId = input.workspaceId?.trim();

  if (!workspaceId) {
    throw new WorkspaceHandshakeError(
      "Workspace ID is missing from the request. Re-select your workspace in Keyword Tracker, then try again.",
      { field: "workspaceId" },
    );
  }

  if (!isUuid(workspaceId)) {
    throw new WorkspaceHandshakeError(
      "Workspace ID is invalid. Refresh your workspace from Keyword Tracker and try again.",
      { field: "workspaceId", value: workspaceId },
    );
  }

  const headerId = input.headerWorkspaceId?.trim();
  if (headerId && headerId !== workspaceId) {
    throw new WorkspaceHandshakeError(
      "Workspace header does not match the request body. Refresh workspace context and try again.",
      { headerWorkspaceId: headerId, bodyWorkspaceId: workspaceId },
    );
  }

  const role = await getWorkspaceRole(input.supabase, workspaceId, input.userId);
  if (!role) {
    throw new WorkspaceHandshakeError(
      "This workspace is not linked to your session. Open Keyword Tracker, confirm the active workspace, then generate again.",
      { workspaceId },
    );
  }

  const { data: workspaceRow, error } = await input.supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error || !workspaceRow) {
    throw new WorkspaceHandshakeError(
      "Active workspace could not be loaded. Refresh workspace context from Keyword Tracker.",
      { workspaceId, lookupError: error?.message },
    );
  }

  return { workspaceId, role };
}
