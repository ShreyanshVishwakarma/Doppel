import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import { requireOwner, isResponse } from "../../../lib/owner";

export const maxDuration = 300;

// Fixed Solari browser MCP server injected into the sandbox.
// @solarisdk/mcp passes profileId to the gateway but the gateway never injects
// the profile storageState into the browser context (verified: 0 cookies in ctx
// despite 62 cookies "attached"). This server applies cookies client-side via
// patchright after session create, so profileId actually logs the user in.
const solariBrowserMcpMjs = String.raw`#!/usr/bin/env node
import { Solari } from "@solarisdk/browser";
import { chromium } from "patchright-core";
import readline from "node:readline";
import fs from "node:fs";

const apiKey = process.env.SOLARI_API_KEY || "";
const client = new Solari({ apiKey, baseUrl: "https://api.getsolari.com" });
const sessions = new Map();

const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");

const TOOLS = [
  {
    name: "solari_browser_create",
    description: "Start a Solari cloud browser session. If profileId is given, the profile's saved cookies and localStorage are applied client-side so the session starts ALREADY LOGGED IN. The response includes cookiesApplied - if > 0 the login state is guaranteed restored.",
    inputSchema: {
      type: "object",
      properties: {
        profileId: { type: "string", description: "Saved browser profile id (prof_xxx / prof_yyy style) that holds login cookies." },
        recording: { type: "boolean", description: "Enable rrweb session recording so a replay URL is available after close." },
      },
    },
  },
  {
    name: "solari_browser_navigate",
    description: "Navigate the session's page to a URL.",
    inputSchema: { type: "object", properties: { sessionId: { type: "string" }, url: { type: "string" } }, required: ["sessionId", "url"] },
  },
  {
    name: "solari_browser_read_page",
    description: "Read the page's visible text content.",
    inputSchema: { type: "object", properties: { sessionId: { type: "string" }, format: { type: "string" } }, required: ["sessionId"] },
  },
  {
    name: "solari_browser_screenshot",
    description: "Screenshot the page as PNG image.",
    inputSchema: { type: "object", properties: { sessionId: { type: "string" } }, required: ["sessionId"] },
  },
  {
    name: "solari_browser_click",
    description: "Click an element by CSS or text selector.",
    inputSchema: { type: "object", properties: { sessionId: { type: "string" }, selector: { type: "string" } }, required: ["sessionId", "selector"] },
  },
  {
    name: "solari_browser_type",
    description: "Type text into an element (focuses it first). Pass selector or leave empty to type into focused element.",
    inputSchema: { type: "object", properties: { sessionId: { type: "string" }, selector: { type: "string" }, text: { type: "string" } }, required: ["sessionId", "text"] },
  },
  {
    name: "solari_browser_key",
    description: "Press a key (e.g. Enter, Tab, Escape).",
    inputSchema: { type: "object", properties: { sessionId: { type: "string" }, key: { type: "string" } }, required: ["sessionId", "key"] },
  },
  {
    name: "solari_browser_evaluate",
    description: "Run a JS expression in the page and return its result.",
    inputSchema: { type: "object", properties: { sessionId: { type: "string" }, expression: { type: "string" } }, required: ["sessionId", "expression"] },
  },
  {
    name: "solari_browser_close",
    description: "Release the browser session. Call when the task is done.",
    inputSchema: { type: "object", properties: { sessionId: { type: "string" } }, required: ["sessionId"] },
  },
  {
    name: "solari_browser_replay_url",
    description: "Get the recording replay URL for the session (call after close).",
    inputSchema: { type: "object", properties: { sessionId: { type: "string" } }, required: ["sessionId"] },
  },
];

function getSession(id) {
  const e = sessions.get(id);
  if (!e) throw new Error("unknown sessionId: " + id + " — call solari_browser_create first");
  return e;
}

async function toolCreate(a) {
  const profileId = typeof a.profileId === "string" ? a.profileId : undefined;
  const body = { stealth: true, autoLogin: false };
  if (a.recording) body.recording = true;
  if (profileId) body.profileId = profileId;
  const session = await client.sessions.create(body);
  const browser = await chromium.connect(session.wsEndpoint);
  const ctx = browser.contexts()[0] || (await browser.newContext());
  let applied = 0;
  if (profileId && session.storageState) {
    try {
      const cookies = (session.storageState.cookies || []).map((c) => ({
        name: c.name, value: c.value, domain: c.domain, path: c.path || "/",
        expires: c.expires, httpOnly: !!c.httpOnly, secure: !!c.secure,
        sameSite: ["Lax", "Strict", "None"].includes(c.sameSite) ? c.sameSite : "Lax",
      }));
      await ctx.addCookies(cookies);
      applied = cookies.length;
      for (const o of session.storageState.origins || []) {
        const entries = (o.localStorage || []).map((e2) => [e2.name, e2.value]);
        if (!entries.length) continue;
        await ctx.addInitScript((init) => {
          if (location.origin === init.origin) { for (const kv of init.entries) { try { localStorage.setItem(kv[0], kv[1]); } catch {} } }
        }, { origin: o.origin, entries });
      }
    } catch (e) {
      applied = -1;
      console.error("[doppel-mcp] storageState apply failed:", e && e.message);
    }
  }
  const page = ctx.pages()[0] || (await ctx.newPage());
  sessions.set(session.id, { id: session.id, browser, ctx, page, recording: !!a.recording, profileId, applied });
  try { fs.appendFileSync("/tmp/browser_id.txt", session.id + "\n"); } catch {}
  return { sessionId: session.id, mode: "stealth", profileId: profileId || null, profileApplied: applied > 0, cookiesApplied: applied, expiresAt: session.expiresAt };
}

async function callTool(name, a) {
  switch (name) {
    case "solari_browser_create": return toolCreate(a);
    case "solari_browser_navigate": { const e = getSession(a.sessionId); await e.page.goto(a.url, { waitUntil: "domcontentloaded", timeout: 45000 }); return { url: e.page.url(), title: await e.page.title() }; }
    case "solari_browser_read_page": { const e = getSession(a.sessionId); const t = await e.page.evaluate(() => document.body ? document.body.innerText : ""); return { text: String(t).slice(0, 20000) }; }
    case "solari_browser_screenshot": { const e = getSession(a.sessionId); const png = await e.page.screenshot(); return { __image: true, base64: png.toString("base64") }; }
    case "solari_browser_click": { const e = getSession(a.sessionId); await e.page.click(a.selector, { timeout: 15000 }); return { ok: true }; }
    case "solari_browser_type": { const e = getSession(a.sessionId); if (a.selector) await e.page.click(a.selector, { timeout: 15000 }); if (a.text != null) await e.page.keyboard.type(String(a.text), { delay: 20 }); return { ok: true }; }
    case "solari_browser_key": { const e = getSession(a.sessionId); await e.page.keyboard.press(a.key); return { ok: true }; }
    case "solari_browser_evaluate": { const e = getSession(a.sessionId); const r = await e.page.evaluate(a.expression); return { result: r }; }
    case "solari_browser_close": { const e = sessions.get(a.sessionId); if (!e) return { ok: true, note: "already closed" }; await e.browser.close().catch(() => {}); await client.sessions.releaseAndWait(e.id).catch(() => {}); sessions.delete(a.sessionId); return { ok: true }; }
    case "solari_browser_replay_url": { const r = await client.sessions.getReplayUrl(a.sessionId); try { fs.writeFileSync("/tmp/replay_url.txt", r.url); } catch {} return r; }
    default: throw new Error("unknown tool: " + name);
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  const s = line.trim();
  if (!s) return;
  let msg;
  try { msg = JSON.parse(s); } catch { return; }
  if (msg.id === undefined) return; // notification
  (async () => {
    try {
      if (msg.method === "initialize") {
        send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: (msg.params && msg.params.protocolVersion) || "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "solari-browser-doppel", version: "1.0.0" } } });
      } else if (msg.method === "tools/list") {
        send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });
      } else if (msg.method === "tools/call") {
        const out = await callTool(msg.params.name, msg.params.arguments || {});
        if (out && out.__image) {
          send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "image", data: out.base64, mimeType: "image/png" }] } });
        } else {
          send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: JSON.stringify(out) }] } });
        }
      } else if (msg.method === "ping") {
        send({ jsonrpc: "2.0", id: msg.id, result: {} });
      } else {
        send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "method not found: " + msg.method } });
      }
    } catch (e) {
      send({ jsonrpc: "2.0", id: msg.id, result: { isError: true, content: [{ type: "text", text: String((e && e.message) || e) }] } });
    }
  })();
});
`;

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(5000),
  snapshotId: z.string().optional(),
});

function getConvex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not configured");
  return new ConvexHttpClient(url);
}

function detectPlatforms(prompt: string): string[] {
  const p = prompt.toLowerCase();
  const out: string[] = [];
  if (p.includes("gmail") || p.includes("mail.google") || p.includes("email") || p.includes("inbox") || p.includes("google mail")) out.push("gmail");
  if (p.includes("linkedin") || p.includes("connect with") || p.includes("dm on linkedin") || p.includes("linkedin message")) out.push("linkedin");
  if (p.includes("twitter") || p.includes(" x.com") || p.includes("x/twitter") || p.includes("tweet")) out.push("twitter");
  if (p.includes("github.com") || p.includes("github profile")) out.push("github");
  if (p.includes("greenhouse") || p.includes("lever") || p.includes("ashby") || p.includes("apply") || p.includes("job application") || p.includes("application portal")) out.push("greenhouse");
  return [...new Set(out)];
}

export async function POST(req: Request) {
  const gate = await requireOwner();
  if (isResponse(gate)) return gate;
  const { userId, getToken } = await auth();
  if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "prompt 1-5000 chars required" }, { status: 400 });

  const prompt = parsed.data.prompt;
  const apiKey = process.env.SOLARI_API_KEY;
  if (!apiKey) return Response.json({ error: "SOLARI_API_KEY not configured" }, { status: 503 });

  const snapshotId = parsed.data.snapshotId ?? process.env.SANDBOX_SNAPSHOT_ID;
  if (!snapshotId) {
    return Response.json(
      { error: "Harness snapshot not configured. Run: SOLARI_API_KEY=... node scripts/build-harness-snapshot.mjs and set SANDBOX_SNAPSHOT_ID" },
      { status: 503 }
    );
  }

  const token = await getToken({ template: "convex" });
  if (!token) return Response.json({ error: "Convex JWT not configured" }, { status: 503 });
  const convex = getConvex();
  convex.setAuth(token);

  let profile: Awaited<ReturnType<typeof convex.query<typeof api.profiles.getMyProfile>>> | null = null;
  try {
    profile = await convex.query(api.profiles.getMyProfile, {});
  } catch {
    return Response.json({ error: "Could not load profile" }, { status: 503 });
  }
  if (!profile) return Response.json({ error: "Complete onboarding first" }, { status: 400 });

  let markdownFull = profile.markdown;
  // strip old onboarding boilerplate if present
  markdownFull = markdownFull.replace(/^> This markdown is stored in Convex file storage.*\n/m, "").replace(/\n> This markdown is stored.*\n/, "\n").replace("## Bio (free-form paragraph)", "## Bio");

  // Load browser profiles for this user to inject correct profileId per platform
  let browserProfiles: Array<{ platform: string; solariProfileId: string; status: string }> = [];
  try {
    browserProfiles = (await convex.query(api.browserProfiles.listMine, {})) as typeof browserProfiles;
  } catch {
    // non-fatal
  }
  const platforms = detectPlatforms(prompt);
  const profileMap: Record<string, string> = {};
  for (const pl of platforms) {
    // pick most recent active (reverse to get latest)
    const found = [...browserProfiles].reverse().find((b) => b.platform.toLowerCase() === pl.toLowerCase() && b.status === "active");
    if (found) profileMap[pl] = found.solariProfileId;
  }
  // Also include all active profiles so sandbox can pick best match (last wins = most recent)
  const allActiveProfiles: Record<string, string> = {};
  for (const b of browserProfiles.filter((b) => b.status === "active")) {
    allActiveProfiles[b.platform] = b.solariProfileId;
  }
  // ensure needed overrides with most recent
  for (const k of Object.keys(profileMap)) allActiveProfiles[k] = profileMap[k];

  // Pre-flight: verify Solari profiles exist on the gateway AND have saved login state
  // Note: only id and name are guaranteed by GET /profiles; storageState presence
  // is only known via storageStateUrl (url === null means never logged in).
  // A profile with no saved cookies shows a sign-in wall — fail fast before burning a sandbox.
  const profileWarnings: string[] = [];
  const unsavedProfiles: Array<{ platform: string; profId: string }> = [];
  if (Object.keys(profileMap).length > 0) {
    try {
      const { Solari } = await import("@solarisdk/browser");
      const solariClient = new Solari({ apiKey, baseUrl: "https://api.getsolari.com" });
      const solariProfiles = await solariClient.profiles.list();
      for (const [platform, profId] of Object.entries(profileMap)) {
        const sp = solariProfiles.find((p: { id: string }) => p.id === profId);
        if (!sp) {
          profileWarnings.push(`${platform}: profile ${profId} not found on Solari — may have been deleted. Recreate in Settings.`);
          continue;
        }
        // Real field per gateway API: storageStateS3Key (null/absent = never saved cookies).
        // Also surface editorStatus==="error" — the console editor died without saving.
        const extra = sp as unknown as { storageStateS3Key?: string | null; editorStatus?: string; editorError?: string };
        if (!extra.storageStateS3Key) {
          unsavedProfiles.push({ platform, profId });
        } else if (extra.editorStatus === "error") {
          profileWarnings.push(`${platform}: last editor session failed to save ("${extra.editorError ?? "unknown"}") — if you hit a login wall, re-open the console editor and Save again.`);
        }
      }
      if (unsavedProfiles.length > 0) {
        const lines = unsavedProfiles.map((u) =>
          `${u.platform}: profile has no saved login. Open Settings → "Log in to ${u.platform}" — sign in on the login page — click Save — then re-run.`
        );
        return Response.json(
          { error: `Browser profile${unsavedProfiles.length > 1 ? "s" : ""} not logged in:\n${lines.join("\n")}`, profilesUsed: profileMap, needsLogin: unsavedProfiles.map((u) => u.platform) },
          { status: 400 }
        );
      }
    } catch {
      // non-fatal — proceed without validation
    }
  }

  const { SandboxClient } = await import("@solarisdk/sandbox");
  const sandboxes = new SandboxClient({ apiKey, baseUrl: "https://api.getsolari.com" });

  let sandbox!: Awaited<ReturnType<typeof sandboxes.create>>;
  {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        sandbox = await sandboxes.create({ template: "base", fromSnapshot: snapshotId });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        const msg = (e as Error).message + " " + String((e as { status?: number })?.status ?? "") + " " + String((e as { code?: string })?.code ?? "");
        const retryable = msg.includes("No sandbox host available") || msg.includes("503") || msg.includes("429") || msg.includes("ConcurrencyLimit") || msg.includes("NoCapacity") || (e as { status?: number })?.status === 503 || (e as { status?: number })?.status === 429;
        if (!retryable || attempt === 7) break;
        const delay = 3000 * (attempt + 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    if (lastErr) {
      const msg = (lastErr as Error).message;
      const isCapacity = msg.includes("No sandbox host available") || msg.includes("ConcurrencyLimit") || msg.includes("NoCapacity");
      const status = isCapacity ? 503 : 502;
      const hint = isCapacity ? " Solari hosts at capacity — retry in 10-20s (transient, not config)." : "";
      return Response.json({ error: `Failed to create sandbox from snapshot: ${msg}${hint}` }, { status });
    }
  }

  let sessionId: string;
  try {
    sessionId = await convex.mutation(api.sandboxSessions.create, {
      prompt,
      markdown: markdownFull,
      sandboxId: sandbox.id,
      snapshotId,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Markdown") && markdownFull.length > 12000) {
      try {
        sessionId = await convex.mutation(api.sandboxSessions.create, {
          prompt,
          markdown: markdownFull.slice(0, 12000),
          sandboxId: sandbox.id,
          snapshotId,
        });
      } catch (e2) {
        await sandbox.kill().catch(() => {});
        return Response.json({ error: `Failed to create session row: ${(e2 as Error).message}` }, { status: 500 });
      }
    } else {
      await sandbox.kill().catch(() => {});
      return Response.json({ error: `Failed to create session row: ${msg}` }, { status: 500 });
    }
  }

  const aiGatewayKey = process.env.AI_GATEWAY_API_KEY ?? "";
  // Best-effort env injection (SessionHandle.env exists per SDK handle.d.ts)
  try {
    await (sandbox as unknown as { env: (v: Record<string,string>)=>Promise<void> }).env({
      AI_GATEWAY_API_KEY: aiGatewayKey,
      SOLARI_API_KEY: apiKey,
    });
  } catch {}

  // Fire-and-forget harness execution
  void (async () => {
    let traceInterval: ReturnType<typeof setInterval> | undefined;
    try {
      await sandbox.connect().catch(() => {});
      // Write task files — avoid shell interpolation for secrets
      await sandbox.files.write("/tmp/prompt.md", markdownFull);
      await sandbox.files.write("/tmp/task.txt", prompt);
      await sandbox.files.write("/tmp/profiles.json", JSON.stringify({ needed: profileMap, allActive: allActiveProfiles, platforms, warnings: profileWarnings }));
      await sandbox.files.write("/tmp/env.json", JSON.stringify({ SOLARI_API_KEY: apiKey, AI_GATEWAY_API_KEY: aiGatewayKey }));
      await sandbox.files.write("/tmp/solari-browser-mcp.mjs", solariBrowserMcpMjs.replace(/\r\n/g, "\n"));

      // The harness run.sh is injected via file write to avoid quoting issues
      const runSh = String.raw`#!/bin/sh
set -e
export HOME=/root
export PATH=/root/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH
# Load env from file (no shell interpolation leakage)
SOLARI_API_KEY=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/env.json','utf8')).SOLARI_API_KEY)" 2>/dev/null)
AI_GATEWAY_API_KEY=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/env.json','utf8')).AI_GATEWAY_API_KEY)" 2>/dev/null)
export SOLARI_API_KEY AI_GATEWAY_API_KEY
echo "=== Doppel harness start === $(date) ==="
echo "node $(node -v 2>&1) opencode $(opencode --version 2>&1 | head -1)"
echo "prompt: $(cat /tmp/task.txt | head -c 400)"
echo "profiles: $(cat /tmp/profiles.json 2>&1)"
TRACE="/tmp/trace.jsonl"
: > "$TRACE"
trace() {
  TS=$(date +%H:%M:%S)
  # python if available, else node for json escaping
  ESCAPED=$(printf '%s' "$2" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(d)))" 2>/dev/null || printf '%s' "$2" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$2")
  echo "{\"ts\":\"$TS\",\"type\":\"$1\",\"text\":$ESCAPED}" >> "$TRACE"
  echo "[$TS] $1: $2"
}
trace "THOUGHT" "Harness booted — reading profile and prompt"
trace "KNOWLEDGE LOOKUP" "Markdown $(wc -c < /tmp/prompt.md) bytes | profiles $(cat /tmp/profiles.json 2>&1) | task $(cat /tmp/task.txt | head -c 200)"
# ---- ensure Solari browser SDK is available inside sandbox (baked to /opt/doppel) ----
if [ ! -f /opt/doppel/node_modules/@solarisdk/browser/dist/index.js ] && [ ! -f /tmp/node_modules/@solarisdk/browser/dist/index.js ]; then
  trace "ACTION" "Installing @solarisdk/browser inside sandbox"
  if [ -d /opt/doppel/node_modules ]; then
    mkdir -p /tmp/node_modules/@solarisdk && cp -r /opt/doppel/node_modules/@solarisdk/browser /tmp/node_modules/@solarisdk/ 2>/dev/null || npm i --prefix /tmp @solarisdk/browser --silent 2>&1 | tail -n 3
  else
    npm i --prefix /tmp @solarisdk/browser --silent 2>&1 | tail -n 3
  fi
elif [ ! -f /tmp/node_modules/@solarisdk/browser/dist/index.js ] && [ -f /opt/doppel/node_modules/@solarisdk/browser/dist/index.js ]; then
  mkdir -p /tmp/node_modules/@solarisdk && cp -r /opt/doppel/node_modules/@solarisdk/browser /tmp/node_modules/@solarisdk/ 2>/dev/null
fi
# ---- FIXED browser MCP: replaces @solarisdk/mcp browser tools (which never apply
# ---- profile cookies) with /tmp/solari-browser-mcp.mjs that applies storageState client-side
if [ -d /opt/doppel/node_modules/patchright-core ] && [ ! -d /tmp/node_modules/patchright-core ]; then
  cp -r /opt/doppel/node_modules/patchright-core /tmp/node_modules/ 2>/dev/null || true
fi
cat > /root/.config/opencode/opencode.json << EOJ
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "opencode/mimo-v2.5-free",
  "mcp": {
    "solari": {
      "type": "local",
      "command": ["node", "/tmp/solari-browser-mcp.mjs"],
      "enabled": true
    }
  },
  "mcpServers": {
    "solari": {
      "command": "node",
      "args": ["/tmp/solari-browser-mcp.mjs"]
    }
  }
}
EOJ
echo "opencode config rewritten to fixed MCP:"
cat /root/.config/opencode/opencode.json
# ---- opencode harness — context-aware AI assistant (primary) ----
# Runs inside Solari Sandbox via MCP: Solari browser + Gmail/LinkedIn profiles + markdown context
# Uses baked snapshot model opencode/mimo-v2.5-free (free, no external key needed) + Solari MCP solari_browser_*
set +e
OPENCODE_EXIT=99
trace "ACTION" "Spawning opencode harness with Solari MCP (browser + profiles) — LLM will use full markdown context (mimo-v2.5-free) via PTY"
cat > /tmp/inner.sh << 'INNEREOF'
#!/bin/sh
set -e

# Build a structured profiles instruction that the LLM cannot miss
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('/tmp/profiles.json','utf8') || '{}');
const needed = p.needed || {};
const allActive = p.allActive || {};
const warnings = p.warnings || [];
// Use needed (platform-matched) profiles, fall back to allActive if none matched
const profiles = Object.keys(needed).length > 0 ? needed : allActive;
const ids = Object.entries(profiles).map(([k,v]) => k + ': ' + v);
let out = '';
if (ids.length > 0) {
  out += '\n=== CRITICAL: BROWSER PROFILE IDs (YOU MUST PASS THESE) ===\n';
  out += 'When you call solari_browser_create, you MUST pass the profileId parameter.\n';
  out += 'Available profile IDs for this task:\n';
  for (const [k,v] of Object.entries(profiles)) {
    out += '  ' + k.toUpperCase() + ' profileId = \"' + v + '\"\n';
  }
  out += '\nExample call: solari_browser_create({ profileId: \"' + Object.values(profiles)[0] + '\", recording: true, autoLogin: false })\n';
  out += 'NEVER call solari_browser_create without profileId when profiles are listed above.\n';
  out += 'ALWAYS pass autoLogin: false — the profile already contains the login cookies; the autoLogin flow is NOT configured on this account and will interrupt you.\n';
  out += 'The profileId keeps the user logged in. Without it, Gmail/LinkedIn will show a sign-in page.\n';
  if (warnings.length > 0) {
    out += '\nWARNINGS:\n';
    for (const w of warnings) out += '  ⚠ ' + w + '\n';
  }
  out += '============================================================\n';
} else {
  out = '(No browser profiles configured for this task)\n';
}
fs.writeFileSync('/tmp/profile_instruction.txt', out);
" 2>/dev/null || echo '(No browser profiles configured for this task)' > /tmp/profile_instruction.txt

opencode run --auto -m opencode/mimo-v2.5-free "$(cat /tmp/task.txt)

--- User profile markdown (entire file, follow cold outreach instructions exactly):
$(cat /tmp/prompt.md)

--- Available Solari browser profiles:
$(cat /tmp/profiles.json 2>/dev/null || echo '{}')
$(cat /tmp/profile_instruction.txt 2>/dev/null || echo '')

--- Instructions: You are Doppel.
1. If the task involves Gmail, LinkedIn, or any site requiring login, you MUST call solari_browser_create with the profileId from the profiles section above and recording: true. The harness applies the profile cookies for you — check the response: cookiesApplied > 0 means you are logged in.
2. STRICTLY FORBIDDEN TOOLS: NEVER call solari_browser_login, solari_browser_await_login, or solari_browser_autologin_site, and NEVER click any \"Sign in\" button or navigate to accounts.google.com or any login form. The profile cookies are your ONLY login mechanism.
3. After navigating, verify login with solari_browser_read_page (format: text): look for inbox markers (e.g. \"Compose\", \"Inbox\", \"Primary\", account avatar) instead of a sign-in form.
4. If the page shows a sign-in form despite cookiesApplied > 0: write {\"status\":\"needsAuth\",\"needsAuth\":\"<platform>\",\"profileId\":\"<the id you used>\",\"hint\":\"Profile cookies expired — user should click Log in in Settings and re-save\"} to /tmp/result.json and stop immediately. Do not attempt any login.
5. Complete the task via browser, then call solari_browser_close and solari_browser_replay_url.
6. Write result to /tmp/result.json" 2>&1 | cat
INNEREOF
chmod +x /tmp/inner.sh
# opencode requires a PTY to emit LLM output — without script it exits after init with no output
which script 2>&1 | head -n 2; ls -lh /usr/bin/script 2>&1 | head -n 2; echo "inner.sh size $(wc -c < /tmp/inner.sh 2>&1) prompt $(wc -c < /tmp/prompt.md 2>&1)"
# no timeout — complex tasks (multi-step applications, outreach loops) run as long as they need;
# the sandbox VM's own idle TTL is the only bound
script -q -c 'bash /tmp/inner.sh 2>&1 | cat' /tmp/opencode.raw 2>&1 | head -n 20
echo "raw size $(wc -c < /tmp/opencode.raw 2>&1) lines $(wc -l < /tmp/opencode.raw 2>&1)"; head -n 20 /tmp/opencode.raw 2>&1 | cat -v | head -n 20
cat /tmp/opencode.raw 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | sed 's/\r//g' | head -n 800 > /tmp/opencode.out
OPENCODE_EXIT=$?
trace "THOUGHT" "opencode exit $OPENCODE_EXIT raw $(wc -c < /tmp/opencode.raw 2>&1) out $(wc -c < /tmp/opencode.out 2>&1)"
cat /tmp/opencode.out 2>&1 | head -n 200
# re-ensure browser SDK for opencode MCP (already baked to /opt/doppel)
if [ ! -f /tmp/node_modules/@solarisdk/browser/dist/index.js ] && [ -f /opt/doppel/node_modules/@solarisdk/browser/dist/index.js ]; then
  mkdir -p /tmp/node_modules/@solarisdk && cp -r /opt/doppel/node_modules/@solarisdk/browser /tmp/node_modules/@solarisdk/ 2>/dev/null || true
fi
# Verify profile was used — check opencode output for signs of login issues
if [ -s /tmp/opencode.out ]; then
  PROFILE_CHECK=$(node -e "
    const fs=require('fs');
    const txt=fs.readFileSync('/tmp/opencode.out','utf8').toLowerCase();
    const hasSignIn = /sign.?in|log.?in|password|your account|enter your email|choose an account/.test(txt);
    const hasGmail = /gmail|mail\.google|inbox/.test(txt);
    const hasProfileId = /prof_[a-z0-9]+/.test(txt);
    const hasNoProfile = /without.*profile|no profile|missing profile/.test(txt);
    console.log(JSON.stringify({hasSignIn, hasGmail, hasProfileId, hasNoProfile}));
  " 2>/dev/null || echo '{}')
  trace "THOUGHT" "Profile verification: $PROFILE_CHECK"
fi
# Smart result extraction: the LLM often completes the task but forgets to write
# result.json. Parse the transcript — never downgrade real work to "failed".
if [ ! -f /tmp/result.json ]; then
  if [ -s /tmp/opencode.out ]; then
    node -e "
      const fs=require('fs');
      const txt=fs.readFileSync('/tmp/opencode.out','utf8');
      const lines=txt.split('\n').map(l=>l.replace(/\r/g,'').trim()).filter(Boolean);
      // strong needsAuth signals only (page text often contains the words 'sign in')
      const strongAuth = /sign in to continue|accounts\.google\.com|choose an account|enter your email|email or phone/i.test(txt);
      // assistant's final prose = lines that are not tool calls, script boilerplate, or TUI chrome
      const prose = lines.filter(l => !/^[⚙✗→›·>]/.test(l) && !/^Script (started|done)/.test(l) && !/solari_/i.test(l) && !/^Error:/.test(l) && !/^Call log:/.test(l) && !/^waiting for locator/.test(l) && !/^Skill /i.test(l) && !/^(build|plan|·)/.test(l) && l.length > 3);
      const tail = prose.slice(-14).join('\n').slice(0, 1500);
      const m = txt.match(/https:\/\/console\.getsolari\.com\/profiles\/([a-z0-9]+)\/edit/);
      let out;
      if (strongAuth) {
        out = { status:'needsAuth', needsAuth: /gmail|mail\.google/i.test(txt) ? 'gmail' : 'profile', profileId: m ? m[1] : undefined, loginUrl: m ? m[0] : undefined, hint:'Profile cookies expired — user should click Log in in Settings and re-save', opencodeOutput: txt.slice(0,3000) };
      } else if (tail.length > 60) {
        out = { status:'completed', conclusion: tail };
      } else if (/^\s*✗/m.test(txt)) {
        out = { status:'failed', error:'Browser actions failed — see opencode output', opencodeOutput: txt.slice(0,4000) };
      } else {
        out = { status:'failed', error:'opencode produced no result.json', opencodeOutput: txt.slice(0,4000) };
      }
      fs.writeFileSync('/tmp/result.json', JSON.stringify(out, null, 2));
      console.log('extracted result status=' + out.status);
    " 2>/dev/null || echo '{"status":"failed","error":"result extraction crashed"}' > /tmp/result.json
  else
    echo '{"error":"opencode produced no output","status":"failed"}' > /tmp/result.json
    trace "THOUGHT" "No opencode output — marking failed"
  fi
fi
cat /tmp/result.json 2>&1 | head -n 80
if grep -q '"email"' /tmp/result.json 2>/dev/null; then trace "ACTION" "Result has email — done"; fi
if grep -q '"replay' /tmp/result.json 2>/dev/null; then trace "THOUGHT" "Result includes browser context"; fi
trace "THOUGHT" "Harness done"
`;

      await sandbox.files.write("/tmp/run.sh", runSh.replace(/\r\n/g, "\n"));

      const startLiveTrace = () => {
        let llmSeen = 0;
        // Parse opencode's raw transcript for browser tool calls so the dashboard
        // shows what the LLM is doing in real time, not just harness-level events.
        const parseLlmEvents = (raw: string) => {
          const clean = raw.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "");
          const lines = clean.split("\n").filter((l) => l.trim());
          if (llmSeen > lines.length) llmSeen = 0;
          const events: { ts: string; type: string; text: string }[] = [];
          const ts = new Date().toTimeString().slice(0, 8);
          for (const l of lines.slice(llmSeen)) {
            llmSeen++;
            const failed = /✗/.test(l);
            if (failed || /⚙/.test(l) || /solari_\w+/.test(l)) {
              const text = (failed ? "FAILED — " : "") + l.replace(/^[^\w[]/, "").replace(/[⚙✗]/g, "").trim();
              if (text.length > 4) events.push({ ts, type: "ACTION", text: text.slice(0, 240) });
            }
          }
          return events.slice(-40);
        };
        traceInterval = setInterval(async () => {
          try {
            const raw = await sandbox.files.readText("/tmp/trace.jsonl");
            const lines = raw.split("\n").filter(Boolean).slice(-80);
            const trace = lines
              .map((l) => {
                try {
                  return JSON.parse(l);
                } catch {
                  return null;
                }
              })
              .filter(Boolean) as { ts: string; type: string; text: string }[];
            try {
              const rawOut = await sandbox.files.readText("/tmp/opencode.raw");
              trace.push(...parseLlmEvents(rawOut));
            } catch {}
            if (trace.length) {
              const t2 = await getToken({ template: "convex" }).catch(() => null);
              if (t2) {
                const convex2 = getConvex();
                convex2.setAuth(t2);
                await convex2.mutation(api.sandboxSessions.update, { id: sessionId as never, trace } as never);
              }
            }
            // also push browserId/replayUrl opportunistically
            try {
              const bid = (await sandbox.files.readText("/tmp/browser_id.txt")).trim();
              const t2b = await getToken({ template: "convex" }).catch(() => null);
              if (bid && t2b) {
                const convex2 = getConvex();
                convex2.setAuth(t2b);
                await convex2.mutation(api.sandboxSessions.update, { id: sessionId as never, browserSessionId: bid } as never);
              }
            } catch {}
            try {
              const rurl = (await sandbox.files.readText("/tmp/replay_url.txt")).trim();
              if (rurl) {
                const t2c = await getToken({ template: "convex" }).catch(() => null);
                if (t2c) {
                  const convex2 = getConvex();
                  convex2.setAuth(t2c);
                  await convex2.mutation(api.sandboxSessions.update, { id: sessionId as never, replayUrl: rurl } as never);
                }
              }
            } catch {}
          } catch {}
        }, 2500);
      };
      startLiveTrace();
      // no client-side timeout — the harness runs until it finishes
      const result = await sandbox.commands.run("sh", { args: ["-c", "chmod +x /tmp/run.sh && /tmp/run.sh"] });
      if (traceInterval) clearInterval(traceInterval);
      const logs = [result.stdout?.slice(0, 6000) ?? "", result.stderr?.slice(0, 3000) ?? ""].filter(Boolean);
      let response: string | undefined;
      let trace: { ts: string; type: string; text: string }[] | undefined;
      let browserSessionId: string | undefined;
      let replayUrl: string | undefined;
      try {
        response = (await sandbox.files.readText("/tmp/result.json")).slice(0, 8000);
      } catch {}
      if (!response) {
        try {
          response = (await sandbox.files.readText("/tmp/opencode.out")).slice(0, 8000);
        } catch {}
      }
      try {
        const raw = await sandbox.files.readText("/tmp/trace.jsonl");
        trace = raw
          .split("\n")
          .filter(Boolean)
          .map((l) => {
            try {
              return JSON.parse(l);
            } catch {
              return null;
            }
          })
          .filter(Boolean) as typeof trace;
      } catch {}
      try {
        const rawOut = await sandbox.files.readText("/tmp/opencode.raw");
        const clean = rawOut.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "");
        const llmEvents = clean
          .split("\n")
          .filter((l) => /✗/.test(l) || /⚙/.test(l) || /solari_\w+/.test(l))
          .slice(-40)
          .map((l) => {
            const failed = /✗/.test(l);
            return { ts: "", type: "ACTION", text: ((failed ? "FAILED — " : "") + l.replace(/^[^\w[]/, "").replace(/[⚙✗]/g, "").trim()).slice(0, 240) };
          })
          .filter((e) => e.text.length > 4);
        if (llmEvents.length) trace = [...(trace ?? []), ...llmEvents];
      } catch {}
      try {
        browserSessionId = (await sandbox.files.readText("/tmp/browser_id.txt")).trim() || undefined;
      } catch {}
      try {
        replayUrl = (await sandbox.files.readText("/tmp/replay_url.txt")).trim() || undefined;
      } catch {}
      // also try parsing response for browserId/replay
      try {
        const j = JSON.parse(response ?? "{}");
        if (j.browserId && !browserSessionId) browserSessionId = j.browserId;
        if (j.replayUrl && !replayUrl) replayUrl = j.replayUrl;
      } catch {}
      const needsInput = (() => {
        try {
          const j = JSON.parse(response ?? "{}");
          if (j.needsAuth) return `Login required for ${j.needsAuth} — connect profile in Settings`;
          if (j.needsInput) return j.needsInput;
        } catch {}
        return null;
      })();
      const finalStatus = needsInput ? ("paused" as const) : result.exitCode === 0 ? "completed" : logs.join("").includes("failed") ? "failed" : "completed";
      // Merge browserId/replay into response if not already there
      let finalResponse = response;
      if (replayUrl || browserSessionId) {
        try {
          const j = response ? JSON.parse(response) : {};
          if (replayUrl) j.replayUrl = replayUrl;
          if (browserSessionId) j.browserSessionId = browserSessionId;
          finalResponse = JSON.stringify(j).slice(0, 8000);
        } catch {}
      }
      const convex2 = getConvex();
      const t2 = await getToken({ template: "convex" }).catch(() => null);
      if (t2) {
        convex2.setAuth(t2);
        await convex2.mutation(api.sandboxSessions.update, {
          id: sessionId as never,
          status: finalStatus,
          logs: logs.length ? logs : ["Harness completed"],
          response: finalResponse,
          trace,
          browserSessionId,
          replayUrl,
          errorMessage: needsInput ? needsInput : undefined,
        } as never);
      }
      await sandbox.kill().catch(() => {});
    } catch (err) {
      if (traceInterval) clearInterval(traceInterval);
      try {
        const t2 = await getToken({ template: "convex" }).catch(() => null);
        if (t2) {
          const convex2 = getConvex();
          convex2.setAuth(t2);
          await convex2.mutation(api.sandboxSessions.update, {
            id: sessionId as never,
            status: "failed",
            logs: [(err as Error).message.slice(0, 2000)],
            errorMessage: (err as Error).message.slice(0, 800),
          } as never);
        }
      } catch {}
      await sandbox.kill().catch(() => {});
    }
  })();

  return Response.json({ sessionId, sandboxId: sandbox.id, snapshotId, status: "running", profilesUsed: profileMap, profileWarnings: profileWarnings.length ? profileWarnings : undefined });
}
