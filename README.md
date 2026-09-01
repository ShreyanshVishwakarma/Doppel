# Doppel

Doppel is a personal professional-work assistant. Onboarding saves a markdown profile to Convex. Each prompt forks a **Solari Sandbox** from a harness snapshot; the sandbox runs an `opencode` harness that controls a real Solari Browser via MCP and Profiles.

## Architecture

```text
Clerk session
    |
Next.js proxy + POST /api/run
    |  prompt + markdown slice (12k)
    v
Convex
  - profiles (markdown + resume)
  - browserProfiles (prof_xxx per platform)
  - sandboxSessions (sandboxId, prompt, status, logs, replayUrl)
    |
    v
Solari Sandbox (forked from opencode-harness snapshot, ms boot)
  - opencode harness + MCP solari (npx @solarisdk/mcp)
  - drives Browser Sessions via CDP: solari_browser_create/navigate/click/type/evaluate/screenshot/replay
  - Profiles keep logins across runs (storageState)
```

Sandbox = headless microVM for code/automation (no screen). Snapshot saves state while running; fork new sandboxes from it. Pause parks VM. See `harness/README.md` and `scripts/build-harness-snapshot.mjs`.

Browser Session lifecycle: `client.launch()` -> `browser.newPage()` -> `page.goto/click/type` -> `browser.close()` + `solari_browser_replay_url`.

## Local setup

Requirements: Node.js 20+ (Solari requires Node 20+).

1. Install:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_CONVEX_URL`
   - `CLERK_JWT_ISSUER_DOMAIN` (Clerk JWT template `convex` aud=convex)
   - `AI_GATEWAY_API_KEY` (Vercel AI Gateway)
   - `SOLARI_API_KEY=slr_live_...` (single key for browser+sandbox)
   - `SANDBOX_SNAPSHOT_ID=snap_...` (after building harness)

3. In Clerk create JWT template `convex` aud=`convex`, set same `CLERK_JWT_ISSUER_DOMAIN` in Convex env.

4. Build harness snapshot once (bakes opencode + MCP solari into snapshot):
   ```bash
   SOLARI_API_KEY=slr_live_... npm run harness:build
   # put returned snap_xxx into .env.local and Convex env as SANDBOX_SNAPSHOT_ID
   ```

5. Login persistence (optional but recommended for Gmail/LinkedIn/X):
   ```js
   import { Solari } from "@solarisdk/browser"
   const client = new Solari({ apiKey: process.env.SOLARI_API_KEY })
   const prof = await client.profiles.create({ name: "gmail-user123" })
   // then Profiles -> Open editor in console, log in, Save — or upload storageState.json
   // save prof.id to Convex browserProfiles via app UI
   ```

6. Run:
   ```bash
   npx convex dev
   npm run dev
   ```
   Sign in -> onboarding -> dashboard prompt like `go to X and DM this guy for referral`.

## Validation

```bash
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
npx convex codegen
```

## How a prompt runs

1. `POST /api/run {prompt}` (auth via Clerk, loads markdown from `convex/profiles.ts:19`)
2. `POST /api/run` creates Solari Sandbox from `SANDBOX_SNAPSHOT_ID` — fork in ms, not fresh boot
3. Writes `/tmp/prompt.md` + `/tmp/task.txt` inside sandbox, runs `opencode run --prompt ...`
4. opencode uses MCP tools: `solari_browser_create({profileId, stealth, proxy, captcha, recording})`, `navigate`, `read_page`, `screenshot`, `click/type/key/evaluate`, `replay_url`, `close`
5. Logs + replayUrl streamed to `sandboxSessions` table, dashboard polls `api.sandboxSessions.listMine`

## Profiles & MCP

Profiles store `storageState` (cookies/localStorage) per `https://mcp.getsolari.com/mcp` (hosted) or local `npx -y @solarisdk/mcp` with `SOLARI_API_KEY`. Treat transcripts containing sessionIds as credentials.
