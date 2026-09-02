import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // metadata assets — crawlers fetch these without a session
  "/opengraph-image(.*)",
  "/icon.svg",
  "/favicon.ico",
]);

export default clerkMiddleware(async (auth, req) => {
  // Proxy is only an optimistic boundary. Convex and route handlers still
  // enforce authorization before accessing data or starting work.
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
