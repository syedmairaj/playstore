"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { OnboardingState } from "@/lib/onboarding-state";

type InitialWs = {
  id: string;
  name: string;
  onboarding_state: unknown;
};

function stepFromState(state: unknown): number {
  if (!state || typeof state !== "object") return 1;
  const s = state as OnboardingState;
  if (s.completed === true) return 7;
  if (s.step === 3) return 3;
  if (s.step === 4) return 4;
  if (s.step === 5) return 5;
  if (s.step === 2) return 2;
  return 1;
}

const keywordIdeas = [
  "best habit tracker",
  "daily planner app",
  "focus timer",
  "sleep sounds",
  "water reminder",
];

export function OnboardingWizard({
  initialWorkspace,
}: {
  initialWorkspace: InitialWs | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(() =>
    initialWorkspace ? stepFromState(initialWorkspace.onboarding_state) : 1,
  );
  const [workspaceId] = useState<string | null>(initialWorkspace?.id ?? null);
  const [workspaceName, setWorkspaceName] = useState(initialWorkspace?.name ?? "");
  const [appId, setAppId] = useState<string | null>(null);
  const [appName, setAppName] = useState("");
  const [packageName, setPackageName] = useState("");
  const [playUrl, setPlayUrl] = useState("");
  const [countries, setCountries] = useState("US, GB, DE");
  const [kw1, setKw1] = useState("");
  const [kw2, setKw2] = useState("");
  const [kw3, setKw3] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirstApp = useCallback(async (wid: string) => {
    const res = await fetch(`/api/workspaces/${wid}/apps`);
    const json = (await res.json()) as {
      ok: boolean;
      apps?: { id: string; name: string }[];
    };
    if (json.ok && json.apps?.[0]) {
      setAppId(json.apps[0].id);
      setAppName(json.apps[0].name === "Primary Google Play app" ? "" : json.apps[0].name);
    }
  }, []);

  useEffect(() => {
    if (workspaceId && step >= 3) {
      void loadFirstApp(workspaceId);
    }
  }, [workspaceId, step, loadFirstApp]);

  const asoScore = useMemo(() => {
    const k = [kw1, kw2, kw3].filter(Boolean).length;
    return Math.min(92, 58 + k * 8);
  }, [kw1, kw2, kw3]);

  async function patchWorkspaceState(wid: string, state: Record<string, unknown>) {
    const res = await fetch(`/api/workspaces/${wid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_state: state }),
    });
    const json = (await res.json()) as { ok: boolean; error?: { message: string } };
    if (!json.ok) throw new Error(json.error?.message ?? "Save failed");
  }

  async function createWorkspace() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName.trim() }),
      });
      const json = (await res.json()) as
        | { ok: true; workspace: { id: string } }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      router.replace(`/app/${json.workspace.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function saveApp() {
    if (!workspaceId || !appId) return;
    setError(null);
    setLoading(true);
    try {
      const target_countries = countries
        .split(/[,]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 40);
      const res = await fetch(`/api/workspaces/${workspaceId}/apps/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: appName.trim() || "My app",
          package_name: packageName.trim() || null,
          play_store_url: playUrl.trim() || null,
          target_countries: target_countries.length ? target_countries : ["US"],
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) throw new Error(json.error?.message ?? "Failed");
      await patchWorkspaceState(workspaceId, {
        completed: false,
        step: 4,
        version: 1,
      });
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function saveKeywords() {
    if (!workspaceId) return;
    setError(null);
    setLoading(true);
    try {
      const terms = [kw1, kw2, kw3].map((t) => t.trim()).filter(Boolean);
      for (const term of terms) {
        const res = await fetch(`/api/workspaces/${workspaceId}/keywords`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ term, market: "us" }),
        });
        const json = (await res.json()) as { ok: boolean; error?: { message: string } };
        if (!json.ok) throw new Error(json.error?.message ?? "Keyword failed");
      }
      await patchWorkspaceState(workspaceId, {
        completed: false,
        step: 5,
        version: 1,
      });
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function finish() {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/onboarding/complete`,
        { method: "POST" },
      );
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) throw new Error(json.error?.message ?? "Complete failed");
      setStep(6);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function goDashboard() {
    if (workspaceId) router.replace(`/app/${workspaceId}`);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:py-14">
      <div className="mb-8 flex justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            className={`h-1.5 w-8 rounded-full ${
              step >= n ? "bg-[#22C55E]" : "bg-white/15"
            }`}
          />
        ))}
      </div>

      {error ? (
        <div
          className="mb-6 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {step === 1 ? (
        <section className="rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 shadow-lg shadow-black/30 backdrop-blur-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-white">
            Welcome to PlayStore
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            Let&apos;s set up your first workspace and app.
          </p>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="mt-8 w-full rounded-xl bg-[#22C55E] py-3 text-sm font-semibold text-white shadow-lg shadow-[#22C55E]/20 hover:bg-[#16a34a]"
          >
            Continue
          </button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 shadow-lg shadow-black/30 backdrop-blur-sm sm:p-8">
          <h2 className="text-xl font-semibold text-white">Create workspace</h2>
          <p className="mt-2 text-sm text-white/60">
            Workspaces let you manage multiple apps and teams.
          </p>
          <label className="mt-6 block text-sm font-medium text-white/90">
            Workspace name
          </label>
          <input
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#22C55E]/50 focus:ring-2 focus:ring-[#22C55E]/25"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="e.g. Northwind Mobile"
          />
          <p className="mt-4 text-xs text-white/45">
            Optional: invite teammates later from{" "}
            <span className="font-medium text-white/80">Settings → Team</span>.
          </p>
          <button
            type="button"
            disabled={loading || workspaceName.trim().length < 2}
            onClick={createWorkspace}
            className="mt-8 w-full rounded-xl bg-[#22C55E] py-3 text-sm font-semibold text-white shadow-lg shadow-[#22C55E]/20 hover:bg-[#16a34a] disabled:bg-white/15 disabled:text-white/40"
          >
            {loading ? "Creating…" : "Create workspace"}
          </button>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 shadow-lg shadow-black/30 backdrop-blur-sm sm:p-8">
          <h2 className="text-xl font-semibold text-white">Add first app</h2>
          <p className="mt-2 text-sm text-white/60">
            We&apos;ll start tracking your app&apos;s performance.
          </p>
          <label className="mt-6 block text-sm font-medium text-white/90">
            App name
          </label>
          <input
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/35"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="Shown in the Play Console"
          />
          <label className="mt-4 block text-sm font-medium text-white/90">
            Package name
          </label>
          <input
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 font-mono text-xs text-white placeholder:text-white/35"
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            placeholder="com.company.app"
          />
          <label className="mt-4 block text-sm font-medium text-white/90">
            Play Store URL (optional)
          </label>
          <input
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/35"
            value={playUrl}
            onChange={(e) => setPlayUrl(e.target.value)}
            placeholder="https://play.google.com/store/apps/..."
          />
          <label className="mt-4 block text-sm font-medium text-white/90">
            Target countries
          </label>
          <input
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/35"
            value={countries}
            onChange={(e) => setCountries(e.target.value)}
            placeholder="US, GB, DE"
          />
          <button
            type="button"
            disabled={loading}
            onClick={saveApp}
            className="mt-8 w-full rounded-xl bg-[#22C55E] py-3 text-sm font-semibold text-white shadow-lg shadow-[#22C55E]/20 hover:bg-[#16a34a] disabled:bg-white/15 disabled:text-white/40"
          >
            {loading ? "Saving…" : "Add app"}
          </button>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 shadow-lg shadow-black/30 backdrop-blur-sm sm:p-8">
          <h2 className="text-xl font-semibold text-white">
            Add your first keywords
          </h2>
          <p className="mt-2 text-sm text-white/60">
            Track up to 50 keywords on Starter. Quick ideas:
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {keywordIdeas.map((k) => (
              <li key={k}>
                <button
                  type="button"
                  className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-1 text-xs text-white/70 hover:border-[#22C55E]/40 hover:text-white"
                  onClick={() => {
                    if (!kw1) setKw1(k);
                    else if (!kw2) setKw2(k);
                    else if (!kw3) setKw3(k);
                  }}
                >
                  {k}
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-6 block text-sm font-medium text-white/90">
            Keyword 1
          </label>
          <input
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/35"
            value={kw1}
            onChange={(e) => setKw1(e.target.value)}
          />
          <label className="mt-4 block text-sm font-medium text-white/90">
            Keyword 2
          </label>
          <input
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/35"
            value={kw2}
            onChange={(e) => setKw2(e.target.value)}
          />
          <label className="mt-4 block text-sm font-medium text-white/90">
            Keyword 3
          </label>
          <input
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/35"
            value={kw3}
            onChange={(e) => setKw3(e.target.value)}
          />
          <button
            type="button"
            disabled={loading || ![kw1, kw2, kw3].some((x) => x.trim())}
            onClick={saveKeywords}
            className="mt-8 w-full rounded-xl bg-[#22C55E] py-3 text-sm font-semibold text-white shadow-lg shadow-[#22C55E]/20 hover:bg-[#16a34a] disabled:bg-white/15 disabled:text-white/40"
          >
            {loading ? "Saving…" : "Start tracking"}
          </button>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 shadow-lg shadow-black/30 backdrop-blur-sm sm:p-8">
          <h2 className="text-xl font-semibold text-white">First insight</h2>
          <p className="mt-2 text-sm text-white/60">
            Here&apos;s what we found about your app.
          </p>
          <div className="mt-6 rounded-xl border border-[#22C55E]/25 bg-[#22C55E]/10 p-5">
            <p className="text-xs font-medium uppercase text-[#22C55E]">
              Starter ASO score
            </p>
            <p className="mt-2 text-4xl font-semibold text-white">{asoScore}</p>
            <p className="mt-2 text-sm text-white/65">
              Based on your first keywords and listing signals. Add more snapshots to
              refine this over time.
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void finish()}
            className="mt-8 w-full rounded-xl bg-[#22C55E] py-3 text-sm font-semibold text-white shadow-lg shadow-[#22C55E]/20 hover:bg-[#16a34a] disabled:bg-white/15 disabled:text-white/40"
          >
            {loading ? "Finishing…" : "Explore dashboard"}
          </button>
        </section>
      ) : null}

      {step === 6 ? (
        <section className="rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 text-center shadow-lg shadow-black/30 backdrop-blur-sm sm:p-8">
          <h2 className="text-xl font-semibold text-white">You&apos;re all set!</h2>
          <p className="mt-3 text-sm text-white/60">
            Your first keyword data will appear in 24 hours as you add rank snapshots.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Link
              href={workspaceId ? `/app/${workspaceId}/listing-optimizer` : "#"}
              className="rounded-xl border border-white/15 bg-white/[0.04] py-2.5 text-sm font-medium text-white hover:bg-white/[0.08]"
            >
              Optimize listing
            </Link>
            <Link
              href={workspaceId ? `/app/${workspaceId}/keywords` : "#"}
              className="rounded-xl border border-white/15 bg-white/[0.04] py-2.5 text-sm font-medium text-white hover:bg-white/[0.08]"
            >
              Add keywords
            </Link>
            <Link
              href={workspaceId ? `/app/${workspaceId}/settings` : "#"}
              className="rounded-xl border border-white/15 bg-white/[0.04] py-2.5 text-sm font-medium text-white hover:bg-white/[0.08]"
            >
              Invite team
            </Link>
          </div>
          <button
            type="button"
            onClick={goDashboard}
            className="mt-8 w-full rounded-xl bg-[#22C55E] py-3 text-sm font-semibold text-white shadow-lg shadow-[#22C55E]/20 hover:bg-[#16a34a]"
          >
            Go to dashboard
          </button>
        </section>
      ) : null}
    </div>
  );
}
