"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser, UserButton, Show } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";

type Role = "student" | "professional" | null;
type Links = { linkedin: string; github: string; twitter: string; portfolio: string };
type Preferences = { tone: string; targetRoles: string; locations: string; emailVolume: string };

const LINK_FIELDS: Array<{ key: keyof Links; label: string; placeholder: string }> = [
  { key: "linkedin", label: "LinkedIn URL", placeholder: "https://linkedin.com/in/you" },
  { key: "github", label: "GitHub URL", placeholder: "https://github.com/you" },
  { key: "twitter", label: "X / Twitter", placeholder: "https://x.com/you" },
  { key: "portfolio", label: "Portfolio", placeholder: "https://you.dev" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

  // Convex
  const existing = useQuery(api.profiles.getMyProfile, isAuthenticated ? {} : "skip");
  // Auto-redirect if already onboarded — edit via /settings instead
  useEffect(() => {
    if (!authLoading && isAuthenticated && existing) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, existing, router]);
  const generateUploadUrl = useMutation(api.profiles.generateUploadUrl);
  const saveProfile = useMutation(api.profiles.saveProfile);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<Role>(null);
  const [bio, setBio] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [links, setLinks] = useState<Links>({ linkedin: "", github: "", twitter: "", portfolio: "" });
  const [prefs, setPrefs] = useState<Preferences>({
    tone: "direct",
    targetRoles: "",
    locations: "",
    emailVolume: "high",
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);


  // Prefill from existing profile
  // This effect hydrates an async Convex query into the editable local draft.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!existing) return;
    // The query loads after the first render, so hydrate the local draft once it is available.
    setRole(existing.role);
    setBio(existing.bio);
    setLinks(existing.links);
    setPrefs(existing.preferences);
    setResumeName(existing.resumeFileName ?? null);
  }, [existing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const canContinueStep1 = role !== null;
  const canContinueStep2 = bio.trim().length > 40;

  function next() {
    if (step === 1 && canContinueStep1) setStep(2);
    else if (step === 2 && canContinueStep2) setStep(3);
  }
  function back() {
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
  }

  function handleResume(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10_000_000) {
      setError("Resume must be smaller than 10 MB");
      return;
    }
    setError(null);
    setResumeFile(f);
    setResumeName(f.name);
  }

  const markdownPreview = `# ${user?.fullName ?? existing?.markdown?.split("\n")[0]?.replace("# ", "") ?? "Your"} — ${role === "student" ? "Student" : role === "professional" ? "Professional" : "Profile"} Context

## Bio
${bio || "_No bio yet_ — add a paragraph covering GitHub, LinkedIn, X, projects, work, goals._"}

## Links
- LinkedIn: ${links.linkedin || "—"}
- GitHub: ${links.github || "—"}
- Twitter/X: ${links.twitter || "—"}
- Portfolio: ${links.portfolio || "—"}
${resumeName ? `- Resume: ${resumeName} (uploaded, will be stored alongside markdown)` : "- Resume: —"}

## Preferences
- Tone: ${prefs.tone}
- Target roles: ${prefs.targetRoles || "—"}
- Preferred locations: ${prefs.locations || "—"}
${role === "professional" ? `- Email volume: ${prefs.emailVolume}` : ""}
`;

  async function uploadFileToConvex(file: Blob, contentType: string) {
    const uploadUrl = await generateUploadUrl({});
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
    const { storageId } = await res.json();
    return storageId as string;
  }

  async function handleSubmit() {
    if (!role) {
      setError("Select a role first");
      return;
    }
    if (bio.trim().length < 40) {
      setError("Bio paragraph must be at least 40 characters");
      return;
    }
    if (!isAuthenticated) {
      setError("Not authenticated with Convex — wait for auth sync");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      // 1. Upload resume if present
      let resumeStorageId: Id<"_storage"> | undefined = undefined;
      if (resumeFile) {
        const id = await uploadFileToConvex(resumeFile, resumeFile.type || "application/pdf");
        resumeStorageId = id as Id<"_storage">;
      } else if (existing?.resumeStorageId) {
        // keep existing if user didn't re-upload
        resumeStorageId = existing.resumeStorageId;
      }

      // 2. Upload markdown file
      const markdownBlob = new Blob([markdownPreview], { type: "text/markdown" });
      const markdownStorageId = await uploadFileToConvex(markdownBlob, "text/markdown");

      // 3. Save profile (upserts users + profiles)
      await saveProfile({
        role,
        bio,
        markdown: markdownPreview,
        markdownStorageId: markdownStorageId as Id<"_storage">,
        resumeStorageId,
        resumeFileName: resumeName ?? undefined,
        links: {
          linkedin: links.linkedin,
          github: links.github,
          twitter: links.twitter,
          portfolio: links.portfolio,
        },
        preferences: {
          tone: prefs.tone,
          targetRoles: prefs.targetRoles,
          locations: prefs.locations,
          emailVolume: prefs.emailVolume,
        },
      });

      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save — check Convex logs");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Must be before any early return — Rules of Hooks
  const profileWithUrls = useQuery(api.profiles.getMyProfileWithUrls, isAuthenticated ? {} : "skip");

  // Auth gating — Convex auth must be ready; Clerk middleware already protects route
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf9] grid place-items-center p-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Syncing Clerk → Convex…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafaf9]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white">D.</div>
            <span className="text-sm font-semibold text-zinc-900">Doppel</span>
            <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[10px] font-bold tracking-widest text-zinc-700">
              ONBOARDING
            </span>
          </Link>
          <div className="flex items-center gap-3 text-xs font-bold text-zinc-900">
            {existing && (
              <Link href="/dashboard" className="hidden sm:inline-flex items-center rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-black">
                Go to Dashboard →
              </Link>
            )}
            <span className="hidden sm:inline">Step {step} of 3</span>
            <div className="flex gap-1.5">
              {[1, 2, 3].map((s) => (
                <span
                  key={s}
                  className={`h-1.5 w-8 rounded-full transition ${s <= step ? "bg-zinc-900" : "bg-zinc-200"} ${s === step ? "opacity-100" : s < step ? "opacity-60" : ""}`}
                />
              ))}
            </div>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </div>
      </div>

      {!isAuthenticated && !authLoading && (
        <div className="mx-auto max-w-5xl px-6 pt-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <div className="font-medium">Workspace authentication is still syncing</div>
            <div className="mt-1">Refresh after signing in. If this persists, verify the Clerk <code className="rounded bg-amber-100 px-1">convex</code> JWT template and the issuer configured for this Convex deployment.</div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-6 py-8 sm:py-10">
        {!submitted ? (
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            {/* LEFT: wizard */}
            <div className="rounded-[24px] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              {step === 1 && (
                <div>
                  {existing && (
                    <div className="mb-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-bold text-emerald-900">✓ You’ve already completed onboarding — your Doppel is ready.</div>
                      <Link href="/dashboard" className="shrink-0 inline-flex items-center justify-center rounded-full bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700">Go to Dashboard →</Link>
                    </div>
                  )}
                  <div className="inline-flex rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-bold tracking-wide text-zinc-800">
                    Tell us who you are — this tailors everything
                  </div>
                  <h1 className="mt-4 text-[28px] font-bold leading-none tracking-tight text-zinc-900">Are you a student or a working professional?</h1>
                  <p className="mt-3 max-w-xl text-sm leading-6 font-medium text-zinc-700">
                    We tailor the entire Doppel experience based on this. Students get resume-first, job-landing flows. Professionals get inbox, scheduling, and network management as primary.
                  </p>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <button
                      onClick={() => setRole("student")}
                      className={`group text-left rounded-2xl border-2 p-5 transition ${role === "student" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"}`}
                    >
                      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${role === "student" ? "bg-white text-zinc-900" : "bg-white border border-zinc-200"}`}>
                        <span className="text-sm">🎓</span>
                      </div>
                      <div className={`mt-3 text-sm font-semibold ${role === "student" ? "text-white" : "text-zinc-900"}`}>Student</div>
                      <div className={`mt-1 text-xs leading-5 ${role === "student" ? "text-zinc-300" : "text-zinc-600"}`}>
                        Priority: resume, GitHub/LinkedIn, landing your first / next role. Auto-apply + outreach tuned for entry & internships.
                      </div>
                      <div className={`mt-3 text-xs font-medium ${role === "student" ? "text-white" : "text-zinc-900"}`}>
                        • Resume upload → markdown context<br />• Social graph connect<br />• Target roles & locations
                      </div>
                      {role === "student" && <div className="mt-3 text-xs font-mono text-zinc-300">✓ Selected</div>}
                    </button>

                    <button
                      onClick={() => setRole("professional")}
                      className={`group text-left rounded-2xl border-2 p-5 transition ${role === "professional" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"}`}
                    >
                      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${role === "professional" ? "bg-white text-zinc-900" : "bg-white border border-zinc-200"}`}>
                        <span className="text-sm">💼</span>
                      </div>
                      <div className={`mt-3 text-sm font-semibold ${role === "professional" ? "text-white" : "text-zinc-900"}`}>Working Professional</div>
                      <div className={`mt-1 text-xs leading-5 ${role === "professional" ? "text-zinc-300" : "text-zinc-600"}`}>
                        Priority: Gmail, calendar, LinkedIn/X network. Triage, reply, schedule — Doppel runs your professional OS.
                      </div>
                      <div className={`mt-3 text-xs font-medium ${role === "professional" ? "text-white" : "text-zinc-900"}`}>
                        • Inbox & scheduling primacy<br />• Client & recruiter replies<br />• Network nurturing
                      </div>
                      {role === "professional" && <div className="mt-3 text-xs font-mono text-zinc-300">✓ Selected</div>}
                    </button>
                  </div>

                  {existing && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                      Existing profile found for <b>{existing.role}</b> — you can change it and resave. Last updated {new Date(existing.updatedAt).toLocaleString()}.
                    </div>
                  )}

                  <div className="mt-6 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Link href="/" className="text-sm font-bold text-zinc-600 hover:text-zinc-900">
                        ← Back to landing
                      </Link>
                      {existing && (
                        <Link href="/dashboard" className="text-sm font-bold text-emerald-700 hover:text-emerald-900">
                          Skip to Dashboard →
                        </Link>
                      )}
                    </div>
                    <button
                      onClick={next}
                      disabled={!canContinueStep1}
                      className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black"
                    >
                      {existing ? "Edit profile →" : "Continue"}
                    </button>
                  </div>
                  {!canContinueStep1 && <p className="mt-3 text-xs font-bold text-amber-700">Select one to continue — this changes step 2 & 3.</p>}
                </div>
              )}

              {step === 2 && (
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-800">
                    <span className={`h-2 w-2 rounded-full ${role === "student" ? "bg-sky-500" : "bg-violet-500"}`} />
                    {role === "student" ? "Student profile — one paragraph is enough" : "Professional profile — one paragraph is enough"}
                  </div>
                  <h2 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900">
                    {role === "student" ? "Tell Doppel everything about you" : "Tell Doppel how you work"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 font-medium text-zinc-700">
                    {role === "student"
                      ? "Write a single paragraph covering your GitHub, LinkedIn, X, projects, stack, university, graduation year, interests, and what roles you want. We turn this into a markdown file stored on Convex and inject it LPD to the LLM on every task."
                      : "Write a single paragraph covering your current role, company, expertise, GitHub/LinkedIn/X, how you want emails handled, tone, and what you want Doppel to automate (triage, scheduling, outreach). One markdown file, injected every run."}
                  </p>

                  <div className="mt-5">
                    <label className="text-xs font-semibold tracking-widest text-zinc-500">YOUR PARAGRAPH — THIS BECOMES YOUR MARKDOWN CONTEXT</label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder={
                        role === "student"
                          ? "Example: I'm a 3rd-year CS student at BITS Pilani (2026), passionate about frontend and AI agents. GitHub: github.com/you — 400+ commits, built a browser agent with Playwright + Solari, Next.js dashboard. LinkedIn: linkedin.com/in/you, X: @you. Projects: Doppel clone, resume parser. Seeking SWE internships in Bangalore/Remote, React/TS, love design systems, want Doppel to auto-apply and DM hiring managers in my voice (direct, concise)..."
                          : "Example: I'm a Product Engineer at Linear, 4 years experience — React, TypeScript, systems design. GitHub: github.com/you, LinkedIn: linkedin.com/in/you, X: @you. I get 80+ emails/day from recruiters/clients, want Doppel to triage, reply in formal-but-warm tone, schedule interviews via calendar, and nurture my LinkedIn network with thoughtful DMs. Prefer US hours, avoid spammy outreach..."
                      }
                      rows={8}
                      className="mt-2 w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none"
                    />
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className={bio.trim().length < 40 ? "text-amber-600" : "text-zinc-500"}>
                        {bio.trim().length < 40 ? `Add a bit more — ${bio.trim().length}/40 chars min` : `${bio.trim().length} chars • Ready`}
                      </span>
                      <span className="font-mono text-zinc-400">markdown • LPD</span>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-dashed border-zinc-200 bg-[#fcfcfc] p-5">
                    <div className="text-xs font-semibold tracking-widest text-zinc-500">
                      {role === "student" ? "OPTIONAL — ENHANCE YOUR MARKDOWN (TAILORED FOR STUDENTS)" : "OPTIONAL — ENHANCE YOUR MARKDOWN (TAILORED FOR PROFESSIONALS)"}
                    </div>

                    {role === "student" ? (
                      <div className="mt-4 grid gap-4">
                        <div>
                          <label className="text-xs font-medium text-zinc-700">Resume (PDF) — stored alongside markdown</label>
                          <label className="mt-1.5 flex cursor-pointer items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50">
                            <span className="text-zinc-600">{resumeName ? `✓ ${resumeName}` : "Click to upload resume.pdf"}</span>
                            <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white">Choose file</span>
                            <input type="file" accept=".pdf,.doc,.docx,.md" className="hidden" onChange={handleResume} />
                          </label>
                          <p className="mt-1 text-xs text-zinc-500">Stored in Convex file storage — linked via <code className="rounded bg-zinc-100 px-1">resumeStorageId</code>.</p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          {LINK_FIELDS.map((f) => (
                            <div key={f.key}>
                              <label className="text-xs font-medium text-zinc-700">{f.label}</label>
                              <input
                                value={links[f.key]}
                                onChange={(e) => setLinks({ ...links, [f.key]: e.target.value })}
                                placeholder={f.placeholder}
                                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                              />
                            </div>
                          ))}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="text-xs font-medium text-zinc-700">Target roles</label>
                            <input
                              value={prefs.targetRoles}
                              onChange={(e) => setPrefs({ ...prefs, targetRoles: e.target.value })}
                              placeholder="SWE Intern, Frontend, AI Engineer"
                              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-zinc-700">Preferred locations</label>
                            <input
                              value={prefs.locations}
                              onChange={(e) => setPrefs({ ...prefs, locations: e.target.value })}
                              placeholder="Bangalore, Remote, US"
                              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-zinc-700">Outreach tone</label>
                          <div className="mt-1.5 flex gap-2">
                            {["formal", "casual", "direct"].map((t) => (
                              <button
                                key={t}
                                onClick={() => setPrefs({ ...prefs, tone: t })}
                                className={`rounded-full border px-4 py-1.5 text-xs font-medium capitalize ${prefs.tone === t ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"}`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="text-xs font-medium text-zinc-700">LinkedIn URL</label>
                            <input
                              value={links.linkedin}
                              onChange={(e) => setLinks({ ...links, linkedin: e.target.value })}
                              placeholder="https://linkedin.com/in/you"
                              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-zinc-700">X / Twitter</label>
                            <input
                              value={links.twitter}
                              onChange={(e) => setLinks({ ...links, twitter: e.target.value })}
                              placeholder="https://x.com/you"
                              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="text-xs font-medium text-zinc-700">Professional tone</label>
                            <div className="mt-1.5 flex gap-2">
                              {["formal", "casual", "direct"].map((t) => (
                                <button
                                  key={t}
                                  onClick={() => setPrefs({ ...prefs, tone: t })}
                                  className={`rounded-full border px-4 py-1.5 text-xs font-medium capitalize ${prefs.tone === t ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"}`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-zinc-700">Inbox volume</label>
                            <select
                              value={prefs.emailVolume}
                              onChange={(e) => setPrefs({ ...prefs, emailVolume: e.target.value })}
                              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:border-zinc-400 focus:outline-none"
                            >
                              <option value="low">Low — I check manually</option>
                              <option value="medium">Medium — 20-50/day</option>
                              <option value="high">High — 80+/day, need triage</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-zinc-700">Portfolio</label>
                          <input
                            value={links.portfolio}
                            onChange={(e) => setLinks({ ...links, portfolio: e.target.value })}
                            placeholder="https://you.dev"
                            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">{error}</div>}

                  <div className="mt-6 flex items-center justify-between">
                    <button onClick={back} className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
                      ← Back
                    </button>
                    <button
                      onClick={next}
                      disabled={!canContinueStep2}
                      className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black"
                    >
                      Continue to review
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">Review • then Doppel takes over</div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight">Review your Doppel context</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    Stored as <span className="font-mono text-zinc-900">.md</span> in Convex file storage (<code className="rounded bg-zinc-100 px-1">_storage</code>) + linked in <code className="rounded bg-zinc-100 px-1">profiles</code>. Injected LPD to Solari + Vision LLM.
                  </p>

                  <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-900 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-mono text-zinc-400">convex file storage • {isAuthenticated ? "Convex auth ✓" : "Convex auth pending"}</div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${role === "student" ? "bg-sky-500 text-white" : "bg-violet-500 text-white"}`}>
                        {role === "student" ? "STUDENT" : "PROFESSIONAL"}
                      </span>
                    </div>
                    <pre className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-zinc-100">
                      {markdownPreview}
                    </pre>
                  </div>

                  {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">{error}</div>}
                  {profileWithUrls?.markdownUrl && (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs">
                      Existing markdown file: <a href={profileWithUrls.markdownUrl} target="_blank" className="underline">View stored .md</a>
                    </div>
                  )}

                  <div className="mt-6 flex items-center justify-between">
                    <button onClick={back} className="text-sm font-medium text-zinc-600 hover:text-zinc-900" disabled={isSubmitting}>
                      ← Edit
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={isSubmitting || !isAuthenticated}
                      className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? "Uploading to Convex…" : "Create my Doppel →"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: context helper */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="text-xs font-semibold tracking-widest text-zinc-500">WHAT HAPPENS ON SUBMIT</div>
                <ol className="mt-3 space-y-3 text-sm leading-6 text-zinc-600">
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white">1</span>
                    <span>
                      Markdown is uploaded as <code className="rounded bg-zinc-100 px-1">text/markdown</code> blob via <code className="rounded bg-zinc-100 px-1">generateUploadUrl</code> → stored as <code className="rounded bg-zinc-100 px-1">_storage</code> ID.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white">2</span>
                    <span>
                      Resume (if any) uploaded same way → <code className="rounded bg-zinc-100 px-1">resumeStorageId</code>.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white">3</span>
                    <span>
                      <code className="rounded bg-zinc-100 px-1">profiles.saveProfile</code> upserts <code className="rounded bg-zinc-100 px-1">users</code> + <code className="rounded bg-zinc-100 px-1">profiles</code> with file IDs — retrievable via <code className="rounded bg-zinc-100 px-1">getMyProfileWithUrls</code> for LPD injection.
                    </span>
                  </li>
                </ol>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-900 p-5 text-white">
                <div className="text-xs font-semibold tracking-widest text-zinc-400">ARCHITECTURE</div>
                <div className="mt-3 space-y-2 font-mono text-xs leading-5 text-zinc-300">
                  <div>Next.js — Control layer & VNC embeds</div>
                  <div>Convex — Reactive DB + file storage + queue</div>
                  <div>Solari — Stealth Chrome, proxy, captcha, profiles</div>
                  <div>Claude 3.5 Sonnet — Vision + DOM grounding</div>
                </div>
                <div className="mt-4 rounded-xl bg-white/10 p-3 text-xs leading-5 text-zinc-200">
                  Your paragraph is the single source of truth — no rigid <code className="rounded bg-white/20 px-1">workHistory</code> table, just markdown retrieved LPD.
                </div>
              </div>

              {user && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <div className="text-xs font-semibold tracking-widest text-zinc-500">SIGNED IN AS</div>
                  <div className="mt-2 text-sm font-medium">{user.fullName ?? user.primaryEmailAddress?.emailAddress}</div>
                  <div className="text-xs text-zinc-500">{user.primaryEmailAddress?.emailAddress}</div>
                  <div className="mt-2 text-xs text-zinc-500">Convex identity: {isAuthenticated ? "synced ✓" : "pending"} • clerkId: {user.id}</div>
                  {existing && <div className="mt-2 text-xs text-emerald-600">Profile exists — submit will update it.</div>}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl rounded-[24px] border border-zinc-300 bg-white p-8 text-center shadow-md">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">✓</div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900">Your Doppel is ready</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 font-medium text-zinc-800">
              Saved to Convex: <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-white">profiles</code> + file in <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-white">_storage</code>. Fetch via <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-white">getMyProfileWithUrls</code> for LLM LPD injection.
            </p>

            <div className="mt-6 text-left rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-inner">
              <div className="text-xs font-mono font-bold uppercase tracking-widest text-emerald-400">stored markdown — convex file storage ✓</div>
              <pre className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-zinc-50">
                {markdownPreview}
              </pre>
            </div>

            {profileWithUrls?.markdownUrl && (
              <div className="mt-4 rounded-xl border border-zinc-300 bg-white p-3 text-xs font-medium text-zinc-900 shadow-sm">
                <a href={profileWithUrls.markdownUrl} target="_blank" className="font-bold text-zinc-900 underline decoration-2 underline-offset-4 hover:text-black">
                  Open stored markdown file →
                </a>
                {profileWithUrls.resumeUrl && (
                  <a href={profileWithUrls.resumeUrl} target="_blank" className="ml-4 font-bold text-zinc-900 underline decoration-2 underline-offset-4 hover:text-black">
                    Open resume file →
                  </a>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-full bg-emerald-600 px-8 text-sm font-bold text-white shadow hover:bg-emerald-700">
                Go to Dashboard →
              </Link>
              <button
                onClick={() => setSubmitted(false)}
                className="inline-flex h-10 items-center justify-center rounded-full border-2 border-zinc-900 bg-white px-6 text-sm font-bold text-zinc-900 hover:bg-zinc-100"
              >
                Edit onboarding
              </button>
              <Link href="/" className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 bg-white px-6 text-sm font-bold text-zinc-700 hover:bg-zinc-50">
                Back to landing
              </Link>
            </div>

            <p className="mt-4 text-xs font-medium text-zinc-700">Your responses stream via Vercel AI Gateway in the dashboard — this is your main workspace.</p>
          </div>
        )}
      </main>
    </div>
  );
}
