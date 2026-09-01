import { readFileSync } from "node:fs";
import { SandboxClient } from "@solarisdk/sandbox";
if (!process.env.SOLARI_API_KEY) {
  try { const env=readFileSync(".env.local","utf8"); for(const l of env.split("\n")){const m=l.match(/^\s*SOLARI_API_KEY\s*=\s*(.+)\s*$/); if(m){process.env.SOLARI_API_KEY=m[1].trim(); break;}} } catch {}
}
const apiKey = process.env.SOLARI_API_KEY;
const snapshotId = process.env.SANDBOX_SNAPSHOT_ID || (()=>{try{const e=readFileSync(".env.local","utf8"); const m=e.match(/SANDBOX_SNAPSHOT_ID\s*=\s*(.+)/); return m?.[1]?.trim()}catch{return undefined}})();
console.log("Using snapshot:", snapshotId);
const client = new SandboxClient({ apiKey, baseUrl: "https://api.getsolari.com" });
console.log("Creating sandbox from snapshot...");
const sbx = await client.create({ template: "base", fromSnapshot: snapshotId });
console.log("Created:", sbx.id);
await sbx.connect();
console.log("Connected", sbx.connected);
let r = await sbx.commands.run("sh", { args: ["-c", "node -v; opencode --version 2>&1 | head; HOME=/root npx -y @solarisdk/mcp --help 2>&1 | head -20; echo '---'; cat /root/.config/opencode/opencode.json"], timeoutMs: 30000 });
console.log("Check:\n", (r.stdout??"") + (r.stderr??""));
console.log("Exit", r.exitCode);
// Test writing prompt and running opencode dry
await sbx.files.write("/tmp/prompt.md", "# test markdown user is student wants DM");
await sbx.files.write("/tmp/task.txt", "Go to https://example.com and tell me heading");
r = await sbx.commands.run("sh", { args: ["-c", "cat /tmp/task.txt; echo '---'; opencode run --help 2>&1 | head -30; echo '---'; opencode --help 2>&1 | head -40"], timeoutMs: 15000 });
console.log("opencode help:\n", (r.stdout??"").slice(0,4000));
await sbx.kill();
console.log("killed");
