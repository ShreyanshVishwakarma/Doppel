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

const PLATFORMS = [
  { id: "gmail", label: "Gmail", domain: "mail.google.com", desc: "Inbox triage, draft replies, approve to send. Needs Google login.", icon: "✉" },
  { id: "linkedin", label: "LinkedIn", domain: "linkedin.com", desc: "DM prospects, connect, comment — stays logged in across runs.", icon: "in" },
  { id: "twitter", label: "X / Twitter", domain: "x.com", desc: "Post, reply, DM. Profiles keep cookies.", icon: "𝕏" },
  { id: "github", label: "GitHub", domain: "github.com", desc: "Used for profile scraping fallback (usually no login needed).", icon: "⌥" },
] as const;

export default function SettingsPage() {
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.getMyProfile, isAuthenticated ? {} : "skip");
  const profileWithUrls = useQuery(api.profiles.getMyProfileWithUrls, isAuthenticated ? {} : "skip");
  const browserProfiles = useQuery(api.browserProfiles.listMine, isAuthenticated ? {} : "skip");
  const generateUploadUrl = useMutation(api.profiles.generateUploadUrl);
  const saveProfile = useMutation(api.profiles.saveProfile);

  const [bio, setBio] = useState("");
  const [links, setLinks] = useState<Links>({ linkedin: "", github: "", twitter: "", portfolio: "" });
  const [prefs, setPrefs] = useState<Preferences>({ tone: "direct", targetRoles: "", locations: "", emailVolume: "high" });
  const [editableMarkdown, setEditableMarkdown] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [creating, setCreating] = useState<string | null>(null);
  const [profilesMsg, setProfilesMsg] = useState<string | null>(null);
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

  if (!isAuthenticated) return <div className="min-h-screen grid place-items-center p-6 text-sm text-zinc-900">Sign in to edit settings</div>;
  if (profile === undefined) return <div className="min-h-screen grid place-items-center p-6 text-sm text-zinc-900">Loading…</div>;
  if (!profile) return <div className="min-h-screen grid place-items-center p-6"><div className="text-center"><p className="text-sm text-zinc-900">No profile yet</p><Link href="/onboarding" className="mt-2 inline-flex rounded-full bg-zinc-900 px-4 py-2 text-xs font-bold text-white">Go to onboarding →</Link></div></div>;

  const role = profile?.role ?? "student";
  const markdownPreview = `# ${user?.fullName ?? "Profile"} — ${role} Context\n\n## Bio\n${bio}\n\n## Links\n- LinkedIn: ${links.linkedin || "—"}\n- GitHub: ${links.github || "—"}\n- X: ${links.twitter || "—"}\n- Portfolio: ${links.portfolio || "—"}\n\n## Preferences\n- Tone: ${prefs.tone}\n- Roles: ${prefs.targetRoles || "—"}\n- Locations: ${prefs.locations || "—"}\n`;

  async function handleSave() {
    if (!profile) { setMsg("No profile"); return; }
    const markdownToSave = editableMarkdown.trim().length > 40 ? editableMarkdown : markdownPreview;
    const bioToSave = editableMarkdown.trim().length > 40 ? editableMarkdown.slice(0, 2000) : bio;
    if (bioToSave.trim().length < 40) { setMsg("Bio/markdown must be 40+ chars — edit the markdown below"); return; }
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
      setMsg("Saved ✓ — markdown updated. Next sandbox run will use it.");
      setResumeFile(null);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  async function handleCreateProfile(platform: string) {
    setCreating(platform);
    setProfilesMsg(null);
    try {
      const res = await fetch("/api/profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setProfilesMsg(`✓ Profile created for ${platform}: ${data.solariProfileId.slice(0,16)}… Now open Solari console → Profiles → Open editor → log in → Save.`);
    } catch (e) { setProfilesMsg(e instanceof Error ? e.message : "Create failed"); }
    finally { setCreating(null); }
  }

  return (
    <div className="min-h-screen bg-[#fafaf9]">
      <header className="sticky top-0 z-20 border-b bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/dashboard" className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white">D.</div><span className="text-sm font-bold text-zinc-900">Doppel</span><span className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-zinc-800">SETTINGS</span></Link>
          <div className="flex items-center gap-3"><Link href="/dashboard" className="text-xs font-bold text-zinc-800 hover:text-zinc-900">Dashboard →</Link><UserButton /></div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">Settings & profiles</h1>
        <p className="mt-1 text-sm leading-6 text-zinc-800">Edit your full markdown context directly, manage Solari browser profiles for Gmail/LinkedIn. Profiles keep you logged in — log in once in the Solari editor, then every sandbox run starts already signed in.</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-300 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold tracking-widest text-zinc-800">BROWSER PROFILES — the key to Gmail & LinkedIn</div>
              <p className="mt-2 text-xs leading-5 text-zinc-800">Per docs.getsolari.com/profiles: a profile saves cookies + storageState. Create one per platform, then <b className="font-semibold text-zinc-900">Open editor</b> at console.getsolari.com → Profiles, log into the site (handles 2FA/captcha), hit <b className="font-semibold text-zinc-900">Save</b>. Our harness attaches <code className="bg-zinc-100 border border-zinc-300 px-1.5 py-0.5 rounded font-mono text-sm font-medium text-zinc-900">profileId</code> when launching: <code className="bg-zinc-100 border border-zinc-300 px-1.5 py-0.5 rounded font-mono text-sm font-medium text-zinc-900">client.launch(&#123; profileId, stealth:true, recording:true &#125;)</code>.</p>

              <div className="mt-4 space-y-3">
                {PLATFORMS.map((pl) => {
                  const mapped = (browserProfiles ?? []).find((b) => b.platform === pl.id);
                  const isActive = mapped?.status === "active";
                  return (
                    <div key={pl.id} className={`rounded-xl border p-3 flex gap-3 items-start ${isActive ? "bg-emerald-50 border-emerald-300" : "bg-white border-zinc-300"}`}>
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${isActive ? "bg-emerald-600 text-white border-emerald-700" : "bg-white text-zinc-900 border-zinc-300"}`}>{pl.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-zinc-900">{pl.label}</span>
                          <span className="text-xs font-mono font-medium text-zinc-700">{pl.domain}</span>
                          {mapped ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isActive ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}`}>{mapped.status}</span> : <span className="rounded-full bg-zinc-200 border border-zinc-300 px-2 py-0.5 text-[10px] font-bold text-zinc-800">not connected</span>}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-zinc-800">{pl.desc}</div>
                        {mapped && (() => {
                          const sp = (solariList ?? []).find((s) => s.id === mapped.solariProfileId);
                          if (sp?.editorStatus === "error") {
                            return <div className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-900">⚠ Last editor save failed: {sp.editorError ?? "editor died"} — reopen the Solari editor, log in, and Save again.</div>;
                          }
                          return null;
                        })()}
                        {mapped && <div className="mt-1 font-mono text-xs font-medium text-zinc-800">→ {mapped.solariProfileId} • last {new Date(mapped.lastUsedAt).toLocaleDateString()}</div>}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {!mapped ? (
                            <button onClick={() => handleCreateProfile(pl.id)} disabled={creating === pl.id} className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40 hover:bg-black">
                              {creating === pl.id ? "Creating…" : `Connect ${pl.label}`}
                            </button>
                          ) : (
                            <>
                              <a href="https://console.getsolari.com" target="_blank" className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-black">Open Solari editor →</a>
                              <button onClick={() => handleCreateProfile(pl.id)} disabled={creating === pl.id} className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-xs font-bold text-zinc-900 hover:bg-zinc-50 disabled:opacity-40">Recreate</button>
                            </>
                          )}
                          <span className="text-xs font-medium text-zinc-700 self-center">Docs: profiles → Open editor → log in → Save</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {profilesMsg && <div className="mt-3 rounded-xl border border-zinc-300 bg-zinc-50 p-3 text-xs font-medium leading-5 text-zinc-900 whitespace-pre-wrap break-words">{profilesMsg}</div>}
              <div className="mt-3 rounded-xl bg-zinc-900 p-4 text-xs leading-5">
                <div className="font-bold text-white tracking-wide">How login persists</div>
                <ol className="mt-2 list-decimal pl-4 space-y-1 text-zinc-100">
                  <li>Click Connect for gmail/linkedin → <code className="bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded font-mono text-zinc-100">client.profiles.create(&#123; name:&quot;gmail-...&quot; &#125;)</code> → <code className="bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded font-mono text-zinc-100">prof_xxx</code> saved to Convex.</li>
                  <li>Go to <a href="https://console.getsolari.com" target="_blank" className="underline decoration-zinc-400 underline-offset-2 text-white hover:text-zinc-100">console.getsolari.com</a> → Profiles → <b className="text-white">Open editor</b> → log in → <b className="text-white">Save</b>.</li>
                  <li>Next prompt → <code className="bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded font-mono text-zinc-100">client.launch(&#123; profileId: prof_xxx &#125;)</code> — already signed in.</li>
                </ol>
                <div className="mt-2 text-zinc-300">Alt: upload storageState.json via <code className="bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded font-mono text-zinc-100">client.profiles.save(id, storageState)</code></div>
              </div>

              {solariList && solariList.length > 0 && (
                <div className="mt-3 rounded-xl border border-zinc-300 bg-white p-3">
                  <div className="text-xs font-bold text-zinc-900">Raw Solari profiles for this API key ({solariList.length})</div>
                  <div className="mt-1 space-y-1 font-mono text-xs max-h-[120px] overflow-auto">
                    {solariList.map(p=> <div key={p.id} className="flex justify-between gap-2"><span className="font-medium text-zinc-900">{p.name}</span><span className="font-medium text-zinc-700">{p.id.slice(0,16)}…</span></div>)}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-300 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold tracking-widest text-zinc-800">BIO — MARKDOWN CONTEXT</div>
              <p className="mt-1 text-xs text-zinc-700">Quick edit — also updates the full markdown below. Or edit the full markdown directly.</p>
              <textarea value={bio} onChange={(e)=>{ setBio(e.target.value); setEditableMarkdown(`# ${user?.fullName ?? "Profile"} — ${role} Context\n\n## Bio\n${e.target.value}\n\n## Links\n- LinkedIn: ${links.linkedin || "—"}\n- GitHub: ${links.github || "—"}\n- X: ${links.twitter || "—"}\n- Portfolio: ${links.portfolio || "—"}\n\n## Preferences\n- Tone: ${prefs.tone}\n- Roles: ${prefs.targetRoles || "—"}\n- Locations: ${prefs.locations || "—"}\n`); }} rows={7} className="mt-3 w-full rounded-xl border border-zinc-300 bg-white p-3 text-sm leading-6 text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900" />
              <div className="mt-1 text-xs font-medium text-zinc-700">{bio.length} chars</div>
              {(["linkedin","github","twitter","portfolio"] as const).map(k=>(
                <div key={k} className="mt-3"><label className="text-xs font-bold capitalize text-zinc-900">{k}</label><input value={links[k]} onChange={e=>{ const v=e.target.value; setLinks({...links, [k]: v}); setEditableMarkdown(`# ${user?.fullName ?? "Profile"} — ${role} Context\n\n## Bio\n${bio}\n\n## Links\n- LinkedIn: ${k==="linkedin"?v:links.linkedin || "—"}\n- GitHub: ${k==="github"?v:links.github || "—"}\n- X: ${k==="twitter"?v:links.twitter || "—"}\n- Portfolio: ${k==="portfolio"?v:links.portfolio || "—"}\n\n## Preferences\n- Tone: ${prefs.tone}\n- Roles: ${prefs.targetRoles || "—"}\n- Locations: ${prefs.locations || "—"}\n`); }} className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 placeholder:text-zinc-500 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 focus:outline-none" placeholder={`https://${k}.com/...`} /></div>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold text-zinc-900">Tone</label><select value={prefs.tone} onChange={e=>{ const v=e.target.value; setPrefs({...prefs, tone:v}); setEditableMarkdown(`# ${user?.fullName ?? "Profile"} — ${role} Context\n\n## Bio\n${bio}\n\n## Links\n- LinkedIn: ${links.linkedin || "—"}\n- GitHub: ${links.github || "—"}\n- X: ${links.twitter || "—"}\n- Portfolio: ${links.portfolio || "—"}\n\n## Preferences\n- Tone: ${v}\n- Roles: ${prefs.targetRoles || "—"}\n- Locations: ${prefs.locations || "—"}\n`); }} className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 focus:outline-none"><option value="direct">direct</option><option value="casual">casual</option><option value="formal">formal</option></select></div>
                <div><label className="text-xs font-bold text-zinc-900">Email volume</label><select value={prefs.emailVolume} onChange={e=>{ const v=e.target.value; setPrefs({...prefs, emailVolume:v}); }} className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 focus:outline-none"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></div>
              </div>
              <div className="mt-3"><label className="text-xs font-bold text-zinc-900">Target roles</label><input value={prefs.targetRoles} onChange={e=>setPrefs({...prefs, targetRoles:e.target.value})} className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 placeholder:text-zinc-500 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 focus:outline-none" /></div>
              <div className="mt-3"><label className="text-xs font-bold text-zinc-900">Locations</label><input value={prefs.locations} onChange={e=>setPrefs({...prefs, locations:e.target.value})} className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 placeholder:text-zinc-500 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 focus:outline-none" /></div>
              <div className="mt-3"><label className="text-xs font-bold text-zinc-900">Resume (PDF)</label><input type="file" accept=".pdf,.doc,.docx,.md" onChange={e=>setResumeFile(e.target.files?.[0] ?? null)} className="mt-1 w-full text-sm font-medium text-zinc-900 file:mr-3 file:rounded-full file:border file:border-zinc-300 file:bg-white file:px-3 file:py-1 file:text-xs file:font-bold file:text-zinc-900 hover:file:bg-zinc-50" /><div className="mt-1 text-xs font-medium text-zinc-700">{profile.resumeFileName ?? "No resume"} {resumeFile && `→ ${resumeFile.name}`}</div></div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-300 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold tracking-widest text-zinc-800">FULL MARKDOWN — editable</div>
                <span className="rounded-full bg-emerald-50 border border-emerald-300 px-2 py-0.5 text-xs font-bold text-emerald-800">live — edit & save</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-700">This is the exact file saved to Convex and injected into every sandbox. Edit it directly — Save below updates it.</p>
              <textarea value={editableMarkdown} onChange={e=>setEditableMarkdown(e.target.value)} rows={22} className="mt-3 w-full rounded-xl border border-zinc-300 bg-white p-3 font-mono text-sm leading-5 text-zinc-900 placeholder:text-zinc-500 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 focus:outline-none" placeholder="# Your markdown..." />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-700">{editableMarkdown.length} chars • {editableMarkdown.split("\n").length} lines</span>
                <span className="text-xs text-zinc-600">{editableMarkdown.length > 100000 ? "Too long — trim to <100k" : "Ready to save"}</span>
              </div>
              <button onClick={handleSave} disabled={saving || editableMarkdown.trim().length < 40} className="mt-3 w-full rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white hover:bg-black disabled:opacity-40"> {saving ? "Saving…" : "Save full markdown → update profile"} </button>
              {msg && <div className={`mt-2 rounded-xl border px-3 py-2 text-xs font-medium ${msg.includes("Saved") ? "bg-emerald-50 border-emerald-300 text-emerald-900" : "bg-red-50 border-red-300 text-red-800"}`}>{msg}</div>}
              {profileWithUrls?.markdownUrl && <a href={profileWithUrls.markdownUrl} target="_blank" className="mt-2 inline-block text-xs font-bold text-zinc-900 underline decoration-zinc-400 underline-offset-4 hover:text-black">Open .md in Convex →</a>}
              <div className="mt-2 text-xs leading-5 text-zinc-600">Preview generated from fields above: <span className="font-mono text-zinc-800">{markdownPreview.slice(0,60)}…</span></div>
            </div>

            <div className="rounded-2xl border border-zinc-300 bg-white p-4 shadow-sm">
              <div className="text-xs font-bold tracking-widest text-zinc-800">CONNECTED (Convex)</div>
              {(browserProfiles ?? []).length===0 ? <div className="mt-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs font-medium text-zinc-800">No browserProfiles rows yet — create via Connect buttons above.</div> :
                (browserProfiles ?? []).map(p=>(
                  <div key={p._id} className="mt-2 flex items-center justify-between rounded-xl border border-zinc-300 bg-white px-3 py-2.5"><span className="font-mono text-xs font-bold text-zinc-900">{p.platform} → {p.solariProfileId.slice(0,18)}…</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${p.status==="active"?"bg-emerald-600 text-white":"bg-amber-500 text-white"}`}>{p.status}</span></div>
                ))}
              <p className="mt-2 text-xs leading-5 font-medium text-zinc-800">Stored in Convex <code className="bg-zinc-100 border border-zinc-300 px-1.5 py-0.5 rounded font-mono text-sm font-bold text-zinc-900">browserProfiles</code> with index <code className="bg-zinc-100 border border-zinc-300 px-1.5 py-0.5 rounded font-mono text-sm font-bold text-zinc-900">by_user_platform</code>.</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-white">
              <div className="text-xs font-bold tracking-widest text-zinc-200">ARCHITECTURE</div>
              <div className="mt-2 space-y-1 font-mono text-xs leading-5 font-medium text-zinc-100">
                <div>Next.js /api/run → Sandboxes.create(fromSnapshot)</div>
                <div>Sandbox boots in ms → writes /tmp/task + profiles.json</div>
                <div>Harness launches Solari browser with profileId + recording</div>
                <div>Trace streams via /tmp/trace.jsonl → Convex → Dashboard</div>
                <div>Replay URL fetched after close → dashboard link</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
