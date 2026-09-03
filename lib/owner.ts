import { auth, clerkClient } from "@clerk/nextjs/server";

/**
 * Owner allowlist — while the product is private, only these Clerk account
 * emails may reach the app or spend Solari compute. Comma-separated in OWNER_EMAILS.
 */
export async function getOwnerStatus(): Promise<{ isOwner: boolean; email: string | null; userId: string | null }> {
  const { userId } = await auth();
  if (!userId) return { isOwner: false, email: null, userId: null };
  const allowed = (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return { isOwner: false, email: null, userId };
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email = user.primaryEmailAddress?.emailAddress.toLowerCase() ?? null;
    return { isOwner: !!email && allowed.includes(email), email, userId };
  } catch {
    return { isOwner: false, email: null, userId };
  }
}

/** Throws a 403 Response if the caller is not the owner. Returns owner status otherwise. */
export async function requireOwner(): Promise<Response | { isOwner: true; email: string; userId: string }> {
  const status = await getOwnerStatus();
  if (!status.isOwner || !status.email || !status.userId) {
    throw Response.json({ error: "This product is private — join the waitlist at the homepage" }, { status: 403 });
  }
  return { isOwner: true, email: status.email, userId: status.userId };
}

export function isResponse(v: unknown): v is Response {
  return v instanceof Response;
}
