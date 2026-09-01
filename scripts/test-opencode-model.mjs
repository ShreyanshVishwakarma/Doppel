import { readFileSync } from "node:fs";
import { SandboxClient } from "@solarisdk/sandbox";
function loadEnv(){
  const t=readFileSync(".env.local","utf8");
  for(const l of t.split("\n")){
    const m=l.match(/^\s*(SOLARI_API_KEY|AI_GATEWAY_API_KEY|SANDBOX_SNAPSHOT_ID)\s*=\s*(.+)\s*$/);
    if(m) process.env[m[1]]=m[2].trim();
  }
}
loadEnv();
const client=new SandboxClient({apiKey: process.env.SOLARI_API_KEY, baseUrl:"https://api.getsolari.com"});
const sbx=await client.create({template:"base", fromSnapshot: process.env.SANDBOX_SNAPSHOT_ID});
await sbx.connect();
console.log("sbx", sbx.id, "connected", sbx.connected);
await sbx.env({SOLARI_API_KEY: process.env.SOLARI_API_KEY, AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY, VERCEL_AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY});
let r=await sbx.commands.run("sh",{args:["-c",`
set -x
export HOME=/root
export PATH=/root/.local/bin:/usr/bin:/bin:$PATH
export SOLARI_API_KEY="${process.env.SOLARI_API_KEY}"
export AI_GATEWAY_API_KEY="${process.env.AI_GATEWAY_API_KEY}"
export VERCEL_AI_GATEWAY_API_KEY="${process.env.AI_GATEWAY_API_KEY}"
echo "=== opencode models ==="
opencode models 2>&1 | head -n 100
echo "EXIT_MODELS:$?"
echo "=== providers ==="
opencode providers 2>&1 | head -n 100
echo "=== simple run 10s timeout ==="
timeout 30 opencode run "Say hello in one word" --format json 2>&1 | head -n 200
echo EXIT_RUN:$?
`], timeoutMs: 60000});
console.log("STDOUT\n", (r.stdout??"").slice(0,8000));
console.log("STDERR\n", (r.stderr??"").slice(0,4000));
console.log("exit", r.exitCode);
await sbx.kill();
