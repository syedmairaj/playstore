/**
 * Persist the workspace monthly credit cap and evaluate the 80% budget alert.
 */
export async function updateBudgetCap(
  workspaceId: string,
  limit: number | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const body =
    limit == null || limit <= 0
      ? { monthly_credit_cap: null }
      : { monthly_credit_cap: Math.floor(limit) };

  const res = await fetch(`/api/workspaces/${workspaceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    ok: boolean;
    error?: { message: string };
  };

  if (!json.ok) {
    return { ok: false, message: json.error?.message ?? "Failed to save credit cap" };
  }

  return { ok: true };
}
