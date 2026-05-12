"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { KeywordWithRanks } from "@/lib/keywords/load-workspace-keywords";

type Props = {
  workspaceId: string;
  initialKeywords: KeywordWithRanks[];
};

export function KeywordsPanel({ workspaceId, initialKeywords }: Props) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => initialKeywords, [initialKeywords]);

  async function addKeyword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAdding(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: term.trim(), market: "us" }),
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      setTerm("");
      router.refresh();
    } catch {
      setError("Could not add keyword.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-900">Add keyword</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Track a Google Play search term. Record rank snapshots to see trends
          (lower rank # is better).
        </p>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={addKeyword}>
          <input
            className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
            placeholder="e.g. meditation timer"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <button
            type="submit"
            disabled={adding || term.trim().length < 2}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-neutral-300"
          >
            {adding ? "Adding…" : "Add keyword"}
          </button>
        </form>
        {error ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 px-4 py-3 sm:px-6">
          <h2 className="text-sm font-semibold text-neutral-900">
            Tracked terms
          </h2>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-neutral-600 sm:px-6">
            No keywords yet. Add a few terms you care about on the Play Store.
          </p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {rows.map((k) => (
              <KeywordRow key={k.id} workspaceId={workspaceId} keyword={k} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function KeywordRow({
  workspaceId,
  keyword,
}: {
  workspaceId: string;
  keyword: KeywordWithRanks;
}) {
  const router = useRouter();
  const [rankInput, setRankInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function saveRank(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const n = Number.parseInt(rankInput, 10);
    if (!Number.isFinite(n) || n < 1) {
      setErr("Enter a positive rank (1 = best).");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/keywords/${keyword.id}/ranks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rank: n, source: "manual" }),
        },
      );
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        setErr(json.error.message);
        return;
      }
      setRankInput("");
      router.refresh();
    } catch {
      setErr("Could not save snapshot.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="truncate font-medium text-neutral-900">{keyword.term}</p>
          <span className="text-xs text-neutral-500">
            {keyword.market.toUpperCase()} · {keyword.locale}
          </span>
        </div>
        <p className="text-xs text-neutral-500">
          Latest:{" "}
          {keyword.latest?.rank != null ? `#${keyword.latest.rank}` : "—"}{" "}
          {keyword.latest?.captured_at
            ? `· ${new Date(keyword.latest.captured_at).toLocaleString()}`
            : null}
        </p>
        <RankSparkline ranks={keyword.ranks} />
      </div>
      <form
        className="flex w-full shrink-0 flex-col gap-2 sm:w-48"
        onSubmit={saveRank}
      >
        <label className="text-xs font-medium text-neutral-600">
          Record rank snapshot
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            max={500}
            placeholder="#"
            className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm"
            value={rankInput}
            onChange={(e) => setRankInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-300"
          >
            {saving ? "…" : "Save"}
          </button>
        </div>
        {err ? (
          <p className="text-xs text-red-600" role="alert">
            {err}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function RankSparkline({
  ranks,
}: {
  ranks: { rank: number | null; captured_at: string }[];
}) {
  const points = ranks
    .map((r) => r.rank)
    .filter((r): r is number => r != null)
    .slice(-16);
  if (points.length === 0) {
    return (
      <p className="text-xs text-neutral-400">Add snapshots to see a trend.</p>
    );
  }
  const maxR = Math.max(...points);
  const minR = Math.min(...points);
  const span = Math.max(1, maxR - minR);
  return (
    <div className="flex h-10 max-w-xs items-end gap-0.5">
      {points.map((r, i) => {
        const h = 8 + (32 * (maxR - r)) / span;
        return (
          <div
            key={`${i}-${r}`}
            title={`#${r}`}
            className="w-1.5 rounded-sm bg-indigo-500/80"
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}
