"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useUser, UserButton, Show } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type TraceEvent = { ts: string; type: string; text: string };

function timeAgo(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ms).toLocaleDateString();
}

function cleanTraceText(t: string) {
  // LLM tool-call events streamed from opencode
  const tool = t.match(/(FAILED — )?solari_(browser_\w+)\s*(\{.*)?$/);
  if (tool) {
    const fail = tool[1] ? "✗ " : "";
    const name = tool[2];
    let detail = "";
    try { detail = tool[3] ? String(JSON.parse(tool[3]).url ?? JSON.parse(tool[3]).selector ?? JSON.parse(tool[3]).key ?? JSON.parse(tool[3]).profileId ?? "") : ""; } catch {}
    const shortUrl = detail.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60);
    const verb: Record<string, string> = {
      solari_browser_create: "Opening browser" + (detail ? " with profile " + detail.slice(0, 20) : " (no profile)"),
      solari_browser_navigate: "Opening " + (shortUrl || "page"),
      solari_browser_read_page: "Reading page",
      solari_browser_screenshot: "Taking screenshot",
      solari_browser_click: "Clicking " + (shortUrl || "element"),
      solari_browser_type: "Typing…",
      solari_browser_key: "Pressing " + (detail || "key"),
      solari_browser_evaluate: "Running page script",
      solari_browser_close: "Closing browser",
      solari_browser_replay_url: "Fetching replay",
    };
    return fail + (verb[name] ?? name);
  }
  // hide raw JSON noise
  if (t.includes('"needed"') && t.includes('"allActive"')) {
    const m = t.match(/"needed":\s*\{([^}]+)\}/);
    if (m) {
      const hasGmail = t.includes('"gmail"');
      const hasLinkedin = t.includes('"linkedin"');
      const parts = [];
      if (hasGmail) parts.push("Gmail profile");
      if (hasLinkedin) parts.push("LinkedIn profile");
      if (parts.length) return `Profile attached — ${parts.join(", ")} ready`;
    }
    return t.slice(0, 90) + (t.length > 90 ? "…" : "");
  }
  if (t.startsWith("Markdown slice")) {
    const bytes = t.match(/\d+ bytes/)?.[0] ?? "";
    const hasProfile = t.includes("gmail") ? " • Gmail profile" : "";
    return `Context loaded ${bytes ? `(${bytes})` : ""}${hasProfile}`;
  }
  if (t.length > 220) return t.slice(0, 220) + "…";
  return t;
}

function TraceDot({ type, active }: { type: string; active?: boolean }) {
  const u = type.toUpperCase();
  const base = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ring-4 ring-[#fafaf9]";
  if (u.includes("THOUGHT")) return <div className={`${base} border border-stone-200 bg-stone-100 text-stone-500`}>⋯</div>;
  if (u.includes("KNOWLEDGE")) return <div className={`${base} border border-stone-200 bg-stone-100 text-stone-700`}>◎</div>;
  if (u.includes("ACTION")) return <div className={`${base} ${active ? "border border-emerald-700 bg-emerald-700 text-white" : "border border-stone-200 bg-white text-emerald-700"}`}>▸</div>;
  return <div className={`${base} border border-stone-200 bg-stone-100 text-stone-500`}>•</div>;
}

function statusMeta(s: string) {
  if (s === "completed") return { label: "Completed", dot: "bg-emerald-600", pill: "bg-stone-100 text-stone-600 border-stone-200" };
  if (s === "running") return { label: "Running", dot: "bg-amber-600 animate-pulse", pill: "bg-stone-100 text-stone-700 border-stone-200" };
  if (s === "failed") return { label: "Failed", dot: "bg-red-500/80", pill: "bg-stone-100 text-stone-600 border-stone-200" };
  if (s === "paused") return { label: "Needs action", dot: "bg-sky-600", pill: "bg-stone-100 text-stone-700 border-stone-200" };
  return { label: s, dot: "bg-stone-400", pill: "bg-stone-100 text-stone-600 border-stone-200" };
}

const EXAMPLES = [
  { label: "Check my inbox", prompt: "open Gmail, check my inbox, and summarize anything urgent" },
  { label: "Find a GitHub email", prompt: "find the email on this GitHub profile: https://github.com/shreyanshvishwakarma" },
  { label: "LinkedIn outreach", prompt: "open LinkedIn and draft a short outreach message to a hiring manager" },
];

function SessionCard({ s, isSel, onClick }: { s: { _id: string; status: string; prompt: string; trace?: TraceEvent[]; browserSessionId?: string; replayUrl?: string; createdAt: number }; isSel: boolean; onClick: () => void }) {
  const meta = statusMeta(s.status);
  const isRunning = s.status === "running";
  return (
    <button
      onClick={onClick}
      className={`group w-full rounded-xl border bg-white p-3.5 text-left transition ${isSel ? "border-stone-900 shadow-sm ring-1 ring-stone-900" : "border-stone-200 hover:border-stone-300 hover:bg-stone-50"} ${isRunning ? "border-amber-300" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
        <span className={`text-xs font-semibold ${isRunning ? "text-amber-700" : isSel ? "text-stone-900" : "text-stone-700"}`}>{meta.label}</span>
        <span className="ml-auto text-xs text-stone-400">{timeAgo(s.createdAt)}</span>
      </div>
      <div className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-stone-900">{s.prompt}</div>
      <div className="mt-2 flex items-center gap-2 text-xs text-stone-500">
        <span className="inline-flex items-center gap-1.5"><span className="tnum rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px]">{s.trace?.length ?? 0} steps</span>{s.browserSessionId ? <span className="text-emerald-700">• browser</span> : <span className="text-stone-400">• no browser</span>}{s.replayUrl ? <span className="text-sky-700">• replay</span> : null}</span>
      </div>
    </button>
  );
}

function PromptForm({ compact, input, setInput, runState, runError, onSubmit, disabled }: { compact?: boolean; input: string; setInput: (v: string) => void; runState: "idle" | "running"; runError: string | null; onSubmit: (e: React.FormEvent) => void; disabled?: boolean }) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  // auto-grow: the box expands with the text instead of clipping it
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);
  const busy = runState === "running" || disabled;
  return (
    <form onSubmit={onSubmit}>
      <div className={`flex items-end gap-2 rounded-xl border border-stone-200 bg-white transition focus-within:border-stone-900 focus-within:ring-2 focus-within:ring-stone-900/10 ${compact ? "px-3 py-2" : "px-4 py-3 shadow-sm"}`}>
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!busy && input.trim()) e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          placeholder={compact ? "Send a follow-up task…" : "Ask: open Gmail and send hello…"}
          className="max-h-[200px] min-h-[24px] min-w-0 flex-1 resize-none bg-transparent py-1 text-sm leading-6 text-stone-900 placeholder:text-stone-400 focus:outline-none"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()} className="shrink-0 rounded-lg bg-stone-900 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:opacity-40">
          {runState === "running" ? "…" : "Run"}
        </button>
      </div>
      <div className={`flex items-center justify-between text-xs text-stone-500 ${compact ? "mt-1.5 px-1" : "mt-2 px-1"}`}>
        <span className="tnum">{input.length}/5000 <span className="hidden sm:inline">• Enter to run, Shift+Enter for a new line</span></span>
        <Link href="/settings" className="font-medium text-stone-600 transition hover:text-stone-900">Profiles →</Link>
      </div>
      {runError && <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{runError}</div>}
    </form>
  );
}

export default function DashboardPage() {
  const { user } = useUser();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const profile = useQuery(api.profiles.getMyProfileWithUrls, isAuthenticated ? {} : "skip");
  const sessions = useQuery(api.sandboxSessions.listMine, isAuthenticated ? {} : "skip");

  const [input, setInput] = useState("");
  const [runState, setRunState] = useState<"idle" | "running">("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(true);
  const [showTech, setShowTech] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [pending, setPending] = useState<{ prompt: string } | null>(null);

  async function handleStop() {
    if (!selected || stopping) return;
    setStopping(true);
    try {
      const res = await fetch("/api/sessions/kill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: selected._id }) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setRunError(d.error ?? "We couldn't stop that session");
      }
    } finally {
      setStopping(false);
    }
  }

  const selected = useMemo(() => {
    if (!sessions?.length) return null;
    if (selectedId) return sessions.find((s) => s._id === selectedId) ?? sessions[0];
    return sessions[0];
  }, [sessions, selectedId]);

  const traceScrollRef = useRef<HTMLDivElement>(null);
  const traceEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (traceScrollRef.current && traceEndRef.current) {
      traceEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const c = traceScrollRef.current;
      if (c.scrollHeight > c.clientHeight) c.scrollTop = c.scrollHeight;
    }
  }, [selected?.trace]);

  async function handlePromptSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setRunError(null);
    setRunState("running");
    // optimistic: jump straight to an "accepted" view while the sandbox boots
    setPending({ prompt: text });
    setComposing(false);
    setSelectedId(null);
    setInput("");
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSelectedId(data.sessionId);
      setPending(null);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed");
      setPending(null);
      setInput(text); // restore the text so nothing is lost
      setComposing(true);
    } finally {
      setRunState("idle");
    }
  }

  function startNew() {
    setComposing(true);
    setSelectedId(null);
    setRunError(null);
  }

  if (isLoading)
    return (
      <div className="flex h-screen gap-4 bg-[#fafaf9] p-4">
        <div className="hidden w-[280px] animate-pulse rounded-2xl bg-stone-200/60 md:block" />
        <div className="flex-1 animate-pulse rounded-2xl bg-stone-200/40" />
      </div>
    );
  if (!isAuthenticated)
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 border-b bg-white"><div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6"><Link href="/" className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-xs font-bold text-white">D.</div><span className="text-sm font-bold">Doppel</span></Link><Show when="signed-out"><Link href="/sign-in" className="rounded-full bg-stone-900 px-5 py-2 text-sm font-bold text-white">Sign in</Link></Show></div></header>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center"><h1 className="text-2xl font-bold">Sign in to use Doppel</h1><Show when="signed-out"><Link href="/sign-in" className="mt-6 inline-flex rounded-full bg-stone-900 px-6 py-3 text-sm font-bold text-white">Sign in →</Link></Show></div>
      </div>
    );
  if (profile === null) {
    return (
      <div className="min-h-screen grid place-items-center bg-white p-6">
        <div className="text-center"><p className="text-sm font-medium">Complete onboarding to get your markdown context</p><Link href="/onboarding" className="mt-3 inline-flex rounded-full bg-stone-900 px-6 py-2.5 text-sm font-bold text-white">Go to onboarding →</Link></div>
      </div>
    );
  }

  const runningCount = (sessions ?? []).filter((s) => s.status === "running").length;
  const selectedMeta = selected ? statusMeta(selected.status) : null;
  const showPending = pending !== null;
  const showComposer = !pending && (!selected || composing);
  const showSession = !pending && !!selected && !composing;

  return (
    <div className="flex h-screen overflow-hidden bg-[#fafaf9]">
      {/* ============ SIDEBAR ============ */}
      <aside className="hidden w-[280px] shrink-0 flex-col border-r border-stone-200 bg-white md:flex">
        {/* top: brand + new session */}
        <div className="px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-xs font-bold text-white">D.</div>
              <span className="text-sm font-bold tracking-tight text-stone-900">Doppel</span>
            </Link>
            {runningCount > 0 && (
              <span className="tnum inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-600" />{runningCount} running
              </span>
            )}
          </div>
          <button onClick={startNew} className="mt-3 flex w-full items-center justify-center rounded-xl border border-stone-900 bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98]">
            + New Session
          </button>
        </div>

        {/* middle: session history */}
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-2">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-medium tracking-wide text-stone-400">Sessions</span>
            <span className="tnum rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-600">{(sessions ?? []).length}</span>
          </div>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-auto pb-3">
            {(sessions ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/60 p-5 text-center">
                <p className="text-xs leading-5 text-stone-500">No sessions yet. Run your first task — Doppel opens a real browser and you watch the replay.</p>
              </div>
            ) : (
              (sessions ?? []).map((s) => (
                <SessionCard key={s._id} s={s} isSel={!!selected && selected._id === s._id && !composing} onClick={() => { setSelectedId(s._id); setComposing(false); }} />
              ))
            )}
          </div>
        </div>

        {/* bottom: user footer */}
        <div className="flex items-center gap-2.5 border-t border-stone-200 p-3">
          <UserButton />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-stone-900">{user?.fullName ?? "You"}</div>
            <div className="truncate text-[11px] text-stone-500">{user?.primaryEmailAddress?.emailAddress}</div>
          </div>
          <Link href="/settings" className="shrink-0 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 active:scale-[0.98]">
            Settings
          </Link>
        </div>
      </aside>

      {/* ============ MAIN WORKSPACE ============ */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* mobile top bar */}
        <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-xs font-bold text-white">D.</div>
            <span className="text-sm font-bold tracking-tight text-stone-900">Doppel</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/settings" className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700">Settings</Link>
            <UserButton />
          </div>
        </div>

        {showPending && pending ? (
          /* ---------- PENDING: request accepted, sandbox booting ---------- */
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="mx-auto w-full max-w-[850px] px-4 pt-6 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-600" />Starting
                  </span>
                  <span className="text-xs text-stone-500">just now</span>
                </div>
                <div className="mt-3 rounded-xl border border-stone-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">✓</span>
                    <span className="text-sm font-semibold">Task accepted</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-stone-700">Booting your sandbox and attaching your saved logins. You'll see browser actions stream here within a few seconds.</p>
                </div>
                <h1 className="mt-4 max-w-[80ch] text-[19px] font-semibold leading-[1.5] tracking-[-0.01em] text-stone-900 [text-wrap:balance]">{pending.prompt}</h1>
                <div className="mt-8">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-medium tracking-wide text-stone-400">Timeline</h2>
                  </div>
                  <div className="mt-3 space-y-3 rounded-xl border border-stone-200 bg-white p-4">
                    <div className="h-3 w-2/3 animate-pulse rounded-full bg-stone-200" />
                    <div className="h-3 w-1/2 animate-pulse rounded-full bg-stone-200/80" />
                    <div className="h-3 w-3/5 animate-pulse rounded-full bg-stone-200/60" />
                  </div>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 border-t border-stone-200 bg-[#fafaf9]/95 px-4 py-3 backdrop-blur sm:px-6">
              <div className="mx-auto w-full max-w-[850px]">
                <PromptForm compact input={input} setInput={setInput} runState="running" runError={null} onSubmit={(e) => e.preventDefault()} disabled />
              </div>
            </div>
          </div>
        ) : showComposer ? (
          /* ---------- STATE A: new session ---------- */
          <div className="flex flex-1 flex-col items-center justify-center overflow-auto px-6 pb-24">
            <div className="w-full max-w-[720px]">
              <h1 className="text-center text-[28px] font-semibold leading-tight tracking-[-0.02em] text-stone-900 [text-wrap:balance] sm:text-[32px]">
                What task should Doppel automate?
              </h1>
              <p className="mt-2 text-center text-sm leading-6 text-stone-500">
                It opens a real browser with your saved logins — you watch the replay.
              </p>
              <div className="mt-8">
                <PromptForm input={input} setInput={setInput} runState={runState} runError={runError} onSubmit={handlePromptSubmit} />
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((ex) => (
                  <button key={ex.label} onClick={() => setInput(ex.prompt)} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 active:scale-[0.98]">
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : showSession && selected ? (
          /* ---------- STATE B: active session ---------- */
          <>
            {/* scrollable canvas */}
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="mx-auto w-full max-w-[850px] px-4 pt-6 sm:px-6">
                {/* header */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${selectedMeta!.pill}`}>
                    {selectedMeta!.label}
                    {selected.status === "running" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> : null}
                  </span>
                  <span className="text-xs text-stone-500">{new Date(selected.createdAt).toLocaleString()} • {timeAgo(selected.createdAt)}</span>
                  {(selected.status === "running" || selected.status === "creating") && (
                    <button onClick={handleStop} disabled={stopping} className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 active:scale-[0.98] disabled:opacity-40">
                      {stopping ? "Stopping…" : "Stop"}
                    </button>
                  )}
                  {selected.replayUrl && <a href={selected.replayUrl} target="_blank" className="ml-auto inline-flex items-center gap-1 rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-black active:scale-[0.98]">▶ Replay</a>}
                </div>
                <h1 className="mt-3 max-w-[80ch] text-[19px] font-semibold leading-[1.5] tracking-[-0.01em] text-stone-900 [text-wrap:balance]">{selected.prompt}</h1>
                {selected.errorMessage && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
                    <span className="font-semibold">Needs attention:</span> {selected.errorMessage} {selected.status === "paused" && <Link href="/settings" className="ml-1 font-semibold underline">Fix in Settings →</Link>}
                  </div>
                )}
                <button onClick={() => setShowTech((v) => !v)} className="mt-2 text-xs font-medium text-stone-500 transition hover:text-stone-700">
                  {showTech ? "Hide details" : "Show details"} • {selected.sandboxId.slice(0, 14)}…
                </button>
                {showTech && (
                  <div className="mt-2 rounded-lg border border-stone-200 bg-stone-50 p-2.5 font-mono text-xs leading-4 text-stone-600 break-all">
                    <div>sandbox {selected.sandboxId}</div>
                    <div>snapshot {selected.snapshotId}</div>
                    {selected.browserSessionId && <div>browser {selected.browserSessionId}</div>}
                    <div>convex {selected._id}</div>
                  </div>
                )}

                {/* timeline */}
                <div className="mt-8">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-medium tracking-wide text-stone-400">Timeline</h2>
                    <div className="flex items-center gap-2">
                      {selected.status === "running" && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />}
                      <span className="tnum rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">{selected.trace?.length ?? 0} steps</span>
                    </div>
                  </div>

                  {!selected.trace || selected.trace.length === 0 ? (
                    <div className="mt-3 rounded-xl border border-dashed border-stone-200 bg-stone-50/60 p-8 text-center">
                      {selected.status === "running" || selected.status === "creating" ? (
                        <div className="space-y-3">
                          <div className="mx-auto h-3 w-2/3 animate-pulse rounded-full bg-stone-200" />
                          <div className="mx-auto h-3 w-1/2 animate-pulse rounded-full bg-stone-200/80" />
                          <div className="mx-auto h-3 w-3/5 animate-pulse rounded-full bg-stone-200/60" />
                          <p className="pt-2 text-xs text-stone-500">Booting the sandbox — browser steps will stream here.</p>
                        </div>
                      ) : (
                        <p className="text-sm text-stone-600">No trace recorded — the harness exited before logging.</p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-stone-200 bg-white">
                      <div ref={traceScrollRef} className="max-h-[440px] overflow-auto overscroll-contain p-3 sm:p-4" style={{ scrollbarGutter: "stable" as const }}>
                        <div className="relative pl-4">
                          <div className="absolute left-[18px] top-2 bottom-2 w-px bg-stone-200" />
                          <div className="space-y-3">
                            {selected.trace.map((e: TraceEvent, i: number) => {
                              const isLast = i === selected.trace!.length - 1;
                              const isActive = isLast && selected.status === "running";
                              const u = e.type.toUpperCase();
                              const label = u.includes("THOUGHT") ? "Thought" : u.includes("KNOWLEDGE") ? "Context" : u.includes("ACTION") ? "Action" : e.type;
                              const failed = e.text.startsWith("FAILED — ");
                              const body = cleanTraceText(e.text);
                              return (
                                <div key={i} className="relative flex gap-3">
                                  <TraceDot type={e.type} active={isActive} />
                                  <div className={`flex-1 rounded-xl border px-3.5 py-2.5 transition-colors ${failed ? "border-red-200 bg-red-50/60" : isActive ? "border-stone-300 bg-amber-50/70 shadow-sm" : "border-stone-200 bg-white"}`}>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-medium tracking-wide ${failed ? "text-red-700" : "text-stone-500"}`}>{failed ? "Failed" : label}</span>
                                      <span className="tnum text-[11px] font-mono text-stone-400">{e.ts}</span>
                                      {isActive && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-stone-900 px-1.5 py-0.5 text-[10px] font-medium text-white"><span className="h-1 w-1 animate-pulse rounded-full bg-amber-400" />live</span>}
                                    </div>
                                    <div className={`mt-1 text-sm leading-5 break-words ${failed ? "text-red-800" : "text-stone-800"}`}>{body}</div>
                                  </div>
                                </div>
                              );
                            })}
                            <div ref={traceEndRef} className="h-px" />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-stone-200 px-3 py-1.5 text-xs text-stone-400">
                        <span className="tnum">{selected.trace.length} events</span>
                        <span className="hidden sm:inline">auto-scrolls on new events</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* result */}
                <div className="mt-8">
                  <h2 className="text-xs font-medium tracking-wide text-stone-400">Result</h2>
                  <div className="mt-3">
                    {!selected.response ? (
                      selected.status === "running" || selected.status === "creating" ? (
                        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-4">
                          <div className="h-3 w-1/3 animate-pulse rounded-full bg-stone-200" />
                          <div className="h-3 w-2/3 animate-pulse rounded-full bg-stone-200/80" />
                          <div className="h-3 w-1/2 animate-pulse rounded-full bg-stone-200/60" />
                        </div>
                      ) : (
                        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">No result yet.</div>
                      )
                    ) : (
                      (() => {
                        let parsed: Record<string, unknown> | null = null;
                        try { parsed = JSON.parse(selected.response!); } catch { parsed = null; }
                        const isSent = parsed?.sent === true || (typeof parsed?.conclusion === "string" && String(parsed.conclusion).includes("Email sent"));
                        if (parsed?.status === "completed" && typeof parsed.conclusion === "string" && !isSent) {
                          return (
                            <div className="rounded-xl border bg-emerald-50 border-emerald-200 p-4">
                              <div className="flex items-center gap-2 text-emerald-800"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs">✓</span><span className="text-xs font-bold tracking-widest">COMPLETED</span>{selected.replayUrl && <a href={selected.replayUrl} target="_blank" className="ml-auto text-xs font-semibold text-emerald-700 underline">Watch replay →</a>}</div>
                              <div className="mt-2 text-sm leading-6 text-stone-800 whitespace-pre-wrap">{String(parsed.conclusion).slice(0, 1200)}</div>
                            </div>
                          );
                        }
                        if (parsed?.email && typeof parsed.email === "string") {
                          return (
                            <div className="rounded-xl border bg-emerald-50 border-emerald-200 p-4">
                              <div className="flex items-center gap-2 text-emerald-800"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs">✓</span><span className="text-xs font-bold tracking-widest">EMAIL FOUND</span></div>
                              <div className="mt-2 font-mono text-sm font-semibold text-emerald-900 break-all">{String(parsed.email)}</div>
                              {typeof parsed.source === "string" && <div className="mt-1 text-xs text-emerald-700">via {String(parsed.source)}</div>}
                            </div>
                          );
                        }
                        if (isSent) {
                          return (
                            <div className="rounded-xl border bg-emerald-50 border-emerald-200 p-4">
                              <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs">✓</span><span className="text-sm font-semibold text-emerald-900">Email sent</span>{selected.replayUrl && <a href={selected.replayUrl} target="_blank" className="ml-auto text-xs font-semibold text-emerald-700 underline">Watch replay →</a>}</div>
                              <div className="mt-2 text-sm leading-5 text-stone-800">{String(parsed?.conclusion ?? "").slice(0, 400)}</div>
                              {typeof parsed?.to === "string" && parsed.to ? <div className="mt-1 text-xs font-mono text-stone-600">to {String(parsed.to)} • {typeof parsed.subject === "string" ? String(parsed.subject) : ""}</div> : null}
                            </div>
                          );
                        }
                        if (parsed && typeof parsed === "object" && (parsed.conclusion || parsed.response || parsed.title)) {
                          const text = [parsed.conclusion && String(parsed.conclusion), parsed.title && `Title: ${String(parsed.title)}`, parsed.h1 && `H1: ${String(parsed.h1)}`, parsed.url && `URL: ${String(parsed.url)}`, parsed.response && String(parsed.response).slice(0, 1500)].filter(Boolean).join("\n\n");
                          return <div className="rounded-xl border bg-stone-900 p-4 font-mono text-xs leading-5 text-stone-100 whitespace-pre-wrap break-words">{text.slice(0, 3000)}</div>;
                        }
                        return <div className="rounded-xl border bg-stone-900 p-4 font-mono text-xs leading-5 text-stone-100 whitespace-pre-wrap break-words max-h-[280px] overflow-auto">{selected.response!.slice(0, 4000)}</div>;
                      })()
                    )}
                  </div>
                  {selected.replayUrl && !selected.response?.includes("Email sent") && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <span className="text-xs font-semibold text-stone-700">Replay available</span>
                      <span className="hidden text-xs text-stone-500 sm:inline">Watch the real browser back</span>
                      <a href={selected.replayUrl} target="_blank" className="ml-auto rounded-full bg-stone-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-black active:scale-[0.98]">Open replay</a>
                    </div>
                  )}
                </div>

                {/* logs */}
                <details className="mt-6 group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 transition hover:bg-stone-50">
                    <span className="text-xs font-medium tracking-wide text-stone-400">Logs</span>
                    <span className="tnum rounded-full bg-stone-100 px-2 py-0.5 text-xs font-mono text-stone-600">{selected.executionLogs?.length ?? 0} lines</span>
                    <span className="ml-auto text-xs text-stone-400 group-open:hidden">Show</span><span className="ml-auto hidden text-xs text-stone-400 group-open:inline">Hide</span>
                  </summary>
                  <div className="mt-2 overflow-auto rounded-xl bg-stone-900 p-3 font-mono text-xs leading-5 text-stone-100 max-h-[220px]">
                    {(selected.executionLogs ?? []).length === 0 ? <span className="text-stone-500">No logs — sandbox booting…</span> : (selected.executionLogs ?? []).map((line: string, i: number) => <div key={i} className="whitespace-pre-wrap break-words">{line.slice(0, 800)}</div>)}
                  </div>
                </details>

                <div className="mt-4 pb-4 text-xs text-stone-400">Updated {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : new Date(selected.createdAt).toLocaleString()}</div>
              </div>
            </div>

            {/* sticky follow-up bar */}
            <div className="sticky bottom-0 border-t border-stone-200 bg-[#fafaf9]/95 px-4 py-3 backdrop-blur sm:px-6">
              <div className="mx-auto w-full max-w-[850px]">
                <PromptForm compact input={input} setInput={setInput} runState={runState} runError={runError} onSubmit={handlePromptSubmit} />
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
