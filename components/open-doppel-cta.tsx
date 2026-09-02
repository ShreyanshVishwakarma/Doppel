"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

// State-aware CTA: onboarded users go straight to the dashboard, new users
// to onboarding. Renders a neutral placeholder while auth/profile resolves
// so nobody sees a wrong link flash.
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

  const base =
    variant === "hero"
      ? "inline-flex h-11 items-center gap-2 rounded-full bg-zinc-900 px-6 text-sm font-medium text-white shadow-sm transition hover:bg-black"
      : "inline-flex h-9 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition hover:bg-zinc-800";

  if (isLoading || (isAuthenticated && profile === undefined)) {
    return <span className={`${base} pointer-events-none opacity-40`}>…</span>;
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
