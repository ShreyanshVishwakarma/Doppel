import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getEmailForUser, isEmailAllowed } from "./lib/owner";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/waitlist(.*)",
  // cron has no Clerk session — the handler authenticates via CRON_SECRET itself
  "/api/cron(.*)",
  // metadata assets — crawlers fetch these without a session
  "/opengraph-image(.*)",
  "/icon.svg",
  "/favicon.ico",
]);

// Invite-only: the owner and any waitlist email they approved may open the app.
// Everyone else, signed in or not, is bounced to the landing page.
const isPrivateAppRoute = createRouteMatcher(["/dashboard(.*)", "/settings(.*)", "/onboarding(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // Proxy is only an optimistic boundary. API routes re-check access
  // server-side before touching Solari compute or user data.
  if (isPrivateAppRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    const email = await getEmailForUser(userId);
    if (!(await isEmailAllowed(email))) {
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
