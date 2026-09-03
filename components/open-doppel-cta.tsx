"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

// State-aware CTA: owners go to the app (dashboard if onboarded, onboarding if
// not). Non-owners see the private-beta state. Renders a neutral placeholder
// while auth/profile resolves so nobody sees a wrong link flash.
export function OpenDoppelCta({
  variant = "primary",
  doneLabel = "Open Doppel",
  newLabel = "Continue onboarding",
}: {
  variant?: "primary" | "hero";
  doneLabel?: string;
  newLabel?: string;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const profile = useQuery(api.profiles.getMyProfile, isAuthenticated ? {} : "skip");
  const [owner, setOwner] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { setOwner(null); return; }
    let cancelled = false;
    fetch("/api/me").then((r) => r.json()).then((d) => { if (!cancelled) setOwner(!!d.owner); }).catch(() => { if (!cancelled) setOwner(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const base =
    variant === "hero"
      ? "inline-flex h-11 items-center gap-2 rounded-full bg-stone-900 px-6 text-sm font-medium text-white shadow-sm transition hover:bg-black"
      : "inline-flex h-9 items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-medium text-white transition hover:bg-zinc-800";

  if (isLoading || (isAuthenticated && (profile === undefined || owner === null))) {
    return <span className={`${base} pointer-events-none opacity-40`}>…</span>;
  }

  if (isAuthenticated && owner === false) {
    return (
      <span className="inline-flex h-9 items-center rounded-full border border-stone-200 bg-stone-100 px-4 text-xs font-medium text-stone-600">
        Private beta — join the waitlist below
      </span>
    );
  }

  if (profile) {
    return (
      <Link href="/dashboard" className={base}>
        {doneLabel}
      </Link>
    );
  }
  return (
    <Link href="/onboarding" className={base}>
      {newLabel}
    </Link>
  );
}
