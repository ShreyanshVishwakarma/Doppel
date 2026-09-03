import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";

const joinSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

// POST /api/waitlist { email } — public, no auth. Stored in Convex `waitlist`.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return Response.json({ error: "Server not configured" }, { status: 503 });

  try {
    const convex = new ConvexHttpClient(url);
    const result = await convex.mutation(api.waitlist.join, { email: parsed.data.email });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
