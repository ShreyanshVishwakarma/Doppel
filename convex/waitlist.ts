import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Public — no auth. Email is validated server-side (also re-validated in the API route).
export const join = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new Error("Invalid email address");
    }
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) return { ok: true, alreadyJoined: true as const };
    await ctx.db.insert("waitlist", { email, createdAt: Date.now() });
    return { ok: true, alreadyJoined: false as const };
  },
});

export const count = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query("waitlist").collect()).length;
  },
});

// ---- access control -------------------------------------------------------
// Approving a waitlist row is what grants a user access to the app. These
// functions are admin/internal only: the server holds SANDBOX_HARNESS_SECRET
// and never exposes it to the browser, same pattern as sandboxSessions.

function assertSecret(secret: string) {
  const expected = process.env.SANDBOX_HARNESS_SECRET;
  if (!expected || secret !== expected) throw new Error("Not authorized");
}

function normalize(email: string) {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) throw new Error("Invalid email address");
  return e;
}

/** Has this email been granted access? Used by the proxy and the API gate. */
export const isAllowed = query({
  args: { email: v.string(), secret: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", normalize(args.email)))
      .unique();
    return row?.status === "approved";
  },
});

/** Every waitlist entry with its access status, newest first. */
export const list = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const rows = await ctx.db.query("waitlist").collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({ email: r.email, status: r.status ?? "pending", createdAt: r.createdAt, approvedAt: r.approvedAt ?? null }));
  },
});

/** Grant or revoke access. Creates the row when the email is not on the waitlist. */
export const setStatus = mutation({
  args: {
    secret: v.string(),
    email: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved")),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const email = normalize(args.email);
    const now = Date.now();
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    const approvedAt = args.status === "approved" ? now : undefined;
    if (existing) {
      await ctx.db.patch(existing._id, { status: args.status, approvedAt });
      return { ok: true, email };
    }
    await ctx.db.insert("waitlist", { email, createdAt: now, status: args.status, approvedAt });
    return { ok: true, email };
  },
});
