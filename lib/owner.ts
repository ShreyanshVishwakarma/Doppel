import { auth, clerkClient } from "@clerk/nextjs/server";

/**
 * Access control for the app.
 *
 * The app is open: any signed-in user may use it. Ownership (OWNER_EMAILS) only
 * gates the admin surfaces, such as the waitlist admin endpoints.
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

export async function getOwnerStatus(): Promise<{ isOwner: boolean; email: string | null; userId: string | null }> {
  const { userId } = await auth();
  if (!userId) return { isOwner: false, email: null, userId: null };
  const email = await getEmailForUser(userId);
  return { isOwner: !!email && ownerEmails().includes(email), email, userId };
}

/** 403 Response unless the caller is the owner. */
export async function requireOwner(): Promise<Response | { isOwner: true; email: string; userId: string }> {
  const status = await getOwnerStatus();
  if (!status.isOwner || !status.email || !status.userId) {
    return Response.json({ error: "Owners only" }, { status: 403 });
  }
  return { isOwner: true, email: status.email, userId: status.userId };
}

/** 401 Response unless the caller is signed in. */
export async function requireAccess(): Promise<Response | { userId: string }> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return { userId };
}

export function isResponse(v: unknown): v is Response {
  return v instanceof Response;
}
