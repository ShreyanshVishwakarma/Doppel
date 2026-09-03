"use client";

import { useState } from "react";
import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export function WaitlistForm({ compact }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setState("error");
      setMessage("Enter a valid email address");
      return;
    }
    setState("submitting");
    setMessage(null);
    try {
      const res = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: parsed.data }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Something went wrong");
      setState("done");
      setMessage(d.alreadyJoined ? "You're already on the list." : "You're on the list — we'll reach out when invites open.");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (state === "done") {
    return (
      <div className={`inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ${compact ? "" : "w-full justify-center"}`}>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white">✓</span>
        {message}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white p-1.5 transition focus-within:border-stone-900 focus-within:ring-2 focus-within:ring-stone-900/10">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state === "error") { setState("idle"); setMessage(null); } }}
          placeholder="you@company.com"
          className="min-w-0 flex-1 bg-transparent px-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none"
          disabled={state === "submitting"}
        />
        <button type="submit" disabled={state === "submitting"} className="shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:opacity-40">
          {state === "submitting" ? "Joining…" : "Join waitlist"}
        </button>
      </div>
      {message && state === "error" && <p className="mt-2 text-xs font-medium text-red-600">{message}</p>}
    </form>
  );
}
