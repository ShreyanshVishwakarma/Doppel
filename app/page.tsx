import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { OpenDoppelCta } from "@/components/open-doppel-cta";
import { WaitlistForm } from "@/components/waitlist-form";

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FAQ_ITEMS = [
  {
    q: "Will my accounts get banned for automating?",
    a: "Any automation carries some risk, and no honest tool can promise zero. Doppel reduces it where it can: you automate your own accounts from persistent logged-in sessions, actions are paced like a human, and you choose exactly what runs. Start small, review replays, and avoid bulk actions on sites that are strict about automation.",
  },
  {
    q: "What does it cost?",
    a: "Doppel is free during the private beta. Browser sessions run on metered cloud infrastructure, so heavy usage may become a paid tier later. You'll always know before a task runs.",
  },
  {
    q: "Do you see my passwords?",
    a: "No. You log into each site on a secure hosted page, the same way you'd log in yourself. Only the resulting login session (cookies) is stored, attached to your account. Your credentials never pass through Doppel or appear in any log.",
  },
  {
    q: "Which sites does it work with?",
    a: "Gmail, LinkedIn, X/Twitter, and GitHub are built in. It also works on any public website: job boards, application forms, company sites. If you can do it in a browser, Doppel can attempt it.",
  },
  {
    q: "Can I cancel or stop a task halfway?",
    a: "Yes. Every running task has a Stop button that kills the browser session immediately. Nothing continues in the background. And since Doppel is free in beta, there's no subscription to cancel.",
  },
  {
    q: "What happens if my login expires?",
    a: "The run stops and tells you exactly which account needs attention. Click Log in again in Settings. It takes about 30 seconds, and you're back.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[#fafaf9] text-stone-900">
      {/* NAV */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-[64px] max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-[13px] font-bold tracking-tight text-white">D.</div>
            <span className="text-[16px] font-semibold tracking-tight">Doppel</span>
            <span className="hidden rounded-full bg-stone-900 px-2 py-0.5 text-[10px] font-medium tracking-widest text-white sm:inline">BETA</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-stone-600 md:flex">
            <a href="#how-it-works" className="transition hover:text-stone-900">How it works</a>
            <a href="#capabilities" className="transition hover:text-stone-900">Capabilities</a>
            <a href="#faq" className="transition hover:text-stone-900">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="hidden text-sm font-medium text-stone-600 transition hover:text-stone-900 sm:inline">Sign in</button>
              </SignInButton>
              <a href="#waitlist" className="inline-flex h-9 items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-medium text-white transition hover:bg-stone-800 active:scale-[0.98]">
                Join Private Beta
              </a>
            </Show>
            <Show when="signed-in">
              <OpenDoppelCta />
              <UserButton />
            </Show>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-stone-200 bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />

        <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-600">
              <span className="h-2 w-2 rounded-full bg-stone-400" />
              Private beta now open. Invites go out weekly.
            </div>

            <h1 className="mt-6 text-[38px] font-[650] leading-[0.98] tracking-[-0.04em] [text-wrap:balance] sm:text-[52px]">
              Your professional
              <br />
              <span className="bg-gradient-to-r from-stone-900 via-stone-700 to-stone-400 bg-clip-text text-transparent">doppelgänger.</span>
            </h1>

            <p className="mt-5 max-w-[54ch] text-[18px] leading-7 text-stone-600">
              Doppel uses Gmail, LinkedIn, X and any website the way you do: it opens a{" "}
              <em className="font-medium not-italic text-stone-900">real browser, logged in as you</em>, and handles whatever you keep repeating. Job applications, recruiter replies, research, data entry. If a browser can do it, Doppel can do it while you watch.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Show when="signed-out">
                <a href="#waitlist" className="inline-flex h-11 items-center gap-2 rounded-full bg-stone-900 px-6 text-sm font-medium text-white shadow-sm transition hover:bg-black active:scale-[0.98]">
                  Start Automating Free <ArrowRight />
                </a>
                <SignUpButton mode="modal">
                  <button className="inline-flex h-11 items-center justify-center rounded-full border border-stone-200 bg-white px-6 text-sm font-medium transition hover:bg-stone-50 active:scale-[0.98]">
                    Create account
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <OpenDoppelCta variant="hero" />
              </Show>
            </div>

            <p className="mt-3 text-xs leading-5 text-stone-500">
              Free during private beta • No credit card required • 30-second setup
            </p>

            <Show when="signed-out">
              <div className="mt-6 w-full max-w-md">
                <WaitlistForm compact />
                <p className="mt-2 text-xs text-stone-500">Have an invite? <SignInButton mode="modal"><button className="font-medium underline underline-offset-2 hover:text-stone-900">Sign in</button></SignInButton></p>
              </div>
            </Show>

            <p className="mt-6 max-w-[48ch] text-xs leading-5 text-stone-500">
              You say: <span className="font-mono text-stone-700">“check my email”</span> or{" "}
              <span className="font-mono text-stone-700">“apply to this job with my resume”</span>. Doppel opens a real browser and does it, while you watch.
            </p>
          </div>

          {/* Browser execution preview */}
          <div className="relative">
            <div className="rounded-[20px] border border-stone-200 bg-stone-900 p-2 shadow-2xl">
              <div className="flex items-center justify-between rounded-t-[12px] bg-stone-800 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
                  <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                  <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
                </div>
                <div className="flex items-center gap-2 rounded-full bg-stone-700 px-3 py-1 text-[11px] text-stone-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" /> logged in as you
                </div>
                <span className="text-[10px] font-mono text-stone-500">replay</span>
              </div>

              <div className="rounded-b-[12px] bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-stone-900">Doppel is working</div>
                  <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-medium text-stone-600">step 4/15</span>
                </div>

                <div className="mt-3 space-y-2 font-mono text-[11px] leading-5">
                  <div className="flex gap-2">
                    <span className="text-stone-400">›</span>
                    <span className="text-stone-600">Opening Gmail, already signed in</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-stone-400">›</span>
                    <span className="text-stone-600">Reading inbox, 3 new recruiter emails</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-stone-400">›</span>
                    <span className="rounded bg-stone-900 px-1.5 py-0.5 text-white">drafting reply in your tone</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-stone-400">›</span>
                    <span className="bg-amber-100 px-1 text-amber-900">uploading resume.pdf to the application form</span>
                  </div>
                  <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50 p-2.5 text-stone-500">
                    Next: applying to Senior Frontend at Linear
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-6 -left-6 hidden rounded-xl border border-stone-200 bg-white p-3 shadow-lg lg:block">
              <div className="text-[11px] font-medium text-stone-900">“Check my email and reply to the recruiter from Stripe”</div>
              <div className="mt-1 text-[11px] text-stone-500">→ Doppel reads the inbox, drafts the reply in your tone</div>
            </div>
            <div className="absolute -right-4 top-10 hidden rounded-xl border border-stone-200 bg-white p-3 shadow-lg lg:block">
              <div className="text-[11px] font-medium text-stone-900">“Apply to 10 jobs with my resume”</div>
              <div className="mt-1 text-[11px] text-stone-500">→ forms filled, resume attached, paced like a human</div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="border-y border-stone-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold tracking-widest text-stone-500">HOW IT WORKS</h2>
            <p className="max-w-2xl text-[24px] font-semibold leading-tight tracking-tight">Three steps. Set up once, then just say what you need.</p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                n: "01",
                t: "Connect accounts once",
                d: "Log into Gmail, LinkedIn or X through a secure hosted page. 30 seconds, one time. Doppel never sees your password.",
              },
              {
                n: "02",
                t: "Describe what you need",
                d: "“Check my inbox and reply to the recruiter from Stripe.” “Apply to 10 jobs with my resume.” Plain language, no setup.",
              },
              {
                n: "03",
                t: "Watch it happen, stop anytime",
                d: "Every browser action streams live to your dashboard. Every run has a video replay. One click stops the agent instantly.",
              },
            ].map((c) => (
              <div key={c.n} className="rounded-2xl border border-stone-200 bg-[#fafaf9] p-6">
                <div className="text-xs font-mono text-stone-400">{c.n}</div>
                <div className="mt-2 text-[16px] font-semibold">{c.t}</div>
                <div className="mt-2 text-[15px] leading-6 text-stone-600">{c.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section id="capabilities" className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-widest text-stone-500">CAPABILITIES</h2>
          <p className="max-w-2xl text-[24px] font-semibold leading-tight tracking-tight">Built for the tasks you dread repeating.</p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M2 6h14M6 10h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              ),
              title: "Job applications",
              desc: "Paste any job link. Doppel fills the form, uploads your resume, and tailors the answers.",
            },
            {
              icon: (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <rect x="1.5" y="3.5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M2 5l7 5 7-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ),
              title: "Inbox autopilot",
              desc: "Triage your Gmail, draft recruiter replies in your tone, and only send what you approve.",
            },
            {
              icon: (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <circle cx="6.5" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                  <circle cx="13" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M2 15c.5-2.5 2.3-4 4.5-4s4 1.5 4.5 4M11.5 12.5c.4-1 1.2-1.6 2.2-1.6 1 0 1.9.6 2.3 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              ),
              title: "LinkedIn outreach",
              desc: "DM prospects and ask for referrals, paced like a human, from a session that stays logged in.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-stone-200 bg-white p-6 transition hover:border-stone-300">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700">{f.icon}</div>
              <div className="mt-4 text-[16px] font-semibold">{f.title}</div>
              <div className="mt-1.5 text-[15px] leading-6 text-stone-600">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ ACCORDION */}
      <section id="faq" className="border-y border-stone-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="flex flex-col gap-2 text-center">
            <h2 className="text-sm font-semibold tracking-widest text-stone-500">FAQ</h2>
            <p className="text-[24px] font-semibold leading-tight tracking-tight">Straight answers, no fine print.</p>
          </div>

          <div className="mt-8 divide-y divide-stone-200 rounded-2xl border border-stone-200">
            {FAQ_ITEMS.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[16px] font-medium text-stone-900 transition hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0 text-stone-400 transition-transform duration-200 group-open:rotate-180">
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <p className="px-5 pb-5 text-[15px] leading-6 text-stone-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA + WAITLIST */}
      <section id="waitlist" className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="relative overflow-hidden rounded-[24px] border border-stone-900 bg-stone-900 p-8 text-center sm:p-12">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:32px_32px]" />
          <div className="relative mx-auto max-w-xl">
            <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-white [text-wrap:balance] sm:text-[32px]">
              Your next batch of outreach runs itself.
            </h2>
            <p className="mt-3 text-[15px] leading-6 text-stone-300">
              Join the private beta and be first in line, or create an account and start automating right now.
            </p>
            <div className="mx-auto mt-7 max-w-md">
              <WaitlistForm />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Show when="signed-out">
                <SignUpButton mode="modal">
                  <button className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-stone-900 transition hover:bg-stone-100 active:scale-[0.98]">
                    Create free account <ArrowRight />
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <OpenDoppelCta doneLabel="Open Doppel" newLabel="Start onboarding, 2 min" />
              </Show>
            </div>
            <p className="mt-4 text-xs text-stone-400">Free during private beta • No credit card required • Stop any task anytime</p>
          </div>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-6 pb-8 text-xs leading-6 text-stone-500">
        <div className="flex flex-col justify-between gap-4 border-t border-stone-200 pt-6 sm:flex-row">
          <span>© {new Date().getFullYear()} Doppel. Not a replacement. A professional doppelgänger you explicitly command.</span>
          <span>You approve every capability you enable. Automate responsibly and within each platform's terms.</span>
        </div>
      </footer>
    </div>
  );
}
