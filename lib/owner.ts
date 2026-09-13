import { auth, clerkClient } from "@clerk/nextjs/server";

/**
 * Access control while the product is invite-only.
 *
 * Two ways in:
 *  - the owner allowlist (OWNER_EMAILS, comma-separated), or
 *  - an approved waitlist email (granted from Settings > Access, stored in Convex).
 */

export function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Primary email for a Clerk user id, lowercased. */
export async function getEmailForUser(userId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return user.primaryEmailAddress?.emailAddress.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

async function isApprovedOnWaitlist(email: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.SANDBOX_HARNESS_SECRET;
  if (!url || !secret) return false;
  try {
    const res = await fetch(`${url}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "waitlist:isAllowed", args: { email, secret }, format: "json" }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { value?: unknown };
    return data.value === true;
  } catch {
    return false;
  }
}

/** Owner, or an email the owner approved from the waitlist. */
export async function isEmailAllowed(email: string | null): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (ownerEmails().includes(normalized)) return true;
  return isApprovedOnWaitlist(normalized);
}

export async function getOwnerStatus(): Promise<{ isOwner: boolean; email: string | null; userId: string | null }> {
  const { userId } = await auth();
  if (!userId) return { isOwner: false, email: null, userId: null };
  const email = await getEmailForUser(userId);
  return { isOwner: !!email && ownerEmails().includes(email), email, userId };
}

export async function getAccessStatus(): Promise<{ isOwner: boolean; isAllowed: boolean; email: string | null; userId: string | null }> {
  const owner = await getOwnerStatus();
  const isAllowed = owner.isOwner || (await isEmailAllowed(owner.email));
  return { isOwner: owner.isOwner, isAllowed, email: owner.email, userId: owner.userId };
}

/** 403 Response unless the caller is the owner. */
export async function requireOwner(): Promise<Response | { isOwner: true; email: string; userId: string }> {
  const status = await getOwnerStatus();
  if (!status.isOwner || !status.email || !status.userId) {
    return Response.json({ error: "Owners only" }, { status: 403 });
  }
  return { isOwner: true, email: status.email, userId: status.userId };
}

/** 403 Response unless the caller is the owner or an approved waitlist user. */
export async function requireAccess(): Promise<Response | { isOwner: boolean; email: string; userId: string }> {
  const status = await getAccessStatus();
  if (!status.isAllowed || !status.email || !status.userId) {
    return Response.json({ error: "This product is private. Join the waitlist at the homepage" }, { status: 403 });
  }
  return { isOwner: status.isOwner, email: status.email, userId: status.userId };
}

export function isResponse(v: unknown): v is Response {
  return v instanceof Response;
}
