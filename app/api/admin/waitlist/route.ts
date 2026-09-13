import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import { requireOwner, isResponse } from "../../../../lib/owner";

export const dynamic = "force-dynamic";

function getConvex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not configured");
  return new ConvexHttpClient(url);
}

function getSecret() {
  const secret = process.env.SANDBOX_HARNESS_SECRET;
  if (!secret) throw new Error("SANDBOX_HARNESS_SECRET not configured");
  return secret;
}

const setSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  status: z.union([z.literal("pending"), z.literal("approved")]),
});

// GET /api/admin/waitlist — owner only. Every waitlist entry with access status.
export async function GET() {
  const gate = await requireOwner();
  if (isResponse(gate)) return gate;
  try {
    const entries = await getConvex().query(api.waitlist.list, { secret: getSecret() });
    return Response.json({ entries });
  } catch (e) {
    return Response.json({ error: (e as Error).message.slice(0, 200) }, { status: 503 });
  }
}

// POST /api/admin/waitlist { email, status } — owner only. Grant or revoke access.
export async function POST(req: Request) {
  const gate = await requireOwner();
  if (isResponse(gate)) return gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = setSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "email and status required" }, { status: 400 });

  try {
    const out = await getConvex().mutation(api.waitlist.setStatus, {
      secret: getSecret(),
      email: parsed.data.email,
      status: parsed.data.status,
    });
    return Response.json(out);
  } catch (e) {
    return Response.json({ error: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
