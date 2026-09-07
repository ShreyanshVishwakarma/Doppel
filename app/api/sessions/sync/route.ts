import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import { requireOwner, isResponse } from "../../../../lib/owner";
import { syncSandboxSession } from "../../../../lib/harness-sync";

export const maxDuration = 60;

function getConvex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not configured");
  return new ConvexHttpClient(url);
}

const syncSchema = z.object({ sessionId: z.string().min(1) });

// POST /api/sessions/sync { sessionId } — reconcile one live session:
// pull trace/browser/replay/result from its sandbox VM into Convex, and if
// the harness wrote /tmp/result.json (or the VM is gone/stale), finalize the
// session and destroy the VM. Short-lived by design; the dashboard polls it
// while a session is running, so no request ever needs to outlive maxDuration.
export async function POST(req: Request) {
  const gate = await requireOwner();
  if (isResponse(gate)) return gate;
  const { userId, getToken } = await auth();
  if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = syncSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "sessionId required" }, { status: 400 });

  const apiKey = process.env.SOLARI_API_KEY;
  if (!apiKey) return Response.json({ error: "SOLARI_API_KEY not configured" }, { status: 503 });

  const token = await getToken({ template: "convex" });
  if (!token) return Response.json({ error: "Convex JWT not configured" }, { status: 503 });
  const convex = getConvex();
  convex.setAuth(token);

  const sess = await convex.query(api.sandboxSessions.get, { id: parsed.data.sessionId as never }).catch(() => null);
  if (!sess) return Response.json({ error: "Session not found" }, { status: 404 });
  if (sess.userId !== userId) return Response.json({ error: "Session not found" }, { status: 404 });
  if (sess.status !== "running" && sess.status !== "creating") {
    return Response.json({ ok: true, status: sess.status, note: "terminal — nothing to sync" });
  }

  try {
    const out = await syncSandboxSession({
      apiKey,
      sandboxId: sess.sandboxId,
      lastUpdateMs: sess.updatedAt ?? sess.createdAt,
      mutate: async (update) => {
        await convex.mutation(api.sandboxSessions.update, { id: sess._id as never, ...update } as never);
      },
    });
    return Response.json({ ok: true, ...out });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message.slice(0, 300) }, { status: 502 });
  }
}
