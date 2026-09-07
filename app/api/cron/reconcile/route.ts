import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { syncSandboxSession } from "../../../../lib/harness-sync";

export const maxDuration = 300;

function getConvex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not configured");
  return new ConvexHttpClient(url);
}

// GET /api/cron/reconcile — backstop for sessions nobody is watching:
// syncs every live session and destroys orphaned/stale VMs. Triggered by
// Vercel Cron (vercel.json), which sends
// `Authorization: Bearer <CRON_SECRET>` automatically when CRON_SECRET is set.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const authHeader = req.headers.get("authorization") ?? "";
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret") ?? "";
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const harnessSecret = process.env.SANDBOX_HARNESS_SECRET;
  const apiKey = process.env.SOLARI_API_KEY;
  if (!harnessSecret) return Response.json({ error: "SANDBOX_HARNESS_SECRET not configured" }, { status: 503 });
  if (!apiKey) return Response.json({ error: "SOLARI_API_KEY not configured" }, { status: 503 });

  const convex = getConvex();
  const live = await convex.query(api.sandboxSessions.listForReconcile, { secret: harnessSecret });
  const results: Array<{ sandboxId: string; finalized: boolean; status?: string; note: string }> = [];
  for (const s of live) {
    try {
      const out = await syncSandboxSession({
        apiKey,
        sandboxId: s.sandboxId,
        lastUpdateMs: s.updatedAt,
        mutate: async (update) => {
          await convex.mutation(api.sandboxSessions.updateBySandboxId, { sandboxId: s.sandboxId, secret: harnessSecret, ...update });
        },
      });
      results.push({ sandboxId: s.sandboxId, ...out });
    } catch (e) {
      results.push({ sandboxId: s.sandboxId, finalized: false, note: `error: ${(e as Error).message.slice(0, 200)}` });
    }
  }
  return Response.json({ ok: true, synced: results.length, results });
}
