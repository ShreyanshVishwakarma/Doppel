#!/usr/bin/env node
// Build the opencode harness snapshot once, then fork it per prompt.
// Usage: SOLARI_API_KEY=slr_live_... node scripts/build-harness-snapshot.mjs
// Output: snapshot ID to put in .env.local as SANDBOX_SNAPSHOT_ID

import { readFileSync, writeFileSync } from "node:fs";
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
  console.log("Installing opencode + @solarisdk/mcp + @solarisdk/browser (full harness) ...");
  await sbx.commands.run("sh", { args: ["-c", "mkdir -p /root/.config/opencode && mkdir -p /opt/doppel && mkdir -p /tmp"], timeoutMs: 30000 });
  let nodeCheck = await sbx.commands.run("sh", { args: ["-c", "node -v; cat /etc/os-release | head -1"], timeoutMs: 15000 });
  console.log("Node before:", (nodeCheck.stdout ?? "").slice(0, 500));
  // Node 18 works for opencode; skip upgrade to avoid control channel drops on apt heavy ops
  // Keep lightweight system deps check only - no full apt-get upgrade here (snapshot template already has base libs)
  let res = await sbx.commands.run("sh", {
    args: ["-c", `
set -e
export HOME=/root
export PATH=$HOME/.local/bin:$PATH

echo "==> [1/4] System check (no heavy apt - using template base)..."
echo "node $(node -v) npm $(npm -v)"
which curl 2>&1 | head -2; which python3 2>&1 | head -2

echo "==> [2/4] Installing OpenCode CLI..."
curl -fsSL https://opencode.ai/install | bash 2>&1 | tail -20; echo INSTALL_EXIT:$?
echo "--- after curl ---"
ls -la $HOME/.local/bin/opencode 2>&1 | head -20
which opencode 2>&1 | head -20
opencode --version 2>&1 | head -20
echo "--- npm fallback if missing ---"
if ! which opencode >/dev/null 2>&1; then
  npm install -g opencode-ai 2>&1 | tail -30
  echo NPM_EXIT:$?
fi
which opencode 2>&1 | head -20
opencode --version 2>&1 | head -20

echo "==> [3/4] Configuring OpenCode Solari MCP Integration..."
mkdir -p "$HOME/.config/opencode"
cat > "$HOME/.config/opencode/opencode.json" << 'EOJ'
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode/mimo-v2.5-free",
  "mcp": {
    "solari": {
      "type": "local",
      "command": ["npx", "-y", "@solarisdk/mcp"],
      "enabled": true,
      "environment": {
        "SOLARI_API_KEY": "__REPLACE_API_KEY__"
      }
    }
  },
  "mcpServers": {
    "solari": {
      "command": "npx",
      "args": ["-y", "@solarisdk/mcp"],
      "env": {
        "SOLARI_API_KEY": "__REPLACE_API_KEY__"
      }
    }
  }
}
EOJ
# replace placeholder with real key (avoid shell interpolation issues)
python3 -c "import json, pathlib; p=pathlib.Path('/root/.config/opencode/opencode.json'); j=json.loads(p.read_text()); import os; k=os.environ.get('SOLARI_API_KEY',''); j['mcp']['solari']['environment']['SOLARI_API_KEY']=k; j['mcpServers']['solari']['env']['SOLARI_API_KEY']=k; p.write_text(json.dumps(j, indent=2)); print(p.read_text())" 2>&1 | head -40
cat $HOME/.config/opencode/opencode.json 2>&1 | head -60

echo "==> [4/4] Pre-installing Solari SDK + warming MCP..."
echo "--- npm bake to durable /opt/doppel ---"
npm i --prefix /opt/doppel @solarisdk/browser @solarisdk/mcp @solarisdk/sandbox 2>&1 | tail -20
mkdir -p /tmp/node_modules/@solarisdk
cp -r /opt/doppel/node_modules/@solarisdk/browser /tmp/node_modules/@solarisdk/ 2>/dev/null || true
cp -r /opt/doppel/node_modules/@solarisdk/mcp /tmp/node_modules/@solarisdk/ 2>/dev/null || true
cp -r /opt/doppel/node_modules/@solarisdk/sandbox /tmp/node_modules/@solarisdk/ 2>/dev/null || true
ls /opt/doppel/node_modules/@solarisdk/browser/dist/index.js 2>&1 | head -5
ls /tmp/node_modules/@solarisdk/browser/dist/index.js 2>&1 | head -5
echo "--- warm npx cache ---"
npx -y @solarisdk/mcp --help 2>&1 | head -20
echo "--- warm node import ---"
node -e "import('/opt/doppel/node_modules/@solarisdk/browser/dist/index.js').then(m=>console.log('browser warm ok')).catch(e=>console.log('warm fail',e.message))" 2>&1 | head -5
echo "--- opencode models + mcp list ---"
opencode models 2>&1 | head -20
opencode mcp list 2>&1 | head -40
echo "--- opencode agent list ---"
opencode agent list 2>&1 | head -30
`],
    timeoutMs: 600_000,
  });
  console.log(res.stdout?.slice(0, 10000));
  if (res.exitCode !== 0) console.error(res.stderr?.slice(0, 3000));

  // Inject real API key into the baked config (in case placeholder replacement failed due to env not exported)
  // Do it explicitly via files.write
  const opencodeConfig = {
    "$schema": "https://opencode.ai/config.json",
    "model": "opencode/mimo-v2.5-free",
    "mcp": {
      "solari": {
        "type": "local",
        "command": ["npx", "-y", "@solarisdk/mcp"],
        "enabled": true,
        "environment": { "SOLARI_API_KEY": apiKey }
      }
    },
    "mcpServers": {
      "solari": {
        "command": "npx",
        "args": ["-y", "@solarisdk/mcp"],
        "env": { "SOLARI_API_KEY": apiKey }
      }
    }
  };
  await sbx.files.write("/root/.config/opencode/opencode.json", JSON.stringify(opencodeConfig, null, 2));

  await sbx.files.write(
    "/root/.config/opencode/system.md",
    `# Doppel Harness
You are the Doppel sandbox harness inside a Solari Sandbox. You receive the user's markdown profile (/tmp/prompt.md) and a prompt (/tmp/task.txt) plus /tmp/profiles.json (platform→prof_xxx mapping for already-logged-in sessions).

## Browser Profile Rules (CRITICAL)
When the task involves Gmail, LinkedIn, Twitter, GitHub, or any site requiring login:
1. Read /tmp/profiles.json to find the profileId for the needed platform
2. You MUST pass profileId to solari_browser_create — e.g. solari_browser_create({ profileId: "prof_xxx", recording: true })
3. NEVER call solari_browser_create without profileId when a profile exists for the needed platform
4. After creating the browser, navigate to the site and VERIFY you are logged in (look for inbox/feed, NOT a sign-in page)
5. If you see a sign-in page despite using a profileId, the profile needs re-authentication — report this

## Browser MCP Tools
- solari_browser_create({ profileId, recording:true }): ALWAYS pass profileId from /tmp/profiles.json when task needs a logged-in site
- solari_browser_navigate, solari_browser_read_page, solari_browser_click/type/key/evaluate/screenshot
- solari_browser_replay_url, solari_browser_close

## Rules
- Never fake completion. Only report completed when verified via page state.
- If a login page appears and you lack a profile, report needsAuth for that platform instead of trying passwords.
- Prefer recording:true so replay URL works. Always call solari_browser_close when done, then solari_browser_replay_url.
- Keep trace concise but emit THOUGHT/KNOWLEDGE/ACTION steps via the shell trace helper if you fall back to direct browser.
`
  );

  // Verify harness can actually run opencode with Solari MCP (dry-run)
  console.log("Verifying opencode run can reach Solari MCP (dry-run without browser)...");
  res = await sbx.commands.run("sh", {
    args: ["-c", `
export HOME=/root
export PATH=$HOME/.local/bin:$PATH
export SOLARI_API_KEY="${apiKey}"
echo "--- verify: opencode models ---"
timeout 10 opencode models 2>&1 | head -20
echo "--- verify: opencode mcp list ---"
timeout 10 opencode mcp list 2>&1 | head -40
echo "--- verify: opencode run dry (no browser needed, just LLM hello) ---"
# Use opencode's free model mimo-v2.5-free - should work without external API key
timeout 40 opencode run -m opencode/mimo-v2.5-free "hello, how are you today? Reply in one short sentence." 2>&1 | head -n 100; echo VERIFY_EXIT:$?
echo "--- verify: --agent fallback behavior (user's example) ---"
timeout 40 opencode run --agent build -m opencode/mimo-v2.5-free "hello, how are you today?" 2>&1 | head -n 100; echo AGENT_EXIT:$?
`],
    timeoutMs: 120_000,
  });
  console.log((res.stdout ?? res.stderr ?? "").slice(0, 8000));
  if (res.stdout?.includes("VERIFY_EXIT:0") || res.stdout?.includes("hello")) {
    console.log("Dry-run looked OK (or at least didn't crash)");
  } else {
    console.warn("Dry-run may have failed but snapshotting anyway - check output above");
  }

  res = await sbx.commands.run("sh", { args: ["-c", "cat /root/.config/opencode/opencode.json; echo '---'; ls -la /root/.config/opencode/ 2>&1 | head -20; echo '---'; HOME=/root opencode --version 2>&1 | head; echo '---'; ls /tmp/node_modules/@solarisdk/browser/dist/index.js 2>&1 | head"], timeoutMs: 30000 });
  console.log((res.stdout ?? res.stderr ?? "").slice(0, 4000));

  console.log("Snapshotting harness (machine keeps running)...");
  const snapId = await sbx.snapshot("opencode-harness-v2");
  console.log("\n=== SNAPSHOT READY ===");
  console.log("snapshot:", snapId);
  console.log("Put in .env.local: SANDBOX_SNAPSHOT_ID=" + snapId);
  console.log("Also set in Convex env: SANDBOX_SNAPSHOT_ID");
  // Also write to local .env.local automatically for convenience
  try {
    let envText = readFileSync(".env.local", "utf8");
    if (envText.includes("SANDBOX_SNAPSHOT_ID=")) {
      envText = envText.replace(/SANDBOX_SNAPSHOT_ID=.*/, `SANDBOX_SNAPSHOT_ID=${snapId}`);
    } else {
      envText += `\nSANDBOX_SNAPSHOT_ID=${snapId}\n`;
    }
    writeFileSync(".env.local", envText);
    console.log("Updated .env.local with new snapshot");
  } catch(e){ console.log("Could not auto-update .env.local:", e.message); }
} finally {
  await sbx.kill().catch(() => {});
  console.log("Sandbox killed, snapshot persists");
}
