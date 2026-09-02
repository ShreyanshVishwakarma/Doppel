import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { OpenDoppelCta } from "@/components/open-doppel-cta";

// ---------- shared tiny icons (no extra deps) ----------
function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[#fafaf9] text-zinc-900">
      {/* NAV */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-[64px] max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-[13px] font-bold tracking-tight text-white">
              D.
            </div>
            <span className="text-[15px] font-semibold tracking-tight">Doppel</span>
            <span className="hidden rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium tracking-widest text-white sm:inline">
              BETA
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-zinc-600 md:flex">
            <a href="#how-it-works" className="hover:text-zinc-900">How it works</a>
            <a href="#features" className="hover:text-zinc-900">Capabilities</a>
            <a href="#architecture" className="hover:text-zinc-900">Architecture</a>
          </nav>

          <div className="flex items-center gap-3">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="hidden text-sm font-medium text-zinc-600 hover:text-zinc-900 sm:inline">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition hover:bg-zinc-800">
                  Sign up
                </button>
              </SignUpButton>
              <Link
                href="/onboarding"
                className="hidden lg:inline-flex h-9 items-center justify-center rounded-full border border-zinc-200 bg-white px-5 text-sm font-medium hover:bg-zinc-50"
              >
                Get started
              </Link>
            </Show>
            <Show when="signed-in">
              <OpenDoppelCta />
              <UserButton />
            </Show>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-zinc-200 bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_800px_400px_at_50%_-100px,rgba(120,120,255,0.08),transparent)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />

        <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Autonomous browser agents • Powered by Solari + Vision LLM
            </div>

            <h1 className="mt-6 text-[38px] font-[650] leading-[0.95] tracking-[-0.04em] sm:text-[52px]">
              Your professional
              <br />
              <span className="bg-gradient-to-r from-zinc-900 via-zinc-700 to-zinc-400 bg-clip-text text-transparent">
                doppelgänger.
              </span>
            </h1>

            <p className="mt-5 max-w-[52ch] text-[17px] leading-7 text-zinc-600">
              Doppel takes control of your professional handles — Gmail, LinkedIn, X — and <em className="font-medium not-italic text-zinc-900">actually does things</em>. Apply to jobs, reply to recruiters, DM prospects, schedule interviews. No replacement. Just an explicit, browser-native execution loop you command.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button className="inline-flex h-11 items-center gap-2 rounded-full bg-zinc-900 px-6 text-sm font-medium text-white shadow-sm transition hover:bg-black">
                    Start with Doppel <ArrowRight />
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-200 bg-white px-6 text-sm font-medium hover:bg-zinc-50">
                    Sign up free
                  </button>
                </SignUpButton>
                <Link
                  href="/onboarding"
                  className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
                >
                  View onboarding →
                </Link>
              </Show>
              <Show when="signed-in">
                <OpenDoppelCta variant="hero" />
              </Show>
            </div>

            <div className="mt-6 flex items-center gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" /> Stealth Chrome via Solari
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" /> Persistent profiles
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" /> Replayable
              </span>
            </div>

            <p className="mt-4 max-w-[48ch] text-xs leading-5 text-zinc-500">
              You explicitly say: <span className="font-mono text-zinc-700">“check my email”</span> or{" "}
              <span className="font-mono text-zinc-700">“apply to this link with my resume”</span> — Doppel opens a real browser and does it, while you watch the VNC replay.
            </p>
          </div>

          {/* Visual: browser / VNC mock */}
          <div className="relative">
            <div className="rounded-[20px] border border-zinc-200 bg-zinc-900 p-2 shadow-2xl">
              {/* browser chrome */}
              <div className="flex items-center justify-between rounded-t-[12px] bg-zinc-800 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
                  <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                  <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
                </div>
                <div className="flex items-center gap-2 rounded-full bg-zinc-700 px-3 py-1 text-[11px] text-zinc-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" /> solari stealth • us residential • captcha auto-solve
                </div>
                <span className="text-[10px] font-mono text-zinc-500">replay</span>
              </div>

              {/* page content */}
              <div className="rounded-b-[12px] bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-zinc-900">Execution log — agentTasks queue</div>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">running • step 4/15</span>
                </div>

                <div className="mt-3 space-y-2 font-mono text-[11px] leading-5">
                  <div className="flex gap-2">
                    <span className="text-zinc-400">›</span>
                    <span className="text-zinc-600">Navigated to Greenhouse • Senior Frontend — Linear</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-zinc-400">›</span>
                    <span className="text-zinc-600">Vision LLM (Sonnet 3.5): screenshot → DOM grounding → </span>
                    <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-white">click #apply-button</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-zinc-400">›</span>
                    <span className="bg-amber-100 px-1 text-amber-900">fill “Full name” with profile.fullName</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-zinc-400">›</span>
                    <span className="bg-sky-100 px-1 text-sky-900">upload resume.pdf from Convex file storage</span>
                  </div>
                  <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-2.5 text-zinc-500">
                    Next: cover letter generation via GPT-4o-mini using markdown context (LPD)
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { k: "Next.js", v: "Control Layer" },
                    { k: "Convex", v: "State & Queue" },
                    { k: "Solari", v: "Stealth Browser" },
                  ].map((s) => (
                    <div key={s.k} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-center">
                      <div className="text-[11px] font-semibold">{s.k}</div>
                      <div className="text-[10px] text-zinc-500">{s.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* floating cards */}
            <div className="absolute -bottom-6 -left-6 hidden rounded-xl border border-zinc-200 bg-white p-3 shadow-lg lg:block">
              <div className="text-[11px] font-medium text-zinc-900">“Check my email and reply to the recruiter from Stripe”</div>
              <div className="mt-1 text-[11px] text-zinc-500">→ Doppel reads inbox in Solari Gmail profile → drafts reply in your tone</div>
            </div>
            <div className="absolute -right-4 top-10 hidden rounded-xl border border-zinc-200 bg-white p-3 shadow-lg lg:block">
              <div className="text-[11px] font-medium text-zinc-900">“DM 20 design leads on LinkedIn”</div>
              <div className="mt-1 text-[11px] text-zinc-500">→ Vision + DOM loop with rate limits & human pacing</div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-widest text-zinc-500">HOW IT WORKS</h2>
          <p className="max-w-2xl text-[22px] font-semibold leading-tight tracking-tight">
            An autonomous execution loop. You command, Doppel executes in a real browser.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              n: "01",
              t: "Trigger in Next.js",
              d: "Dashboard task: paste a job link, say “apply”, or “check email”. Queued in Convex agentTasks with replayUrl slot.",
            },
            {
              n: "02",
              t: "Execute in Solari + Vision LLM",
              d: "Convex Action launches stealth Solari browser (profile-persistent, residential proxy, captcha solved). Sonnet 3.5 sees screenshot+DOM and decides click/fill/done.",
            },
            {
              n: "03",
              t: "Review & learn",
              d: "Session recording + logs stream back to Convex reactively. Your markdown profile is injected as context — no rigid schema, just LPD.",
            },
          ].map((c) => (
            <div key={c.n} className="rounded-2xl border border-zinc-200 bg-white p-6">
              <div className="text-xs font-mono text-zinc-400">{c.n}</div>
              <div className="mt-2 text-[15px] font-semibold">{c.t}</div>
              <div className="mt-2 text-sm leading-6 text-zinc-600">{c.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="border-y border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="text-sm font-semibold tracking-widest text-zinc-500">CAPABILITIES</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Job applications", desc: "Paste any Greenhouse/Lever/Ashby link. Doppel fills forms, uploads resume, writes cover letter from your markdown context.", tag: "apply_job" },
              { title: "Inbox autopilot", desc: "“Check my email” → triages Gmail via browser, drafts replies to recruiters in your tone. You approve or auto-send.", tag: "reply_email" },
              { title: "LinkedIn outreach", desc: "DM prospects, comment, connect — vision-grounded clicks, human pacing, profile-persistent Solari session.", tag: "linkedin_dm" },
              { title: "X / Twitter ops", desc: "Post, reply, DM. Scheduled loops with VNC replay so you audit every action.", tag: "twitter_dm" },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-zinc-200 bg-[#fafaf9] p-5">
                <div className="inline-flex rounded-full bg-white px-2 py-1 text-[10px] font-mono text-zinc-600 border border-zinc-200">{f.tag}</div>
                <div className="mt-3 text-sm font-semibold">{f.title}</div>
                <div className="mt-1.5 text-sm leading-6 text-zinc-600">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PERSONA TEASER */}
      <section className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="rounded-[24px] border border-zinc-200 bg-zinc-900 p-1">
          <div className="rounded-[18px] bg-white p-6 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-xl font-semibold tracking-tight">Tailored onboarding</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
                  First question: are you a <span className="font-medium text-zinc-900">Student</span> or a{" "}
                  <span className="font-medium text-zinc-900">Working Professional</span>? The entire flow adapts — resume & social graph for job seeking, inbox & calendar primacy for operators. One paragraph about you becomes your markdown context for every LLM decision.
                </p>
              </div>
              <OpenDoppelCta doneLabel="Open dashboard" newLabel="Start onboarding — 2 min" />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <div className="text-xs font-semibold tracking-widest text-zinc-500">FOR STUDENTS</div>
                <div className="mt-2 text-sm font-semibold">Land the job</div>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-6 text-zinc-600">
                  <li>Resume upload → stored as markdown + file, injected LPD</li>
                  <li>Connect LinkedIn / GitHub / X (Solari profiles)</li>
                  <li>Auto-apply + recruiter DM templates tuned for entry roles</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <div className="text-xs font-semibold tracking-widest text-zinc-500">FOR PROFESSIONALS</div>
                <div className="mt-2 text-sm font-semibold">Run your professional life</div>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-6 text-zinc-600">
                  <li>Gmail + Calendar primacy — triage, reply, schedule</li>
                  <li>LinkedIn/Twitter network management</li>
                  <li>Client outreach & interview scheduling on autopilot</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ARCHITECTURE */}
      <section id="architecture" className="border-t border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs font-mono text-zinc-500">ARCHITECTURE — Next.js · ConvexDB · Solari · Claude 3.5 Sonnet</div>
            <div className="text-xs text-zinc-500">Hardware-isolated microVMs • One API key • Session recording</div>
          </div>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-6 py-8 text-xs leading-6 text-zinc-500">
        <div className="flex flex-col justify-between gap-4 border-t border-zinc-200 pt-6 sm:flex-row">
          <span>© {new Date().getFullYear()} Doppel. Not a replacement — a professional doppelgänger you explicitly command.</span>
          <span className="font-mono">npm install @solarisdk/browser @solarisdk/desktop @solarisdk/sandbox</span>
        </div>
      </footer>
    </div>
  );
}
