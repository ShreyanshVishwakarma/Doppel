import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";

function getConvex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not configured");
  return new ConvexHttpClient(url);
}

const killSchema = z.object({ sessionId: z.string().min(1) });

// POST /api/sessions/kill { sessionId } — stop a running sandbox + mark the session stopped.
export async function POST(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = killSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "sessionId required" }, { status: 400 });

  const token = await getToken({ template: "convex" });
  if (!token) return Response.json({ error: "Convex JWT not configured" }, { status: 503 });
  const convex = getConvex();
  convex.setAuth(token);

  const sess = await convex.query(api.sandboxSessions.get, { id: parsed.data.sessionId as never }).catch(() => null);
  if (!sess) return Response.json({ error: "Session not found" }, { status: 404 });
  if (sess.status !== "running" && sess.status !== "creating") {
    return Response.json({ error: `Session is ${sess.status} — nothing to stop` }, { status: 409 });
  }

  const apiKey = process.env.SOLARI_API_KEY;
  if (apiKey) {
    try {
      const { SandboxClient } = await import("@solarisdk/sandbox");
      const sandboxes = new SandboxClient({ apiKey, baseUrl: "https://api.getsolari.com" });
      await sandboxes.kill(sess.sandboxId);
    } catch (e) {
      // kill is idempotent server-side; a 404 just means it already died
      const msg = (e as Error).message ?? "";
      if (!/404|not found/i.test(msg)) {
        await convex.mutation(api.sandboxSessions.update, {
          id: parsed.data.sessionId as never,
          status: "failed",
          errorMessage: `Stop failed: ${msg.slice(0, 200)}`,
        }).catch(() => {});
        return Response.json({ error: `Failed to stop sandbox: ${msg.slice(0, 300)}` }, { status: 502 });
      }
    }
  }

  await convex.mutation(api.sandboxSessions.update, {
    id: parsed.data.sessionId as never,
    status: "failed",
    errorMessage: "Stopped by you",
  }).catch(() => {});

  return Response.json({ ok: true, sessionId: parsed.data.sessionId });
}
