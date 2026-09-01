import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";

function getConvex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not configured");
  return new ConvexHttpClient(url);
}

// POST /api/profiles { platform: "gmail" | "linkedin" | "twitter" | "github", name? }
// Creates a Solari browser profile (cookies/storageState holder) and saves mapping to Convex.
// User then opens console.getsolari.com → Profiles → Open editor to log in and Save.
const createSchema = z.object({
  platform: z.string().trim().min(2).max(40).toLowerCase(),
  name: z.string().trim().max(80).optional(),
});

export async function GET() {
  const { userId, getToken } = await auth();
  if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });
  const apiKey = process.env.SOLARI_API_KEY;
  if (!apiKey) return Response.json({ error: "SOLARI_API_KEY not configured" }, { status: 503 });

  const token = await getToken({ template: "convex" });
  if (!token) return Response.json({ error: "Convex JWT not configured" }, { status: 503 });
  const convex = getConvex();
  convex.setAuth(token);

  let convexProfiles: Array<{ _id: string; platform: string; solariProfileId: string; status: string; lastUsedAt: number }> = [];
  try {
    convexProfiles = (await convex.query(api.browserProfiles.listMine, {})) as typeof convexProfiles;
  } catch (e) {
    return Response.json({ error: `Convex read failed: ${(e as Error).message}` }, { status: 503 });
  }

  // Also list raw Solari profiles for this API key (account-scoped)
  let solariProfiles: Array<{ id: string; name: string }> = [];
  try {
    const { Solari } = await import("@solarisdk/browser");
    const client = new Solari({ apiKey, baseUrl: "https://api.getsolari.com" });
    const list = await (client.profiles.list as () => Promise<Array<{ id: string; name: string }>>)();
    solariProfiles = list;
  } catch {
    // non-fatal — Convex mapping is source of truth
  }

  return Response.json({ convexProfiles, solariProfiles });
}

export async function POST(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "platform required (gmail | linkedin | twitter | github)" }, { status: 400 });

  const platform = parsed.data.platform;
  const apiKey = process.env.SOLARI_API_KEY;
  if (!apiKey) return Response.json({ error: "SOLARI_API_KEY not configured" }, { status: 503 });

  const token = await getToken({ template: "convex" });
  if (!token) return Response.json({ error: "Convex JWT not configured" }, { status: 503 });
  const convex = getConvex();
  convex.setAuth(token);

  // Create profile on Solari
  let solariProfile: { id: string; name: string };
  try {
    const { Solari } = await import("@solarisdk/browser");
    const client = new Solari({ apiKey, baseUrl: "https://api.getsolari.com" });
    const name = parsed.data.name ?? `${platform}-${userId.slice(0, 6)}`;
    solariProfile = await client.profiles.create({ name });
  } catch (e) {
    return Response.json({ error: `Solari profile create failed: ${(e as Error).message}` }, { status: 502 });
  }

  // Save mapping to Convex
  try {
    await convex.mutation(api.browserProfiles.save, {
      platform,
      solariProfileId: solariProfile.id,
      status: "active",
    });
  } catch (e) {
    return Response.json({ error: `Convex save failed: ${(e as Error).message}`, solariProfile }, { status: 500 });
  }

  return Response.json({
    ok: true,
    platform,
    solariProfileId: solariProfile.id,
    next: "Open https://console.getsolari.com → Profiles → Open editor → log into " + platform + " → Save. Then future runs will auto-attach this profile.",
    editorHint: "console.getsolari.com/profiles/" + solariProfile.id,
  });
}

export async function DELETE(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });
  const url = new URL(req.url);
  const platform = url.searchParams.get("platform")?.toLowerCase();
  if (!platform) return Response.json({ error: "platform query param required" }, { status: 400 });

  const apiKey = process.env.SOLARI_API_KEY;
  if (!apiKey) return Response.json({ error: "SOLARI_API_KEY not configured" }, { status: 503 });
  const token = await getToken({ template: "convex" });
  if (!token) return Response.json({ error: "Convex JWT not configured" }, { status: 503 });
  const convex = getConvex();
  convex.setAuth(token);

  // Find Convex mapping
  let mapping: { solariProfileId: string } | null = null;
  try {
    const got = await convex.query(api.browserProfiles.getForUser, { platform });
    if (got && typeof got === "object" && "solariProfileId" in got) mapping = got as { solariProfileId: string };
  } catch {}
  const solariId: string | undefined = mapping?.solariProfileId;
  if (solariId) {
    try {
      const { Solari } = await import("@solarisdk/browser");
      const client = new Solari({ apiKey, baseUrl: "https://api.getsolari.com" });
      await (client.profiles.delete as (id: string) => Promise<void>)(solariId);
    } catch {}
  }
  // Mark needs_reauth instead of deleting row so UI keeps platform entry
  try {
    if (mapping && solariId) {
      const list = (await convex.query(api.browserProfiles.listMine, {})) as Array<{ _id: string; platform: string }>;
      const row = list.find((r) => r.platform === platform);
      if (row) {
        await convex.mutation(api.browserProfiles.save, { platform, solariProfileId: solariId, status: "needs_reauth" });
      }
    }
  } catch {}
  return Response.json({ ok: true, platform });
}
