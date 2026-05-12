"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type AlertRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: string;
  read_at: string | null;
  created_at: string;
  keyword_id: string | null;
  meta: unknown;
};

export function AlertsPanel({
  workspaceId,
  initialAlerts,
}: {
  workspaceId: string;
  initialAlerts: AlertRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unreadIds = useMemo(
    () => initialAlerts.filter((a) => !a.read_at).map((a) => a.id),
    [initialAlerts],
  );

  async function markAllRead() {
    if (unreadIds.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/alerts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertIds: unreadIds }),
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not update alerts.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-600">
          {unreadIds.length} unread
        </p>
        <button
          type="button"
          disabled={busy || unreadIds.length === 0}
          onClick={markAllRead}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50 disabled:bg-neutral-100"
        >
          {busy ? "Updating…" : "Mark all read"}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {initialAlerts.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-600">
            No alerts yet. When a keyword rank slips meaningfully, we will post
            one here.
          </li>
        ) : (
          initialAlerts.map((a) => (
            <li
              key={a.id}
              className={`rounded-2xl border px-4 py-4 shadow-sm ${
                a.read_at
                  ? "border-neutral-100 bg-white"
                  : "border-indigo-100 bg-indigo-50/40"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {a.type.replace("_", " ")}
                  </p>
                  <h3 className="text-sm font-semibold text-neutral-900">
                    {a.title}
                  </h3>
                </div>
                <span className="text-xs text-neutral-500">
                  {new Date(a.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-700">{a.body}</p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
