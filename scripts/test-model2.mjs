import { readFileSync } from "node:fs";
import { SandboxClient } from "@solarisdk/sandbox";
const env = readFileSync(".env.local","utf8");
let k="", s="";
for (const l of env.split("\n")) { let m=l.match(/SOLARI_API_KEY\s*=\s*(.+)/); if(m) k=m[1].trim(); let m3=l.match(/SANDBOX_SNAPSHOT_ID\s*=\s*(.+)/); if(m3) s=m3[1].trim(); }
const c=new SandboxClient({apiKey:k, baseUrl:"https://api.getsolari.com"});
const sbx=await c.create({template:"base", fromSnapshot:s});
await sbx.connect();
console.log("connected", sbx.id);
let r=await sbx.commands.run("sh",{args:["-c", `
set -x
export HOME=/root
export PATH=/root/.local/bin:$PATH
timeout 60 opencode run --model opencode/muse-spark-1.2-contributor-free "Say hello in one word" --format json 2>&1 | head -n 200
echo EXIT:$?
`], timeoutMs:90000});
console.log("OUT", (r.stdout??"").slice(0,6000));
console.log("ERR", (r.stderr??"").slice(0,2000));
console.log("exit", r.exitCode);
await sbx.kill();
