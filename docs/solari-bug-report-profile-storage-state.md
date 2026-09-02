# Solari Bug Report: profile storageState is never applied to browser sessions, and login handoff is unusable by end-users of apps built on Solari

**Reporter:** Shreyansh Vishwakarma — building "Doppel", an agent product on Solari (sandboxes + browser profiles + MCP)
**Date:** 2026-09-02 (all timestamps UTC, captured live on this date)
**Severity:** Blocker for any multi-user product built on Solari profiles

---

## Summary

Three related issues, in priority order:

1. **BUG (gateway):** `POST /sessions` with `profileId` reports the profile's storageState as attached, but the cookies are **never injected into the browser context**. Every session created with a profileId starts logged out. We verified this by connecting to the session's own context and counting cookies: **0**.
2. **BUG (auth/handoff):** The login-handoff URL (`POST /profiles/{id}/login-handoff`) returns `https://console.getsolari.com/profiles/{id}/edit`, which **307-redirects anonymous visitors to `console.getsolari.com/login`**. End-users of a product built on Solari cannot complete the "sign in once" flow without an account in *our* Solari org. The MCP tool docs describe this flow as designed for exactly that end-user, so either the docs or the auth gate is wrong.
3. **Reliability:** The console profile editor intermittently dies without saving: `editorStatus: "error"`, `editorError: "Editor task died without saving (swept by stuck-editor reconciler)"`. Observed twice on 2026-09-02 (12:43, 12:48 UTC) across both gmail profiles.

Client-side proof that this is a gateway/apply-layer problem, not bad cookies: when **we** fetch the storageState and apply it ourselves via Playwright `context.addCookies(...)`, Gmail loads fully signed in (inbox rendered, 50 Google cookies live). The saved storageState is fine. The gateway just never applies it.

---

## Environment

- `@solarisdk/browser` 0.1.2, `@solarisdk/sandbox` 0.1.2, `@solarisdk/mcp` 0.4.3
- orgId `cmtho5qim00czo001m31rx92h`, gateway `https://api.getsolari.com`
- Test profiles: `cmtit19y5001znr01n3obyd3g` ("gmail-user_3", v5, populated), `cmtjz85yf009ko201bw3q8e0y` ("gmail", v3, populated)
- Repro runs inside a Solari sandbox forked from our harness snapshot (node v20), and from WSL via the SDK directly

---

## Bug 1: storageState reported as attached, never injected

### Repro (deterministic, ~30s)

Run inside a Solari sandbox (or anywhere that can reach the gateway):

```js
import { Solari } from "@solarisdk/browser";
import { chromium } from "patchright-core";

const client = new Solari({ apiKey, baseUrl: "https://api.getsolari.com" });

// 1. Create a session with a populated profile
const s = await client.sessions.create({
  profileId: "cmtit19y5001znr01n3obyd3g", // v5, storageStateS3Key present, 62 cookies
  stealth: true,
  autoLogin: false,
});
// SDK reports: s.storageState = { cookies: [62 items], ... }  ← gateway SAYS it's attached
// The create response also includes a presigned storageStateUrl — so the gateway
// clearly resolved the profile. It just never pushes it into the browser.

// 2. Connect to the session's own context and count cookies
const browser = await chromium.connect(s.wsEndpoint);
const ctx = browser.contexts()[0];
const google = (await ctx.cookies()).filter(c => /google/.test(c.domain));
console.log(google.length); // → 0
```

### Observed output (2026-09-02, 17:31 UTC, fresh run)

```
[17:31:44] create session profileId=cmtit19y5001znr01n3obyd3g stealth=true autoLogin=false
[17:31:44] gateway says storageState: 62 cookies
[17:31:44] t+0ms:    google cookies actually in context = 0
[17:31:47] t+3s:     google cookies actually in context = 0
[17:31:53] t+6s:     google cookies actually in context = 0
```

- Polled up to t+9s in earlier runs — injection never lands.
- Reproduced identically with `autoLogin: true` (what `@solarisdk/mcp` 0.4.3 sends by default: `if (args.autoLogin !== false) body.autoLogin = true`) and `autoLogin: false`.
- Reproduced via three independent connection paths: SDK `session.wsEndpoint` (local proxy), raw `cdpEndpoint`, and the MCP server's own puppeteer attach. The context always has 0 Google cookies.
- Downstream effect: navigating to `mail.google.com` lands on `accounts.google.com/v3/signin/...` — "Sign in to continue to Gmail".

### Why we're confident it's the apply layer, not the cookies

Same profile, same day: if the client fetches the presigned `storageStateUrl` and applies it itself, the session is fully logged in:

```
create result: { profileApplied: true, cookiesApplied: 62, ... }
navigate → https://mail.google.com/mail/u/0/#inbox
title: "Inbox (79) - giram00000@gmail.com - Gmail"   ← signed in
```

(We shipped exactly this as a workaround: a drop-in MCP server that calls `context.addCookies(storageState.cookies)` + localStorage init scripts right after `sessions.create`. It works every time. But this belongs in the gateway — every MCP consumer hits this bug today.)

### Suggested fixes (pick one)

1. **Gateway-side injection** (expected behavior): apply the storageState to the session's default context before the CDP endpoint is served. The presigned URL + `storageStateS3Key` show all the machinery exists.
2. If injection is meant to be client-side, **make the MCP apply it** (fetch `storageStateUrl`, `addCookies` post-connect), and return `storageState: null` when a profileId was passed but wasn't applied — right now `Session.storageState` is populated and actively misleading.
3. At minimum: document that `profileId` on session-create is a no-op in the current API.

---

## Bug 2: login-handoff URL requires a Solari account

### Repro (2 requests)

```
$ curl -X POST -H "Authorization: Bearer $KEY" https://api.getsolari.com/profiles/cmtjz85yf009ko201bw3q8e0y/login-handoff
{"mode":"cold","handoffId":"fYYjMuJtRRnv","profileId":"cmtjz85yf009ko201bw3q8e0y",
 "url":"https://console.getsolari.com/profiles/cmtjz85yf009ko201bw3q8e0y/edit", ...}

$ curl -I https://console.getsolari.com/profiles/cmtjz85yf009ko201bw3q8e0y/edit
307 → https://console.getsolari.com/login
```

### Impact

`@solarisdk/mcp`'s `solari_browser_login` (cold mode) documents the intended product flow: *"pass profileName when you know a task will need a login... The user signs in once in a profile editor, and every later solari_browser_create({profileId}) starts already authenticated."* For that flow to work for **end-users of products built on Solari**, the handoff URL must render the profile editor for the anonymous holder of the link (it's already expiring and scoped by `handoffId`). Today it redirects to a Solari sign-in wall, so the only person who can complete a login is the org owner. This makes Solari profiles single-tenant in practice.

### Suggested fix

Serve the handoff at a tokenized, anonymous-accessible URL (e.g. `console.getsolari.com/handoff/{handoffId}` — the page then opens the profile editor scoped to that handoff). Keep the redirect-to-login only when the handoff is expired/unknown.

---

## Bug 3 (reliability): profile editor dies without saving

Observed on 2026-09-02:

```
editorStatus: "error"
editorError: "Editor task died without saving (swept by stuck-editor reconciler)"
```

on both `cmtit19y5001znr01n3obyd3g` (12:43) and `cmtjz85yf009ko201bw3q8e0y` (12:48). The user had completed the login and clicked Save in the console editor; the ECS editor task was swept before persisting. The profile `version` did not bump. There is no client-visible signal at save time that the save failed — we only found it by polling `GET /profiles` and noticing `editorStatus`. A save-failure surfaced to the editor UI (and/or a non-2xx on save) would avoid users believing they're logged in when they aren't.

---

## What works well (for context)

- `POST /sessions` with `stealth` + recording: rock solid for us across dozens of runs.
- Profile storage/retrieval (`GET /profiles`, presigned `storageStateUrl`): correct and fast.
- Client-side cookie application: works perfectly — Gmail, with Google's aggressive bot checks, accepts the restored session.
- Sandbox snapshots + `SandboxClient.kill()` idempotency: both in daily use, no issues.

Happy to share our full repro scripts or a screen recording of the before/after if useful.
