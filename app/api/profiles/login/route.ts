import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";

function getConvex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not configured");
  return new ConvexHttpClient(url);
}

const loginSchema = z.object({ platform: z.string().trim().min(2).max(40).toLowerCase() });

// POST /api/profiles/login { platform }
// Generates a hosted login-handoff URL for the platform's browser profile.
// The end user opens the link, logs into the site, hits Save — no Solari account needed.
export async function POST(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "platform required" }, { status: 400 });

  const apiKey = process.env.SOLARI_API_KEY;
  if (!apiKey) return Response.json({ error: "SOLARI_API_KEY not configured" }, { status: 503 });

  const token = await getToken({ template: "convex" });
  if (!token) return Response.json({ error: "Convex JWT not configured" }, { status: 503 });
  const convex = getConvex();
  convex.setAuth(token);

  const mapping = await convex.query(api.browserProfiles.getForUser, { platform: parsed.data.platform }).catch(() => null);
  if (!mapping) return Response.json({ error: `No profile connected for ${parsed.data.platform} — connect it first` }, { status: 404 });

  const { Solari } = await import("@solarisdk/browser");
  const client = new Solari({ apiKey, baseUrl: "https://api.getsolari.com" });
  const res = await fetch(`https://api.getsolari.com/profiles/${encodeURIComponent(mapping.solariProfileId)}/login-handoff`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: `Doppel needs you signed in to ${parsed.data.platform} so it can act on your behalf. Log in and click Save — your credentials never pass through Doppel.` }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return Response.json({ error: `Login handoff failed: ${res.status} ${txt.slice(0, 200)}` }, { status: 502 });
  }
  const h = (await res.json()) as { handoffId?: string; url?: string; expiresAt?: string; version?: number };
  if (!h.url) return Response.json({ error: "Solari returned no login URL" }, { status: 502 });

  return Response.json({ ok: true, platform: parsed.data.platform, profileId: mapping.solariProfileId, url: h.url, expiresAt: h.expiresAt, sinceVersion: h.version ?? null });
}
