import { clerkMiddleware, createRouteMatcher, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/waitlist(.*)",
  // metadata assets — crawlers fetch these without a session
  "/opengraph-image(.*)",
  "/icon.svg",
  "/favicon.ico",
]);

// Private while in beta: only allowlisted owners may open the app.
// Everyone else — signed in or not — is bounced to the landing page.
const isPrivateAppRoute = createRouteMatcher(["/dashboard(.*)", "/settings(.*)", "/onboarding(.*)"]);

async function isOwner(userId: string): Promise<boolean> {
  const allowed = (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email = user.primaryEmailAddress?.emailAddress.toLowerCase();
    return !!email && allowed.includes(email);
  } catch {
    return false;
  }
}

export default clerkMiddleware(async (auth, req) => {
  // Proxy is only an optimistic boundary. API routes re-check ownership
  // server-side before touching Solari compute or user data.
  if (isPrivateAppRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    if (!(await isOwner(userId))) {
      return NextResponse.redirect(new URL("/?waitlisted=1", req.url));
    }
  }
  if (!isPublicRoute(req) && !isPrivateAppRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
