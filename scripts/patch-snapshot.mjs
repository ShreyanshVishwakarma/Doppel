import { readFileSync, writeFileSync } from "node:fs";
import { SandboxClient } from "@solarisdk/sandbox";
const get=k=>{
  try{
    const env=readFileSync(".env.local","utf8");
    const m=env.match(new RegExp(k+"\\s*=\\s*(.+)"));
    return m?m[1].trim():"";
  }catch{ return process.env[k]||""; }
};
const apiKey=get("SOLARI_API_KEY");
const oldSnap=get("SANDBOX_SNAPSHOT_ID");
if(!apiKey) throw new Error("SOLARI_API_KEY missing");
if(!oldSnap) throw new Error("SANDBOX_SNAPSHOT_ID missing");
console.log("Patching from snapshot", oldSnap);
const c=new SandboxClient({apiKey, baseUrl:"https://api.getsolari.com"});
async function retry(fn,tries=6){
  for(let i=0;i<tries;i++){
    try{ return await fn(); }catch(e){
      const msg = e.message||""+e;
      if(msg.includes("No sandbox")|| msg.includes("503")|| e.status===503 || e.code==="NoCapacityError" || msg.includes("Control channel closed")){
        console.log(`retry ${i} ${msg.slice(0,120)} waiting ${2000*(i+1)}ms`);
        await new Promise(r=>setTimeout(r,2000*(i+1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error("out of retries");
}
const sbx=await retry(()=>c.create({template:"base", fromSnapshot: oldSnap}));
console.log("created", sbx.id);
await sbx.connect();
console.log("connected");
try{
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
  console.log("wrote opencode.json");
  await sbx.files.write("/root/.config/opencode/system.md", `# Doppel Harness
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
`);
  console.log("wrote system.md");

  // quick verify - split into small commands to avoid control channel closed
  let r;
  r=await retry(()=>sbx.commands.run("sh",{args:["-c","cat /root/.config/opencode/opencode.json"],timeoutMs:15000}));
  console.log("cat opencode.json:\n", r.stdout.slice(0,2000));
  r=await retry(()=>sbx.commands.run("sh",{args:["-c","opencode --version 2>&1 | head -5; opencode models 2>&1 | head -20"],timeoutMs:20000}));
  console.log(r.stdout.slice(0,2000));
  r=await retry(()=>sbx.commands.run("sh",{args:["-c","opencode mcp list 2>&1 | head -40; echo MCP_EXIT:$?"],timeoutMs:20000}));
  console.log(r.stdout.slice(0,3000));
  r=await retry(()=>sbx.commands.run("sh",{args:["-c","ls /opt/doppel/node_modules/@solarisdk/browser/dist/index.js 2>&1 | head -5; ls /tmp/node_modules/@solarisdk/browser/dist/index.js 2>&1 | head -5"],timeoutMs:15000}));
  console.log(r.stdout.slice(0,1000));
  // Ensure /tmp copy exists
  r=await retry(()=>sbx.commands.run("sh",{args:["-c","mkdir -p /tmp/node_modules/@solarisdk && cp -r /opt/doppel/node_modules/@solarisdk/browser /tmp/node_modules/@solarisdk/ 2>/dev/null || true; cp -r /opt/doppel/node_modules/@solarisdk/mcp /tmp/node_modules/@solarisdk/ 2>/dev/null || true; ls /tmp/node_modules/@solarisdk/browser/dist/index.js 2>&1 | head -5"],timeoutMs:15000}));
  console.log(r.stdout.slice(0,1000));

  // Dry-run opencode with free model - should produce hello without needing gateway key
  console.log("Dry-run opencode run with mimo model...");
  r=await retry(()=>sbx.commands.run("sh",{args:["-c","export HOME=/root; export PATH=/root/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH; export SOLARI_API_KEY='"+apiKey+"'; timeout 40 opencode run -m opencode/mimo-v2.5-free \"hello, how are you today? Reply in one short sentence.\" 2>&1 | head -n 120; echo VERIFY_EXIT:$?"],timeoutMs:60000}));
  console.log(r.stdout.slice(0,4000), "exit", r.exitCode);
  // Also test the exact user failing command but with correct model flag (should not say agent not found)
  r=await retry(()=>sbx.commands.run("sh",{args:["-c","export HOME=/root; timeout 40 opencode run -m opencode/mimo-v2.5-free \"hello, how are you today?\" 2>&1 | head -n 120; echo EXIT2:$?"],timeoutMs:60000}));
  console.log("second dry", r.stdout.slice(0,3000));

  console.log("Snapshotting as v2...");
  const snapId = await sbx.snapshot("opencode-harness-v2-patched");
  console.log("\n=== SNAPSHOT READY v2 ===");
  console.log(snapId);
  let envText = readFileSync(".env.local","utf8");
  if(envText.includes("SANDBOX_SNAPSHOT_ID=")){
    envText = envText.replace(/SANDBOX_SNAPSHOT_ID=.*/, `SANDBOX_SNAPSHOT_ID=${snapId}`);
  } else {
    envText += `\nSANDBOX_SNAPSHOT_ID=${snapId}\n`;
  }
  writeFileSync(".env.local", envText);
  console.log("Updated .env.local");
  console.log("Also set this in Convex dashboard env if you use it");
} finally {
  await sbx.kill().catch(()=>{});
  console.log("killed");
}
