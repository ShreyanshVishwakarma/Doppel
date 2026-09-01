import { readFileSync } from "node:fs";
import { SandboxClient } from "@solarisdk/sandbox";
function loadEnv() {
  try {
    const t = readFileSync(".env.local","utf8");
    for (const line of t.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
      if (m) process.env[m[1]] ||= m[1].trim ? m[1].trim() : m[2].trim().replace(/^"|"$/g,'');
      // better: only set if not exists and key in {SOLARI, AI_GATEWAY, SANDBOX}
      if (m && ["SOLARI_API_KEY","AI_GATEWAY_API_KEY","SANDBOX_SNAPSHOT_ID"].includes(m[1]) && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim();
      }
    }
    // simpler reload
    const env2 = readFileSync(".env.local","utf8");
    for (const l of env2.split("\n")) {
      const kv = l.match(/^\s*SOLARI_API_KEY\s*=\s*(.+)\s*$/);
      if (kv) process.env.SOLARI_API_KEY = kv[1].trim();
      const kv2 = l.match(/^\s*AI_GATEWAY_API_KEY\s*=\s*(.+)\s*$/);
      if (kv2) process.env.AI_GATEWAY_API_KEY = kv2[1].trim();
      const kv3 = l.match(/^\s*SANDBOX_SNAPSHOT_ID\s*=\s*(.+)\s*$/);
      if (kv3) process.env.SANDBOX_SNAPSHOT_ID = kv3[1].trim();
    }
  } catch {}
}
loadEnv();
console.log("SNAPSHOT", process.env.SANDBOX_SNAPSHOT_ID?.slice(0,20));
console.log("SOLARI", process.env.SOLARI_API_KEY?.slice(0,12));
console.log("GATEWAY", process.env.AI_GATEWAY_API_KEY?.slice(0,12));
const client = new SandboxClient({ apiKey: process.env.SOLARI_API_KEY, baseUrl: "https://api.getsolari.com" });
const sbx = await client.create({ template: "base", fromSnapshot: process.env.SANDBOX_SNAPSHOT_ID });
console.log("sbx", sbx.id);
await sbx.connect();
await sbx.env({ SOLARI_API_KEY: process.env.SOLARI_API_KEY, AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY });
await sbx.files.write("/tmp/prompt.md", "# User markdown\nI am a student, want referral for SWE role.\nTone: concise, professional.");
await sbx.files.write("/tmp/task.txt", "Go to https://example.com and tell me the page heading. Use solari_browser_create and navigate.");
let r = await sbx.commands.run("sh", { args: ["-c", `
export HOME=/root
export PATH=/root/.local/bin:/usr/bin:/bin:$PATH
export SOLARI_API_KEY="${process.env.SOLARI_API_KEY}"
export AI_GATEWAY_API_KEY="${process.env.AI_GATEWAY_API_KEY}"
echo "=== env check ==="
echo $SOLARI_API_KEY | cut -c1-12
echo $AI_GATEWAY_API_KEY | cut -c1-12
cat /root/.config/opencode/opencode.json
echo "=== opencode run dry ==="
timeout 90 opencode run "$(cat /tmp/task.txt)" -f /tmp/prompt.md 2>&1 | head -n 500
echo EXIT:$?
`], timeoutMs: 120000 });
console.log("OUTPUT:\n", (r.stdout??"").slice(0,8000));
console.log("STDERR:\n", (r.stderr??"").slice(0,2000));
console.log("exit", r.exitCode);
await sbx.kill();
