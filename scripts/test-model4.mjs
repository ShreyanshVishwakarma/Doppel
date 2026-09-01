import { readFileSync } from "node:fs";
import { SandboxClient } from "@solarisdk/sandbox";
const env = readFileSync(".env.local","utf8");
let k="", s="";
for (const l of env.split("\n")) { let m=l.match(/SOLARI_API_KEY\s*=\s*(.+)/); if(m) k=m[1].trim(); let m3=l.match(/SANDBOX_SNAPSHOT_ID\s*=\s*(.+)/); if(m3) s=m3[1].trim(); }
const c=new SandboxClient({apiKey:k, baseUrl:"https://api.getsolari.com"});
const sbx=await c.create({template:"base", fromSnapshot:s});
await sbx.connect();
console.log("sbx", sbx.id);
let r=await sbx.commands.run("sh",{args:["-c", `
set -x
export HOME=/root
export PATH=/root/.local/bin:$PATH
# try mcp directly first
echo "=== mcp tools ==="
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npx -y @solarisdk/mcp 2>&1 | head -n 50
echo "=== opencode run verbose ==="
timeout 45 opencode run --model opencode/muse-spark-1.2-contributor-free --print-logs --log-level DEBUG "Say hello in one word, just hello" 2>&1
echo RUN_EXIT:$?
`], timeoutMs: 80000});
console.log("STDOUT\n", (r.stdout??"").slice(0,12000));
console.log("STDERR\n", (r.stderr??"").slice(0,4000));
console.log("exit", r.exitCode);
await sbx.kill();
