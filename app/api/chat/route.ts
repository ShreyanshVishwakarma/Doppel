import { auth } from "@clerk/nextjs/server";

// Deprecated: use POST /api/run which forks a Solari Sandbox from the harness snapshot.
// This stub remains to avoid 404s from old clients.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });
  return Response.json(
    { error: "Use POST /api/run {prompt} — sandbox harness. See harness/README.md" },
    { status: 410 }
  );
}
