import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";

export const maxDuration = 300;

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
  if (p.includes("gmail") || p.includes("mail.google") || p.includes("email")) out.push("gmail");
  if (p.includes("linkedin")) out.push("linkedin");
  if (p.includes("twitter") || p.includes(" x.com") || p.includes("x/twitter")) out.push("twitter");
  if (p.includes("github.com")) out.push("github");
  if (p.includes("greenhouse") || p.includes("lever") || p.includes("ashby") || p.includes("apply")) out.push("greenhouse");
  return [...new Set(out)];
}

export async function POST(req: Request) {
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
    const found = browserProfiles.find((b) => b.platform.toLowerCase() === pl.toLowerCase() && b.status === "active");
    if (found) profileMap[pl] = found.solariProfileId;
  }
  // Also include all active profiles so sandbox can pick best match
  const allActiveProfiles: Record<string, string> = {};
  for (const b of browserProfiles.filter((b) => b.status === "active")) {
    allActiveProfiles[b.platform] = b.solariProfileId;
  }

  const { SandboxClient } = await import("@solarisdk/sandbox");
  const sandboxes = new SandboxClient({ apiKey, baseUrl: "https://api.getsolari.com" });

  let sandbox: Awaited<ReturnType<typeof sandboxes.create>>;
  try {
    sandbox = await sandboxes.create({ template: "base", fromSnapshot: snapshotId });
  } catch (e) {
    return Response.json({ error: `Failed to create sandbox from snapshot: ${(e as Error).message}` }, { status: 502 });
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
      await sandbox.files.write("/tmp/profiles.json", JSON.stringify({ needed: profileMap, allActive: allActiveProfiles, platforms }));
      await sandbox.files.write("/tmp/env.json", JSON.stringify({ SOLARI_API_KEY: apiKey, AI_GATEWAY_API_KEY: aiGatewayKey }));

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
trace "KNOWLEDGE LOOKUP" "Markdown slice $(wc -c < /tmp/prompt.md) bytes | profiles $(cat /tmp/profiles.json | head -c 200)"
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
# ---- opencode harness — context-aware AI assistant (primary) ----
# Runs inside Solari Sandbox via MCP: Solari browser + Gmail/LinkedIn profiles + markdown context
set +e
OPENCODE_EXIT=99
if [ -n "$AI_GATEWAY_API_KEY" ]; then
  trace "ACTION" "Spawning opencode harness with Solari MCP (browser + profiles) — LLM will use full markdown context"
  timeout 120 opencode run --model opencode/muse-spark-1.2-contributor-free "$(cat /tmp/task.txt)

--- User profile markdown (entire file, follow cold outreach instructions exactly):
$(cat /tmp/prompt.md)" 2>&1 | head -n 800 > /tmp/opencode.out
  OPENCODE_EXIT=$?
  trace "THOUGHT" "opencode exit $OPENCODE_EXIT"
  cat /tmp/opencode.out 2>&1 | head -n 200
else
  trace "THOUGHT" "No AI_GATEWAY_API_KEY — skipping opencode, using direct browser fallback"
fi
# re-ensure browser SDK for opencode MCP (already baked to /opt/doppel)
if [ ! -f /tmp/node_modules/@solarisdk/browser/dist/index.js ] && [ -f /opt/doppel/node_modules/@solarisdk/browser/dist/index.js ]; then
  mkdir -p /tmp/node_modules/@solarisdk && cp -r /opt/doppel/node_modules/@solarisdk/browser /tmp/node_modules/@solarisdk/ 2>/dev/null || true
fi
# No deterministic fallback — opencode via MCP is the only executor. If it produced no result.json, mark FAILED.
if [ ! -f /tmp/result.json ]; then
  trace "ACTION" "No result.json from opencode — marking failed (no deterministic fallback)"
  if [ -s /tmp/opencode.out ]; then
    node -e "const fs=require('fs'); const txt=fs.readFileSync('/tmp/opencode.out','utf8').slice(0,6000); fs.writeFileSync('/tmp/result.json', JSON.stringify({status: 'failed', error: 'opencode produced no result.json', opencodeOutput: txt.slice(0,4000)}, null, 2))"
  else
    echo '{"error":"opencode produced no result.json and no output","status":"failed"}' > /tmp/result.json
    trace "THOUGHT" "No opencode output — marking failed"
  fi
fi
cat /tmp/result.json 2>&1 | head -n 80
if grep -q '"email"' /tmp/result.json 2>/dev/null; then trace "ACTION" "Result has email — done"; fi
if grep -q '"replay' /tmp/result.json 2>/dev/null; then trace "THOUGHT" "Result includes browser context"; fi
trace "THOUGHT" "Harness done"
`;

      await sandbox.files.write("/tmp/run.sh", runSh);

      const startLiveTrace = () => {
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
        }, 1200);
      };
      startLiveTrace();
      const result = await sandbox.commands.run("sh", { args: ["-c", "chmod +x /tmp/run.sh && /tmp/run.sh"], timeoutMs: 600_000 });
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

  return Response.json({ sessionId, sandboxId: sandbox.id, snapshotId, status: "running", profilesUsed: profileMap });
}
