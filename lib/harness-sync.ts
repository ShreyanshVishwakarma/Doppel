import { SandboxClient } from "@solarisdk/sandbox";

export type TraceEvent = { ts: string; type: string; text: string };

export type SyncMutation = (update: {
  status?: "creating" | "running" | "paused" | "completed" | "failed";
  logs?: string[];
  response?: string;
  trace?: TraceEvent[];
  browserSessionId?: string;
  replayUrl?: string;
  errorMessage?: string;
}) => Promise<void>;

// Sandbox VMs live ~2h; if a session is still "running" with no heartbeat
// long after that, the reconcile loop (or a dead worker) lost it — kill + fail.
const STALE_MS = 100 * 60 * 1000;

function parseTraceJsonl(raw: string): TraceEvent[] {
  return raw
    .split("\n")
    .filter(Boolean)
    .slice(-80)
    .map((l) => {
      try {
        return JSON.parse(l) as TraceEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is TraceEvent => !!e && typeof e.text === "string");
}

// opencode's raw transcript carries the live browser story (tool calls) that
// trace.jsonl only gets at coarse granularity. Same extraction the dashboard
// expects: last ~40 tool-call lines as ACTION events.
export function extractLlmEvents(rawOut: string): TraceEvent[] {
  const clean = rawOut.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "");
  return clean
    .split("\n")
    .filter((l) => /✗/.test(l) || /⚙/.test(l) || /solari_\w+/.test(l) || /browser_\w+/.test(l))
    .slice(-40)
    .map((l) => {
      const failed = /✗/.test(l);
      const text = ((failed ? "FAILED — " : "") + l.replace(/^[^\w[]/, "").replace(/[⚙✗]/g, "").trim()).slice(0, 240);
      return { ts: "", type: "ACTION", text };
    })
    .filter((e) => e.text.length > 4);
}

export function decideFinal(resultJson: string): { status: "completed" | "paused" | "failed"; errorMessage?: string } {
  try {
    const j = JSON.parse(resultJson) as Record<string, unknown>;
    if (typeof j.needsAuth === "string" && j.needsAuth) return { status: "paused", errorMessage: `Login required for ${j.needsAuth} — connect profile in Settings` };
    if (typeof j.needsInput === "string" && j.needsInput) return { status: "paused", errorMessage: j.needsInput };
    if (j.status === "failed") return { status: "failed", errorMessage: typeof j.error === "string" ? j.error.slice(0, 800) : "Harness reported failure" };
    return { status: "completed" };
  } catch {
    return { status: "completed" };
  }
}

async function tryRead(sandbox: { files: { readText: (p: string) => Promise<string> } }, path: string): Promise<string | null> {
  try {
    const t = await sandbox.files.readText(path);
    return t || null;
  } catch {
    return null;
  }
}

/**
 * Reconcile ONE sandbox against Convex. Short-lived: attach, read files,
 * push progress, and — when /tmp/result.json exists or the sandbox is gone —
 * finalize the session and destroy the VM so nothing burns money orphaned.
 * Safe to call every few seconds and from multiple callers (idempotent:
 * terminal sessions are a no-op for the caller to enforce).
 */
export async function syncSandboxSession(args: {
  apiKey: string;
  sandboxId: string;
  lastUpdateMs: number;
  mutate: SyncMutation;
}): Promise<{ finalized: boolean; status?: string; note: string }> {
  const { apiKey, sandboxId, lastUpdateMs, mutate } = args;
  const client = new SandboxClient({ apiKey, baseUrl: "https://api.getsolari.com" });

  // Is the VM even alive?
  let state: string | null = null;
  try {
    const view = await client.get(sandboxId);
    state = view.state;
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (!/404|not found|gone/i.test(msg)) return { finalized: false, note: `sandbox state unknown: ${msg.slice(0, 120)}` };
    state = "gone";
  }
  if (state === "gone" || state === "archived" || state === "releasing") {
    await mutate({ status: "failed", errorMessage: "Sandbox died before finishing — re-run the task", logs: [`Sandbox ${sandboxId} is ${state}; no result was produced`] });
    return { finalized: true, status: "failed", note: `sandbox ${state}` };
  }

  let sandbox: Awaited<ReturnType<SandboxClient["connect"]>>;
  try {
    sandbox = await client.connect(sandboxId);
  } catch (e) {
    return { finalized: false, note: `connect failed: ${(e as Error).message.slice(0, 120)}` };
  }

  const [traceRaw, rawOut, browserId, replayUrl, resultJson] = await Promise.all([
    tryRead(sandbox, "/tmp/trace.jsonl"),
    tryRead(sandbox, "/tmp/opencode.raw"),
    tryRead(sandbox, "/tmp/browser_id.txt"),
    tryRead(sandbox, "/tmp/replay_url.txt"),
    tryRead(sandbox, "/tmp/result.json"),
  ]);

  let trace: TraceEvent[] | undefined;
  if (traceRaw) {
    trace = parseTraceJsonl(traceRaw);
    if (rawOut) {
      const llm = extractLlmEvents(rawOut);
      if (llm.length) trace = [...trace, ...llm];
    }
  }

  // Finished? result.json is written exactly once, at the end of run.sh.
  if (resultJson) {
    const final = decideFinal(resultJson);
    let finalResponse = resultJson.slice(0, 8000);
    const bid = browserId?.trim() || undefined;
    const rurl = replayUrl?.trim() || undefined;
    if (bid || rurl) {
      try {
        const j = JSON.parse(resultJson) as Record<string, unknown>;
        if (rurl) j.replayUrl = rurl;
        if (bid) j.browserSessionId = bid;
        finalResponse = JSON.stringify(j).slice(0, 8000);
      } catch {}
    }
    await mutate({
      status: final.status,
      logs: ["Harness finished — result collected"],
      response: finalResponse,
      trace,
      browserSessionId: bid,
      replayUrl: rurl,
      errorMessage: final.errorMessage,
    });
    await client.kill(sandboxId).catch(() => {});
    try { sandbox.close(); } catch {}
    return { finalized: true, status: final.status, note: `finalized ${final.status}` };
  }

  // Stale (VM long past TTL, worker gone) — stop billing, fail loudly.
  if (Date.now() - lastUpdateMs > STALE_MS) {
    await mutate({ status: "failed", errorMessage: "Run timed out with no progress for ~100m — re-run the task", logs: [`No heartbeat for ${Math.round((Date.now() - lastUpdateMs) / 60000)}m; destroying sandbox`] });
    await client.kill(sandboxId).catch(() => {});
    try { sandbox.close(); } catch {}
    return { finalized: true, status: "failed", note: "stale — killed" };
  }

  // Still working — stream progress.
  const update: Parameters<SyncMutation>[0] = {};
  if (trace && trace.length) update.trace = trace;
  if (browserId?.trim()) update.browserSessionId = browserId.trim();
  if (replayUrl?.trim()) update.replayUrl = replayUrl.trim();
  if (Object.keys(update).length) await mutate(update);
  try { sandbox.close(); } catch {}
  return { finalized: false, note: `progress pushed (${trace?.length ?? 0} trace, browser ${browserId ? "yes" : "no"})` };
}
