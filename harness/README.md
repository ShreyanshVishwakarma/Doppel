# Harness (runs INSIDE Solari Sandbox)

This config is baked into the sandbox snapshot by `scripts/build-harness-snapshot.mjs`.

Flow per prompt:
1. `POST /api/run` creates sandbox from `SANDBOX_SNAPSHOT_ID` (fork, ms boot)
2. Writes `/tmp/prompt.md` (user markdown 12k slice) + `/tmp/task.txt` + `/tmp/profiles.json` (platform→prof_xxx) + `/tmp/env.json`
3. Runs `opencode run` with MCP `solari` if AI gateway key present, else direct Solari Browser via Node
4. Browser is launched as `client.launch({ profileId, stealth:true, recording:true })` — profiles keep logins
5. Trace is written to `/tmp/trace.jsonl` (THOUGHT/KNOWLEDGE/ACTION) and polled into Convex sandboxSessions.trace — dashboard shows live timeline
6. After `browser.close()`, harness fetches `client.sessions.getReplayUrl(browser.id)` → `/tmp/replay_url.txt` → Convex replayUrl → dashboard “Open replay”

Snapshot vs pause:
- `snapshot("opencode-harness-v1")` — named checkpoint, fork new sandboxes, machine keeps running
- `pause` — park VM, resume via `solari_connect` (idle-pause by default after 30m)

Profiles (docs.getsolari.com/profiles):
- Create: `client.profiles.create({name:"gmail-user123"})` → prof_xxx
- Log in: console → Profiles → Open editor (live browser in tab) → Save
- Or upload: `client.profiles.save(id, storageState)`
- Attach: `client.launch({ profileId: prof_xxx })` — browser starts already signed in
- `/api/profiles` creates + maps to Convex browserProfiles; harness auto-picks gmail/linkedin profile matching prompt
