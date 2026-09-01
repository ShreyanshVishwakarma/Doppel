#!/usr/bin/env node
// Build the opencode harness snapshot once, then fork it per prompt.
// Usage: SOLARI_API_KEY=slr_live_... node scripts/build-harness-snapshot.mjs
// Output: snapshot ID to put in .env.local as SANDBOX_SNAPSHOT_ID

import { readFileSync } from "node:fs";
import { SandboxClient } from "@solarisdk/sandbox";

if (!process.env.SOLARI_API_KEY) {
  try {
    const env = readFileSync(".env.local", "utf8");
    for (const line of env.split("\n")) {
      const m = line.match(/^\s*SOLARI_API_KEY\s*=\s*(.+)\s*$/);
      if (m) { process.env.SOLARI_API_KEY = m[1].trim(); break; }
    }
  } catch {}
}
const apiKey = process.env.SOLARI_API_KEY;
if (!apiKey) throw new Error("SOLARI_API_KEY required (set in env or .env.local)");

const sandboxes = new SandboxClient({ apiKey, baseUrl: "https://api.getsolari.com" });

console.log("Creating base sandbox...");
const sbx = await sandboxes.create({ template: "base" });
console.log("Sandbox:", sbx.id);
await sbx.connect();
console.log("Connected:", sbx.connected);

try {
  console.log("Installing opencode + @solarisdk/mcp + @solarisdk/browser ...");
  await sbx.commands.run("sh", { args: ["-c", "mkdir -p /root/.config/opencode && mkdir -p /opt/doppel && mkdir -p /tmp"], timeoutMs: 30000 });
  let nodeCheck = await sbx.commands.run("sh", { args: ["-c", "node -v; cat /etc/os-release | head -1"], timeoutMs: 15000 });
  console.log("Node before:", (nodeCheck.stdout ?? "").slice(0, 500));
  if ((nodeCheck.stdout ?? "").includes("v18")) {
    console.log("Upgrading Node 18 -> 20 via nodesource...");
    const up = await sbx.commands.run("sh", {
      args: ["-c", "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs && node -v && npm -v"],
      timeoutMs: 180_000,
    });
    console.log("Node upgrade:", (up.stdout ?? "").slice(0, 3000), (up.stderr ?? "").slice(0, 1500));
  }
  let res = await sbx.commands.run("sh", {
    args: ["-c", `
set -x
export HOME=/root
export PATH=$HOME/.local/bin:$PATH
echo "node:" $(node -v) "npm:" $(npm -v)
curl -fsSL https://opencode.ai/install | bash 2>&1; echo INSTALL_EXIT:$?
echo "--- after curl ---"
ls -la $HOME/.local/bin/opencode 2>&1 | head -20
which opencode 2>&1 | head -20
opencode --version 2>&1 | head -20
echo "--- npm fallback if missing ---"
if ! which opencode >/dev/null 2>&1; then
  npm install -g opencode-ai 2>&1 | tail -30
  echo NPM_EXIT:$?
  which opencode 2>&1 | head -20
  opencode --version 2>&1 | head -20
fi
echo "--- mcp + browser pre-install ---"
# Bake to durable /opt/doppel (survives snapshot) + mirror to /tmp for current harness
npm i --prefix /opt/doppel @solarisdk/browser @solarisdk/mcp 2>&1 | tail -20
mkdir -p /tmp/node_modules/@solarisdk && cp -r /opt/doppel/node_modules/@solarisdk/browser /tmp/node_modules/@solarisdk/ 2>/dev/null || true
cp -r /opt/doppel/node_modules/@solarisdk/mcp /tmp/node_modules/@solarisdk/ 2>/dev/null || true
ls /opt/doppel/node_modules/@solarisdk/browser/dist/index.js 2>&1 | head -5
ls /tmp/node_modules/@solarisdk/browser/dist/index.js 2>&1 | head -5
npx -y @solarisdk/mcp --help 2>&1 | head -20
# Warm node import cache so first fork doesn't pay JIT
node -e "import('/opt/doppel/node_modules/@solarisdk/browser/dist/index.js').then(m=>console.log('browser warm ok')).catch(e=>console.log('warm fail',e.message))" 2>&1 | head -5
`],
    timeoutMs: 300_000,
  });
  console.log(res.stdout?.slice(0, 5000));
  if (res.exitCode !== 0) console.error(res.stderr?.slice(0, 3000));

  const opencodeConfig = {
    model: "opencode/muse-spark-1.2-contributor-free",
    mcpServers: {
      solari: {
        command: "npx",
        args: ["-y", "@solarisdk/mcp"],
        env: { SOLARI_API_KEY: apiKey },
      },
    },
  };
  await sbx.files.write("/root/.config/opencode/opencode.json", JSON.stringify(opencodeConfig, null, 2));

  await sbx.files.write(
    "/root/.config/opencode/system.md",
    `# Doppel Harness
You are the Doppel sandbox harness inside a Solari Sandbox. You receive the user's markdown profile (/tmp/prompt.md) and a prompt (/tmp/task.txt) plus /tmp/profiles.json (platform→prof_xxx mapping for already-logged-in sessions).
You control a real Solari browser via MCP tools:
- solari_browser_create({ profileId, stealth:true, recording:true }): profileId from /tmp/profiles.json if task needs gmail/linkedin — this keeps logins.
- solari_browser_navigate, solari_browser_read_page, solari_browser_click/type/key/evaluate/screenshot, solari_browser_replay_url, solari_browser_close.
Rules:
- Never fake completion. Only report completed when verified via page state.
- If a login page appears and you lack a profile, report needsAuth for that platform instead of trying passwords.
- Prefer recording:true so replay URL works. Always call solari_browser_close when done, then solari_browser_replay_url.
- Keep trace concise but emit THOUGHT/KNOWLEDGE/ACTION steps via the shell trace helper if you fall back to direct browser.
`
  );

  res = await sbx.commands.run("sh", { args: ["-c", "cat /root/.config/opencode/opencode.json; echo '---'; ls -la /root/.config/opencode/ 2>&1 | head -20; echo '---'; HOME=/root opencode --version 2>&1 | head; echo '---'; ls /tmp/node_modules/@solarisdk/browser/dist/index.js 2>&1 | head"], timeoutMs: 30000 });
  console.log((res.stdout ?? res.stderr ?? "").slice(0, 4000));

  console.log("Snapshotting harness (machine keeps running)...");
  const snapId = await sbx.snapshot("opencode-harness-v1");
  console.log("\n=== SNAPSHOT READY ===");
  console.log("snapshot:", snapId);
  console.log("Put in .env.local: SANDBOX_SNAPSHOT_ID=" + snapId);
  console.log("Also set in Convex env: SANDBOX_SNAPSHOT_ID");
} finally {
  await sbx.kill().catch(() => {});
  console.log("Sandbox killed, snapshot persists");
}
