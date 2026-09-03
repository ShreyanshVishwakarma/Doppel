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
