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
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    fetch("/api/me").then((r) => r.json()).then((d) => { if (!cancelled) setAllowed(!!d.allowed); }).catch(() => { if (!cancelled) setAllowed(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // Signed-out users never have access. Derived so signing out clears stale state.
  const access = isAuthenticated ? allowed : null;

  const base =
    variant === "hero"
      ? "inline-flex h-11 items-center gap-2 rounded-full bg-stone-900 px-6 text-sm font-medium text-white shadow-sm transition hover:bg-black"
      : "inline-flex h-9 items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-medium text-white transition hover:bg-zinc-800";

  if (isLoading || (isAuthenticated && (profile === undefined || access === null))) {
    return <span className={`${base} pointer-events-none opacity-40`}>…</span>;
  }

  if (isAuthenticated && access === false) {
    return (
      <span className="inline-flex h-9 items-center rounded-full border border-stone-200 bg-stone-100 px-4 text-xs font-medium text-stone-600">
        Private beta. Join the waitlist below
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
