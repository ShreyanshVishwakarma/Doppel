"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useUser, UserButton } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";

type Links = { linkedin: string; github: string; twitter: string; portfolio: string };
type Preferences = { tone: string; targetRoles: string; locations: string; emailVolume: string };
type Tab = "logins" | "profile" | "markdown";

const PLATFORMS = [
  { id: "gmail", label: "Gmail", domain: "mail.google.com", desc: "Inbox triage, draft replies, approve to send. Needs Google login.", icon: "✉" },
  { id: "linkedin", label: "LinkedIn", domain: "linkedin.com", desc: "DM prospects, connect, comment — stays logged in across runs.", icon: "in" },
  { id: "twitter", label: "X / Twitter", domain: "x.com", desc: "Post, reply, DM. Profiles keep cookies.", icon: "𝕏" },
  { id: "github", label: "GitHub", domain: "github.com", desc: "Used for profile scraping fallback (usually no login needed).", icon: "⌥" },
] as const;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "logins", label: "Logins" },
  { id: "profile", label: "Profile" },
  { id: "markdown", label: "Markdown context" },
];

export default function SettingsPage() {
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.getMyProfile, isAuthenticated ? {} : "skip");
  const profileWithUrls = useQuery(api.profiles.getMyProfileWithUrls, isAuthenticated ? {} : "skip");
  const browserProfiles = useQuery(api.browserProfiles.listMine, isAuthenticated ? {} : "skip");
  const generateUploadUrl = useMutation(api.profiles.generateUploadUrl);
  const saveProfile = useMutation(api.profiles.saveProfile);

  const [tab, setTab] = useState<Tab>("logins");
  const [bio, setBio] = useState("");
  const [links, setLinks] = useState<Links>({ linkedin: "", github: "", twitter: "", portfolio: "" });
  const [prefs, setPrefs] = useState<Preferences>({ tone: "direct", targetRoles: "", locations: "", emailVolume: "high" });
  const [editableMarkdown, setEditableMarkdown] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [creating, setCreating] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [profilesMsg, setProfilesMsg] = useState<string | null>(null);
  const [loginInfo, setLoginInfo] = useState<{ platform: string; url: string; sinceVersion: number | null; saved: boolean } | null>(null);
  const [solariList, setSolariList] = useState<Array<{ id: string; name: string; editorStatus?: string; editorError?: string }> | null>(null);

  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBio(profile.bio);
    setLinks(profile.links);
    setPrefs(profile.preferences);
    setEditableMarkdown(profile.markdown);
  }, [profile]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch("/api/profiles").then(r=>r.json()).then(d=>{ setSolariList(d.solariProfiles ?? d.solarProfiles ?? []); }).catch(()=>{});
  }, [isAuthenticated, browserProfiles]);

  // Poll until the handoff's profile version bumps — that IS the save confirmation.
  useEffect(() => {
    if (!loginInfo || loginInfo.saved) return;
    const t = setInterval(async () => {
      try {
        const d = await fetch("/api/profiles").then((r) => r.json());
        const list: Array<{ id: string; version?: number; storageStateS3Key?: string }> = d.solariProfiles ?? [];
        const target = (d.convexProfiles ?? []).find((c: { platform: string }) => c.platform === loginInfo.platform);
        const sp = target ? list.find((p) => p.id === target.solariProfileId) : undefined;
        if (!sp) return;
        const saved = loginInfo.sinceVersion === null ? !!sp.storageStateS3Key : sp.version !== undefined && sp.version > loginInfo.sinceVersion;
        if (saved) {
          setLoginInfo({ ...loginInfo, saved: true });
          setProfilesMsg(`Saved — ${loginInfo.platform} profile is logged in. Next run starts signed in.`);
        }
      } catch {}
    }, 4000);
    return () => clearInterval(t);
  }, [loginInfo]);

  if (!isAuthenticated) return <div className="min-h-screen grid place-items-center bg-[#fafaf9] p-6 text-sm text-stone-900">Sign in to edit settings</div>;
  if (profile === undefined)
    return (
      <div className="min-h-screen bg-[#fafaf9] p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="h-14 animate-pulse rounded-2xl bg-stone-200/60" />
          <div className="h-10 w-48 animate-pulse rounded-full bg-stone-200/50" />
          <div className="h-[50vh] animate-pulse rounded-2xl bg-stone-200/40" />
        </div>
      </div>
    );
  if (!profile) return <div className="min-h-screen grid place-items-center bg-[#fafaf9] p-6"><div className="text-center"><p className="text-sm text-stone-900">No profile yet</p><Link href="/onboarding" className="mt-2 inline-flex rounded-full bg-stone-900 px-4 py-2 text-xs font-bold text-white">Go to onboarding →</Link></div></div>;

  const role = profile?.role ?? "student";
  const markdownPreview = `# ${user?.fullName ?? "Profile"} — ${role} Context\n\n## Bio\n${bio}\n\n## Links\n- LinkedIn: ${links.linkedin || "—"}\n- GitHub: ${links.github || "—"}\n- X: ${links.twitter || "—"}\n- Portfolio: ${links.portfolio || "—"}\n\n## Preferences\n- Tone: ${prefs.tone}\n- Roles: ${prefs.targetRoles || "—"}\n- Locations: ${prefs.locations || "—"}\n`;
  const connectedCount = (browserProfiles ?? []).filter((b) => b.status === "active").length;

  async function handleSave() {
    if (!profile) { setMsg("No profile"); return; }
    const markdownToSave = editableMarkdown.trim().length > 40 ? editableMarkdown : markdownPreview;
    const bioToSave = editableMarkdown.trim().length > 40 ? editableMarkdown.slice(0, 2000) : bio;
    if (bioToSave.trim().length < 40) { setMsg("Bio/markdown must be 40+ chars — edit the markdown in the Markdown context tab"); return; }
    setSaving(true); setMsg(null);
    try {
      let resumeStorageId: Id<"_storage"> | undefined = profile.resumeStorageId;
      if (resumeFile) {
        const url = await generateUploadUrl({});
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": resumeFile.type || "application/pdf" }, body: resumeFile });
        if (!res.ok) throw new Error("Resume upload failed");
        const { storageId } = await res.json();
        resumeStorageId = storageId as Id<"_storage">;
      }
      const mdBlob = new Blob([markdownToSave], { type: "text/markdown" });
      const mdUrl = await generateUploadUrl({});
      const mdRes = await fetch(mdUrl, { method: "POST", headers: { "Content-Type": "text/markdown" }, body: mdBlob });
      if (!mdRes.ok) throw new Error("Markdown upload failed");
      const { storageId: mdId } = await mdRes.json();
      await saveProfile({
        role: profile!.role,
        bio: bioToSave,
        markdown: markdownToSave,
        markdownStorageId: mdId as Id<"_storage">,
        resumeStorageId,
        resumeFileName: resumeFile?.name ?? profile.resumeFileName ?? undefined,
        links,
        preferences: prefs,
      });
      setMsg("Saved — your context updates on the next run.");
      setResumeFile(null);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  async function handleLogin(platform: string) {
    setLoggingIn(platform);
    setProfilesMsg(null);
    setLoginInfo(null);
    try {
      const res = await fetch("/api/profiles/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const info = { platform, url: data.url, sinceVersion: data.sinceVersion, saved: false };
      setLoginInfo(info);
      window.open(data.url, "_blank", "noopener");
      setProfilesMsg(`Login page opened for ${platform} — sign in there, then click Save. This page detects when you're done.`);
    } catch (e) {
      setProfilesMsg(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoggingIn(null);
    }
  }

  async function handleCreateProfile(platform: string) {
    setCreating(platform);
    setProfilesMsg(null);
    try {
      const res = await fetch("/api/profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setProfilesMsg(`Profile created for ${platform}. Now click "Log in" and sign in — no Solari account needed.`);
    } catch (e) { setProfilesMsg(e instanceof Error ? e.message : "Create failed"); }
    finally { setCreating(null); }
  }

  const inputCls = "mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-900 placeholder:text-stone-400 transition focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10 focus:outline-none";
  const labelCls = "text-xs font-semibold text-stone-700";

  return (
    <div className="min-h-screen bg-[#fafaf9]">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-xs font-bold text-white">D.</div>
            <span className="text-sm font-bold tracking-tight text-stone-900">Doppel</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-xs font-semibold text-stone-600 transition hover:text-stone-900">← Dashboard</Link>
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-stone-900">Settings</h1>
        <p className="mt-1 max-w-[65ch] text-sm leading-6 text-stone-500">
          Connect your accounts so Doppel starts each run already signed in, and tune the context it uses to act as you.
        </p>

        {/* tabs */}
        <div className="mt-6 flex gap-1 rounded-xl border border-stone-200 bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${tab === t.id ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-50"}`}
            >
              {t.label}
              {t.id === "logins" && connectedCount > 0 && (
                <span className={`tnum ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tab === t.id ? "bg-white/20 text-white" : "bg-stone-100 text-stone-600"}`}>{connectedCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* ============ TAB: LOGINS ============ */}
        {tab === "logins" && (
          <div className="mt-6 space-y-4">
            <div className="space-y-3">
              {PLATFORMS.map((pl) => {
                const mapped = (browserProfiles ?? []).find((b) => b.platform === pl.id);
                const isActive = mapped?.status === "active";
                return (
                  <div key={pl.id} className={`rounded-xl border p-4 ${isActive ? "border-emerald-300 bg-emerald-50/60" : "border-stone-200 bg-white"}`}>
                    <div className="flex items-start gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${isActive ? "border-emerald-700 bg-emerald-600 text-white" : "border-stone-200 bg-white text-stone-900"}`}>{pl.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-stone-900">{pl.label}</span>
                          <span className="font-mono text-xs text-stone-500">{pl.domain}</span>
                          {mapped ? (
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${isActive ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-amber-200 bg-amber-100 text-amber-700"}`}>{mapped.status === "active" ? "connected" : mapped.status}</span>
                          ) : (
                            <span className="rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">not connected</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-stone-600">{pl.desc}</p>
                        {mapped && (() => {
                          const sp = (solariList ?? []).find((s) => s.id === mapped.solariProfileId);
                          if (sp?.editorStatus === "error") {
                            return <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-900">Last save failed: {sp.editorError ?? "editor died"} — click Log in again and Save.</div>;
                          }
                          return null;
                        })()}
                        {mapped && <div className="mt-1 font-mono text-[11px] text-stone-500">{mapped.solariProfileId.slice(0, 24)}… • last used {new Date(mapped.lastUsedAt).toLocaleDateString()}</div>}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {!mapped ? (
                            <button onClick={() => handleCreateProfile(pl.id)} disabled={creating === pl.id} className="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:opacity-40">
                              {creating === pl.id ? "Creating…" : `Connect ${pl.label}`}
                            </button>
                          ) : (
                            <>
                              <button onClick={() => handleLogin(pl.id)} disabled={loggingIn === pl.id} className="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:opacity-40">
                                {loggingIn === pl.id ? "Preparing…" : loginInfo?.platform === pl.id && loginInfo.saved ? "Re-login" : `Log in to ${pl.label}`}
                              </button>
                              <button onClick={() => handleCreateProfile(pl.id)} disabled={creating === pl.id} className="rounded-full border border-stone-200 bg-white px-4 py-1.5 text-xs font-semibold text-stone-900 transition hover:bg-stone-50 active:scale-[0.98] disabled:opacity-40">Recreate</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {profilesMsg && <div className="rounded-xl border border-stone-200 bg-white p-3 text-xs font-medium leading-5 text-stone-900 whitespace-pre-wrap break-words">{profilesMsg}</div>}
            {loginInfo && !loginInfo.saved && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-900">
                Waiting for you to finish logging in to {loginInfo.platform}…{" "}
                <a href={loginInfo.url} target="_blank" rel="noopener" className="font-bold underline">Open the login page</a> if it didn't open automatically.
              </div>
            )}

            <details className="group rounded-xl border border-stone-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-50">
                How login persists
                <span className="ml-auto text-xs font-medium text-stone-400 group-open:hidden">Show</span>
                <span className="ml-auto hidden text-xs font-medium text-stone-400 group-open:inline">Hide</span>
              </summary>
              <div className="border-t border-stone-200 px-4 py-3">
                <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-5 text-stone-600">
                  <li>Click Connect — a browser profile is created on Solari for that platform.</li>
                  <li>Click Log in — a secure login page opens. Sign into the site (handles 2FA/captcha) and click Save. Your credentials never pass through Doppel.</li>
                  <li>Every run attaches the saved cookies — the browser starts already signed in.</li>
                </ol>
                <p className="mt-2 text-xs text-stone-500">If a session expires, click Log in again — takes 30 seconds.</p>
              </div>
            </details>

            {(browserProfiles ?? []).length > 0 && (
              <details className="group rounded-xl border border-stone-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-50">
                  Stored connections
                  <span className="tnum rounded-full bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-600">{(browserProfiles ?? []).length}</span>
                  <span className="ml-auto text-xs font-medium text-stone-400 group-open:hidden">Show</span>
                  <span className="ml-auto hidden text-xs font-medium text-stone-400 group-open:inline">Hide</span>
                </summary>
                <div className="space-y-2 border-t border-stone-200 p-3">
                  {(browserProfiles ?? []).map((p) => (
                    <div key={p._id} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2">
                      <span className="font-mono text-xs text-stone-900">{p.platform} → {p.solariProfileId.slice(0, 18)}…</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${p.status === "active" ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-amber-200 bg-amber-100 text-amber-700"}`}>{p.status}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ============ TAB: PROFILE ============ */}
        {tab === "profile" && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-stone-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-stone-900">About you</h2>
              <p className="mt-0.5 text-xs text-stone-500">This paragraph is the core of the context Doppel uses to write and speak as you.</p>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={7}
                className={inputCls}
                placeholder="Two or three sentences about who you are, what you do, and what you're looking for…"
              />
              <div className="mt-1 text-xs text-stone-500">{bio.length} chars — needs at least 40</div>
            </div>

            <div className="rounded-xl border border-stone-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-stone-900">Links</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(["linkedin", "github", "twitter", "portfolio"] as const).map((k) => (
                  <div key={k}>
                    <label className={labelCls + " capitalize"}>{k}</label>
                    <input value={links[k]} onChange={(e) => setLinks({ ...links, [k]: e.target.value })} className={inputCls} placeholder={`https://${k}.com/...`} />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-stone-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-stone-900">Preferences</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Tone</label>
                  <select value={prefs.tone} onChange={(e) => setPrefs({ ...prefs, tone: e.target.value })} className={inputCls}>
                    <option value="direct">direct</option>
                    <option value="casual">casual</option>
                    <option value="formal">formal</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Email volume</label>
                  <select value={prefs.emailVolume} onChange={(e) => setPrefs({ ...prefs, emailVolume: e.target.value })} className={inputCls}>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Target roles</label>
                  <input value={prefs.targetRoles} onChange={(e) => setPrefs({ ...prefs, targetRoles: e.target.value })} className={inputCls} placeholder="e.g. frontend engineer, PM" />
                </div>
                <div>
                  <label className={labelCls}>Locations</label>
                  <input value={prefs.locations} onChange={(e) => setPrefs({ ...prefs, locations: e.target.value })} className={inputCls} placeholder="e.g. remote, Bengaluru" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-stone-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-stone-900">Resume</h2>
              <input type="file" accept=".pdf,.doc,.docx,.md" onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)} className="mt-2 w-full text-sm font-medium text-stone-900 file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-stone-200 file:bg-white file:px-3 file:py-1 file:text-xs file:font-semibold file:text-stone-900 transition hover:file:bg-stone-50" />
              <div className="mt-1 text-xs text-stone-500">{profile.resumeFileName ?? "No resume uploaded"}{resumeFile ? ` → ${resumeFile.name}` : ""}</div>
            </div>

            {/* save bar */}
            <div className="sticky bottom-4 rounded-xl border border-stone-200 bg-white p-3 shadow-lg shadow-stone-900/5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 text-xs text-stone-500">Saves bio, links, preferences, resume and markdown together.</div>
                <button onClick={handleSave} disabled={saving || editableMarkdown.trim().length < 40} className="shrink-0 rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:opacity-40">
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
              {msg && <div className={`mt-2 rounded-lg border px-3 py-2 text-xs font-medium ${msg.startsWith("Saved") ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg}</div>}
            </div>
          </div>
        )}

        {/* ============ TAB: MARKDOWN ============ */}
        {tab === "markdown" && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-stone-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-stone-900">Markdown context</h2>
                  <p className="mt-0.5 text-xs text-stone-500">The exact file injected into every run. Edit it directly — fields from the Profile tab sync into it when you edit them.</p>
                </div>
                <span className={`tnum rounded-full border px-2.5 py-0.5 text-xs font-medium ${editableMarkdown.length > 100000 ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                  {editableMarkdown.length > 100000 ? "Too long — trim below 100k" : "Ready to save"}
                </span>
              </div>
              <textarea
                value={editableMarkdown}
                onChange={(e) => setEditableMarkdown(e.target.value)}
                rows={22}
                className="mt-3 w-full rounded-xl border border-stone-200 bg-white p-3 font-mono text-sm leading-5 text-stone-900 placeholder:text-stone-400 transition focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10 focus:outline-none"
                placeholder="# Your markdown..."
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                <span className="tnum">{editableMarkdown.length} chars • {editableMarkdown.split("\n").length} lines</span>
                {profileWithUrls?.markdownUrl && <a href={profileWithUrls.markdownUrl} target="_blank" className="font-semibold text-stone-700 underline decoration-stone-300 underline-offset-4 transition hover:text-stone-900">Open .md in Convex →</a>}
              </div>
            </div>

            <div className="sticky bottom-4 rounded-xl border border-stone-200 bg-white p-3 shadow-lg shadow-stone-900/5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 text-xs text-stone-500">Saves markdown together with bio, links, preferences and resume.</div>
                <button onClick={handleSave} disabled={saving || editableMarkdown.trim().length < 40} className="shrink-0 rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:opacity-40">
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
              {msg && <div className={`mt-2 rounded-lg border px-3 py-2 text-xs font-medium ${msg.startsWith("Saved") ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg}</div>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
