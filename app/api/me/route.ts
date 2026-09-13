import { getAccessStatus } from "../../../lib/owner";

// GET /api/me — owner flag plus whether the signed-in user may use the app.
export async function GET() {
  const status = await getAccessStatus();
  return Response.json({ owner: status.isOwner, allowed: status.isAllowed, email: status.email });
}
