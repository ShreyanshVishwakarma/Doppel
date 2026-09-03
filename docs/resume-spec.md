# Doppel — Autonomous Browser Agent Platform

**Solo-built, full-stack.** An autonomous AI agent that operates a real web browser on the user's behalf — inbox triage, cold outreach, job applications — starting every session already logged in via persisted browser profiles, with live action streaming and video replay of every run.

**Stack:** Next.js 16 (App Router) · TypeScript · Convex (reactive DB + file storage) · Clerk (auth + JWT) · Solari (stealth browser microVMs, sandbox snapshots, session recording) · OpenCode LLM harness + MCP (Model Context Protocol) · Tailwind CSS v4

## Architecture Highlights

- **Snapshot-forked execution engine** — per-task microVM sandboxes forked from a pre-baked snapshot (opencode CLI + Solari SDKs + MCP server), booting in seconds; fire-and-forget orchestration with an injected POSIX harness script, 8-attempt capacity retry logic, and guaranteed teardown (idempotent kill switch exposed in-product).
- **Custom MCP server** — diagnosed and worked around a broken upstream SDK (profile storageState silently never applied by the gateway — proven via live CDP cookie inspection inside sandboxes) by shipping a drop-in MCP server that applies persisted cookies/localStorage client-side via Patchright, turning non-functional "logged-in sessions" into a 100%-restore flow verified against Gmail.
- **Deterministic result extraction** — transcript parser that classifies runs (completed / needs-auth / failed) from raw LLM output, eliminating false-failure reporting; fail-fast pre-flight validation of profile login state against the gateway before spending sandbox capacity.
- **Live observability** — ANSI-stripped, deduplicated streaming of LLM browser tool calls into a reactive trace timeline (Convex subscriptions), plus auto-captured replay URLs and browser session IDs surfaced in the UI.
- **In-app credential handoff** — end-user login flow via Solari's login-handoff API with version-bump polling to confirm cookie persistence, removing any dependency on the provider console.

## Product Surface

- Chat-style workspace (Gemini/ChatGPT layout) with session history, live tool-call timeline, sticky follow-up composer, skeleton loading states, and a session kill switch.
- Tabbed settings: platform logins (Gmail/LinkedIn/X/GitHub), profile context editor, and a direct markdown context file that is injected verbatim into every agent prompt.
- Production polish: branded favicon + code-generated Open Graph card (Satori), title/metadata templates, public metadata routes behind auth middleware, state-aware navigation, reduced-motion + focus-visible accessibility, single warm-gray design system.

## Engineering Notes (talking points)

- Designed around two-layer identity: user context (markdown "who you are") vs. browser identity (per-platform cookie profiles) — the key insight that made logged-in agent actions possible.
- Handled cross-platform dev environments (Windows/WSL) incl. native binary mismatches, CRLF/LF correctness in injected shell scripts, and peer-dependency conflicts.
- Auth: Clerk dev→prod separation, Convex JWT templates, index-backed multi-tenant queries with per-user authorization on every mutation/query.

---

## Resume Bullets (pick 3–5)

- Built an autonomous browser-agent platform (Next.js, TypeScript, Convex, Clerk) that executes real tasks — email, outreach, job applications — in stealth cloud browsers forked from pre-baked microVM snapshots, with per-run video replay.
- Diagnosed and worked around a provider-side bug where persisted login profiles were silently never applied to browser sessions, by writing a custom MCP server that injects cookies/localStorage client-side (Patchright/CDP), restoring a 100% logged-in-session success rate verified against Gmail.
- Implemented live observability for LLM agents: streaming tool-call traces from a PTY-captured TUI (ANSI-stripped, deduped) into a reactive Convex timeline, plus transcript-based run classification (completed / needs-auth / failed) that eliminated false failure reports.
- Designed fail-fast pre-flight validation of saved login state before sandbox allocation, cutting wasted compute on unauthenticated runs; added an in-product session kill switch backed by an idempotent gateway API.
- Shipped a polished product surface end-to-end: chat-style dashboard, tabbed settings with in-app credential handoff, code-generated OG images, and an accessible single-palette design system.

## One-liner variants

- "Doppel — an autonomous browser agent that runs your professional life (inbox, outreach, applications) in stealth cloud browsers, logged in as you, with live trace streaming and replay."
- Short: "Full-stack autonomous browser agent platform: Next.js + Convex + stealth browser microVMs + custom MCP tooling."
