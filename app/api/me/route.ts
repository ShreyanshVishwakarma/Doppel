import { getOwnerStatus } from "../../../lib/owner";

// GET /api/me — tells the client whether the signed-in user is the owner.
export async function GET() {
  const status = await getOwnerStatus();
  return Response.json({ owner: status.isOwner, email: status.email });
}
