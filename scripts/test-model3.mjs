import { readFileSync } from "node:fs";
import { SandboxClient } from "@solarisdk/sandbox";
const env = readFileSync(".env.local","utf8");
let k="", s="";
for (const l of env.split("\n")) { let m=l.match(/SOLARI_API_KEY\s*=\s*(.+)/); if(m) k=m[1].trim(); let m3=l.match(/SANDBOX_SNAPSHOT_ID\s*=\s*(.+)/); if(m3) s=m3[1].trim(); }
const c=new SandboxClient({apiKey:k, baseUrl:"https://api.getsolari.com"});
const sbx=await c.create({template:"base", fromSnapshot:s});
await sbx.connect();
console.log("connected", sbx.id);
async function run(cmd){
  let r=await sbx.commands.run("sh",{args:["-c", `
export HOME=/root
export PATH=/root/.local/bin:$PATH
${cmd} 2>&1
echo EXIT_CODE:$?
`], timeoutMs:90000});
  console.log("CMD:", cmd.slice(0,120));
  console.log("OUT:", (r.stdout??"").slice(0,8000));
  console.log("ERR:", (r.stderr??"").slice(0,2000));
  console.log("exit", r.exitCode, "---");
}
await run(`opencode providers list 2>&1 | head -n 50`);
await run(`cat /root/.config/opencode/opencode.json`);
await run(`timeout 30 opencode run --model opencode/muse-spark-1.2-contributor-free --print-logs --log-level DEBUG "Say hello in one word" 2>&1 | head -n 300; echo DONE`);
await sbx.kill();
