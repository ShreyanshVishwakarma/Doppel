import { readFileSync } from "node:fs";
const key = readFileSync("./.env.local","utf8").match(/SOLARI_API_KEY\s*=\s*(.+)/)[1].trim();
const snap = readFileSync("./.env.local","utf8").match(/SANDBOX_SNAPSHOT_ID\s*=\s*(.+)/)[1].trim();
console.log("snap", snap.slice(0,12));
import { SandboxClient } from "@solarisdk/sandbox";
const c = new SandboxClient({ apiKey: key, baseUrl: "https://api.getsolari.com" });
const sbx = await c.create({ template: "base", fromSnapshot: snap });
await sbx.connect();
console.log("connected", sbx.id);
let r = await sbx.commands.run("sh", { args: ["-c", "cat /root/.config/opencode/opencode.json; echo ---; cat /root/.config/opencode/system.md | head -n 20; echo ---; opencode --help 2>&1 | head -n 40; echo ---; opencode run --help 2>&1 | head -n 60"], timeoutMs: 30000 });
console.log(r.stdout.slice(0,5000));
console.log("stderr", r.stderr?.slice(0,1000));
// try a simple opencode run
r = await sbx.commands.run("sh", { args: ["-c", "export HOME=/root; export PATH=/root/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH; export AI_GATEWAY_API_KEY=$(node -e \"console.log(JSON.parse(require('fs').readFileSync('/tmp/env.json','utf8')).AI_GATEWAY_API_KEY)\" 2>/dev/null || echo $AI_GATEWAY_API_KEY); echo \"AI_KEY_LEN: ${#AI_GATEWAY_API_KEY}\"; timeout 30 opencode run --model opencode/muse-spark-1.2-contributor-free \"Say hello in one word\" 2>&1 | head -n 100; echo EXIT:$?"], timeoutMs: 40000 });
console.log("opencode test:", r.stdout.slice(0,3000), "exit", r.exitCode);
await sbx.kill();
