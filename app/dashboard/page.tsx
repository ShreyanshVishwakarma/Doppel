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
  // hide raw JSON noise
  if (t.includes('"needed"') && t.includes('"allActive"')) {
    try {
      const j = JSON.parse(t.replace(/^.*\| profiles /, "").replace(/^Markdown slice.*\| profiles /, ""));
      // shouldn't happen, fallback
    } catch {}
    // extract profile name roughly
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
  const base = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white";
  if (u.includes("THOUGHT")) return <div className={`${base} bg-sky-100 text-sky-700 border border-sky-200`}>⋯</div>;
  if (u.includes("KNOWLEDGE")) return <div className={`${base} bg-amber-100 text-amber-700 border border-amber-200`}>◎</div>;
  if (u.includes("ACTION")) return <div className={`${base} ${active ? "bg-emerald-600 text-white border-emerald-600" : "bg-emerald-100 text-emerald-700 border-emerald-200"}`}>▸</div>;
  return <div className={`${base} bg-zinc-100 text-zinc-600 border border-zinc-200`}>•</div>;
}

function statusMeta(s: string) {
  if (s === "completed") return { label: "Completed", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (s === "running") return { label: "Running", dot: "bg-amber-500 animate-pulse", pill: "bg-amber-50 text-amber-800 border-amber-200" };
  if (s === "failed") return { label: "Failed", dot: "bg-red-500", pill: "bg-red-50 text-red-700 border-red-200" };
  if (s === "paused") return { label: "Needs action", dot: "bg-sky-500", pill: "bg-sky-50 text-sky-700 border-sky-200" };
  return { label: s, dot: "bg-zinc-400", pill: "bg-zinc-100 text-zinc-600 border-zinc-200" };
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
  const [showTech, setShowTech] = useState(false);

  const selected = useMemo(() => {
    if (!sessions?.length) return null;
    if (selectedId) return sessions.find((s) => s._id === selectedId) ?? sessions[0];
    return sessions[0];
  }, [sessions, selectedId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sessions?.length && !selectedId) setSelectedId(sessions[0]._id);
  }, [sessions, selectedId]);

  const traceScrollRef = useRef<HTMLDivElement>(null);
  const traceEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // scroll only the trace pane, not the whole page
    if (traceScrollRef.current && traceEndRef.current) {
      traceEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      // ensure container scrolls if scrollIntoView didn't
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
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSelectedId(data.sessionId);
      setInput("");
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed");
    } finally {
      setRunState("idle");
    }
  }

  if (isLoading) return <div className="min-h-screen grid place-items-center p-6 text-sm bg-[#fafaf9]">Syncing Clerk → Convex…</div>;
  if (!isAuthenticated)
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 border-b bg-white"><div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6"><Link href="/" className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white">D.</div><span className="text-sm font-bold">Doppel</span></Link><Show when="signed-out"><Link href="/sign-in" className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-bold text-white">Sign in</Link></Show></div></header>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center"><h1 className="text-2xl font-bold">Sign in to use Doppel</h1><Show when="signed-out"><Link href="/sign-in" className="mt-6 inline-flex rounded-full bg-zinc-900 px-6 py-3 text-sm font-bold text-white">Sign in →</Link></Show></div>
      </div>
    );
  if (profile === null) {
    return (
      <div className="min-h-screen bg-white grid place-items-center p-6">
        <div className="text-center"><p className="text-sm font-medium">Complete onboarding to get your markdown context</p><Link href="/onboarding" className="mt-3 inline-flex rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-bold text-white">Go to onboarding →</Link></div>
      </div>
    );
  }

  const runningCount = (sessions ?? []).filter((s) => s.status === "running").length;
  const selectedMeta = selected ? statusMeta(selected.status) : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#fcfcfc]">
      <header className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1360px] items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white">D.</div>
            <span className="text-sm font-bold tracking-tight text-zinc-900">Doppel</span>
            {runningCount > 0 && <span className="ml-2 hidden sm:inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-800"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />{runningCount} running</span>}
          </Link>
          <div className="flex items-center gap-2 text-xs">
            <Link href="/settings" className="rounded-full border bg-white px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50 hidden sm:inline-flex">Settings</Link>
            <span className="hidden lg:inline text-zinc-400 max-w-[180px] truncate">{user?.primaryEmailAddress?.emailAddress}</span>
            <UserButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1360px] flex-1 gap-6 px-3 sm:px-6 py-4 sm:py-6 min-h-0">
        {/* LEFT */}
        <div className="flex w-full lg:w-[360px] shrink-0 flex-col rounded-2xl border bg-white shadow-sm overflow-hidden max-h-[calc(100vh-56px-32px)]">
          <div className="flex items-center justify-between border-b bg-zinc-50/60 px-4 py-3">
            <h2 className="text-xs font-semibold tracking-widest text-zinc-500">SESSIONS</h2>
            <span className="rounded-full bg-white border px-2 py-0.5 text-xs font-medium text-zinc-600">{(sessions ?? []).length}</span>
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-3 min-h-[240px]">
            {(sessions ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed bg-zinc-50/60 p-6 text-center">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-white border text-sm">✦</div>
                <div className="mt-3 text-sm font-semibold text-zinc-900">Start your first run</div>
                <p className="mx-auto mt-1 max-w-[28ch] text-xs leading-5 text-zinc-500">Ask Doppel to open Gmail, check a GitHub profile, or DM on LinkedIn. It opens a real browser — you watch the replay.</p>
                <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                  {["Find GitHub email", "Send Gmail", "LinkedIn outreach"].map((ex) => (
                    <button key={ex} onClick={() => setInput(ex === "Send Gmail" ? "open gmail and send an email to shreyanshvishwakarma.genai@gmail.com — hello and ask to hire me" : ex)} className="rounded-full border bg-white px-2.5 py-1 text-xs font-medium hover:bg-zinc-50">{ex}</button>
                  ))}
                </div>
              </div>
            ) : (
              (sessions ?? []).map((s) => {
                const isSel = selected?._id === s._id;
                const meta = statusMeta(s.status);
                const isRunning = s.status === "running";
                return (
                  <button
                    key={s._id}
                    onClick={() => setSelectedId(s._id)}
                    className={`group w-full text-left rounded-xl border bg-white p-3.5 text-left transition ${isSel ? "border-zinc-900 shadow-sm ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50"} ${isRunning ? "border-amber-200" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                      <span className={`text-xs font-semibold ${isRunning ? "text-amber-700" : isSel ? "text-zinc-900" : "text-zinc-700"}`}>{meta.label}</span>
                      <span className="ml-auto text-xs text-zinc-400">{timeAgo(s.createdAt)}</span>
                    </div>
                    <div className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-zinc-900">{s.prompt}</div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                      <span className="inline-flex items-center gap-1.5"><span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px]">{s.trace?.length ?? 0} steps</span>{s.browserSessionId ? <span className="text-emerald-600">• browser</span> : <span className="text-zinc-400">• no browser</span>}{s.replayUrl ? <span className="text-sky-600">• replay</span> : null}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <form onSubmit={handlePromptSubmit} className="border-t bg-zinc-50/60 p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask: open Gmail and send hello…"
                className="flex-1 rounded-xl border bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                disabled={runState === "running"}
              />
              <button type="submit" disabled={runState === "running" || !input.trim()} className="shrink-0 rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white disabled:opacity-40 hover:bg-black">
                {runState === "running" ? "…" : "Run"}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
              <span>{input.length}/5000</span>
              <Link href="/settings" className="font-medium text-zinc-600 hover:text-zinc-900">Profiles →</Link>
            </div>
            {runError && <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs font-medium text-red-700">{runError}</div>}
          </form>
        </div>

        {/* RIGHT */}
        <div className="hidden lg:flex flex-1 flex-col min-h-0 rounded-2xl border bg-white shadow-sm overflow-hidden">
          {!selected ? (
            <div className="grid place-items-center flex-1 p-12 text-center">
              <div>
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 text-white">◈</div>
                <div className="mt-3 text-sm font-semibold text-zinc-900">No session selected</div>
                <p className="mt-1 text-sm text-zinc-500">Pick a session on the left — the trace streams live here.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col min-h-0">
              {/* Header */}
              <div className="border-b bg-white px-6 py-5">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 h-2.5 w-2.5 rounded-full ${selectedMeta!.dot} ${selected.status === "running" ? "animate-pulse" : ""}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${selectedMeta!.pill}`}>{selectedMeta!.label}{selected.status === "running" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> : null}</span>
                      <span className="text-xs text-zinc-500">{new Date(selected.createdAt).toLocaleString()} • {timeAgo(selected.createdAt)}</span>
                      {selected.replayUrl && <a href={selected.replayUrl} target="_blank" className="ml-auto inline-flex items-center gap-1 rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white hover:bg-black">▶ Replay</a>}
                    </div>
                    <h1 className="mt-3 text-[15px] font-semibold leading-6 text-zinc-900">{selected.prompt}</h1>
                    {selected.errorMessage && (
                      <div className="mt-3 rounded-xl border bg-amber-50 border-amber-200 p-3 text-sm leading-5 text-amber-900">
                        <span className="font-semibold">Needs attention:</span> {selected.errorMessage} {selected.status === "paused" && <Link href="/settings" className="ml-1 font-semibold underline">Fix in Settings →</Link>}
                      </div>
                    )}
                    <button onClick={() => setShowTech((v) => !v)} className="mt-3 text-xs font-medium text-zinc-500 hover:text-zinc-700">{showTech ? "Hide details" : "Show details"} • {selected.sandboxId.slice(0, 14)}…</button>
                    {showTech && (
                      <div className="mt-2 rounded-lg bg-zinc-50 border p-2.5 font-mono text-xs leading-4 text-zinc-600 break-all">
                        <div>sandbox {selected.sandboxId}</div>
                        <div>snapshot {selected.snapshotId}</div>
                        {selected.browserSessionId && <div>browser {selected.browserSessionId}</div>}
                        <div>convex {selected._id}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Body: single column timeline + result */}
              <div className="flex-1 overflow-auto min-h-0">
                <div className="px-6 py-6">
                  {/* Timeline — scrollable pane so it never pushes the page */}
                  <div className="mt-2 flex items-center justify-between">
                    <h2 className="text-xs font-semibold tracking-widest text-zinc-500">TIMELINE</h2>
                    <div className="flex items-center gap-2">
                      {selected.status === "running" && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />}
                      <span className="rounded-full bg-zinc-100 border px-2 py-0.5 text-xs font-medium text-zinc-600">{selected.trace?.length ?? 0} steps</span>
                      <span className="hidden sm:inline text-xs text-zinc-400">scroll for history</span>
                    </div>
                  </div>

                  {!selected.trace || selected.trace.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed bg-zinc-50 p-8 text-center">
                      {selected.status === "running" ? (
                        <div>
                          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
                          <div className="mt-3 text-sm font-medium text-zinc-800">Booting sandbox…</div>
                          <div className="mt-1 text-xs text-zinc-500">Trace appears in ~2s — each browser step streams here.</div>
                        </div>
                      ) : (
                        <div className="text-sm text-zinc-600">No trace recorded. The harness may have exited before logging.</div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border bg-zinc-50/50 overflow-hidden">
                      <div
                        ref={traceScrollRef}
                        className="max-h-[380px] overflow-auto overscroll-contain p-3 sm:p-4"
                        style={{ scrollbarGutter: "stable" as const }}
                      >
                        <div className="relative pl-4">
                          <div className="absolute left-[18px] top-2 bottom-2 w-px bg-zinc-200" />
                          <div className="space-y-3">
                            {selected.trace.map((e: TraceEvent, i: number) => {
                              const isLast = i === selected.trace!.length - 1;
                              const isActive = isLast && selected.status === "running";
                              const u = e.type.toUpperCase();
                              const label = u.includes("THOUGHT") ? "Thought" : u.includes("KNOWLEDGE") ? "Context" : u.includes("ACTION") ? "Action" : e.type;
                              return (
                                <div key={i} className="relative flex gap-3">
                                  <TraceDot type={e.type} active={isActive} />
                                  <div className={`flex-1 rounded-xl border px-3.5 py-2.5 ${isActive ? "bg-amber-50 border-amber-200 shadow-sm" : "bg-white border-zinc-200"}`}>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-semibold tracking-wide ${u.includes("THOUGHT") ? "text-sky-700" : u.includes("KNOWLEDGE") ? "text-amber-700" : "text-emerald-700"}`}>{label}</span>
                                      <span className="text-xs font-mono text-zinc-400">{e.ts}</span>
                                      {isActive && <span className="ml-auto rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">live</span>}
                                    </div>
                                    <div className="mt-1 text-sm leading-5 text-zinc-800 break-words">{cleanTraceText(e.text)}</div>
                                  </div>
                                </div>
                              );
                            })}
                            <div ref={traceEndRef} className="h-px" />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t bg-white px-3 py-1.5 text-xs text-zinc-400">
                        <span>{selected.trace.length} events</span>
                        <span className="hidden sm:inline">auto-scrolls on new events</span>
                      </div>
                    </div>
                  )}

                  {/* Result */}
                  <div className="mt-8">
                    <h2 className="text-xs font-semibold tracking-widest text-zinc-500">RESULT</h2>
                    <div className="mt-3">
                      {!selected.response ? (
                        <div className={`rounded-xl border p-4 text-sm ${selected.status === "running" ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-zinc-50 border-zinc-200 text-zinc-600"}`}>
                          {selected.status === "running" ? "Working — result appears after the browser finishes…" : "No result yet."}
                        </div>
                      ) : (
                        (() => {
                          let parsed: Record<string, unknown> | null = null;
                          try { parsed = JSON.parse(selected.response!); } catch { parsed = null; }
                          const isSent = parsed?.sent === true || (typeof parsed?.conclusion === "string" && String(parsed.conclusion).includes("Email sent"));
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
                                <div className="mt-2 text-sm leading-5 text-zinc-800">{String(parsed?.conclusion ?? "").slice(0, 400)}</div>
                                {typeof parsed?.to === "string" && parsed.to ? <div className="mt-1 text-xs font-mono text-zinc-600">to {String(parsed.to)} • {typeof parsed.subject === "string" ? String(parsed.subject) : ""}</div> : null}
                              </div>
                            );
                          }
                          if (parsed && typeof parsed === "object" && (parsed.conclusion || parsed.response || parsed.title)) {
                            const text = [parsed.conclusion && String(parsed.conclusion), parsed.title && `Title: ${String(parsed.title)}`, parsed.h1 && `H1: ${String(parsed.h1)}`, parsed.url && `URL: ${String(parsed.url)}`, parsed.response && String(parsed.response).slice(0, 1500)].filter(Boolean).join("\n\n");
                            return <div className="rounded-xl border bg-zinc-900 p-4 font-mono text-xs leading-5 text-zinc-100 whitespace-pre-wrap break-words">{text.slice(0, 3000)}</div>;
                          }
                          return <div className="rounded-xl border bg-zinc-900 p-4 font-mono text-xs leading-5 text-zinc-100 whitespace-pre-wrap break-words max-h-[280px] overflow-auto">{selected.response!.slice(0, 4000)}</div>;
                        })()
                      )}
                    </div>
                    {selected.replayUrl && !selected.response?.includes("Email sent") && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl border bg-zinc-50 p-3">
                        <span className="text-xs font-semibold text-zinc-700">Replay available</span>
                        <span className="text-xs text-zinc-500 hidden sm:inline">Watch the real browser back</span>
                        <a href={selected.replayUrl} target="_blank" className="ml-auto rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-black">Open replay</a>
                      </div>
                    )}
                  </div>

                  {/* Logs */}
                  <details className="mt-6 group">
                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border bg-white px-3.5 py-2.5 hover:bg-zinc-50">
                      <span className="text-xs font-semibold tracking-widest text-zinc-500">LOGS</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-mono text-zinc-600">{selected.executionLogs?.length ?? 0} lines</span>
                      <span className="ml-auto text-xs text-zinc-400 group-open:hidden">Show</span><span className="ml-auto hidden text-xs text-zinc-400 group-open:inline">Hide</span>
                    </summary>
                    <div className="mt-2 overflow-auto rounded-xl bg-zinc-900 p-3 font-mono text-xs leading-5 text-zinc-100 max-h-[220px]">
                      {(selected.executionLogs ?? []).length === 0 ? <span className="text-zinc-500">No logs — sandbox booting…</span> : (selected.executionLogs ?? []).map((line: string, i: number) => <div key={i} className="whitespace-pre-wrap break-words">{line.slice(0, 800)}</div>)}
                    </div>
                  </details>

                  <div className="mt-4 text-xs text-zinc-400">Updated {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : new Date(selected.createdAt).toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile */}
      {selected && (
        <div className="lg:hidden mt-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${statusMeta(selected.status).dot}`} /><span className="text-xs font-semibold">{statusMeta(selected.status).label}</span><span className="ml-auto text-xs text-zinc-500">{timeAgo(selected.createdAt)}</span></div>
          <div className="mt-2 text-sm font-medium leading-5 line-clamp-3">{selected.prompt}</div>
          {selected.replayUrl && <a href={selected.replayUrl} target="_blank" className="mt-3 inline-flex rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white">▶ Replay</a>}
          <div className="mt-3 space-y-2 max-h-[360px] overflow-auto">
            {(selected.trace ?? []).slice(-12).map((e: TraceEvent, i: number) => (
              <div key={i} className="flex gap-2 rounded-xl border bg-zinc-50 p-2.5"><TraceDot type={e.type} /><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{e.type}</div><div className="text-xs leading-4 text-zinc-700 line-clamp-3">{cleanTraceText(e.text)}</div></div></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
