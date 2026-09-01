import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

async function requireIdentity(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity;
}

export const save = mutation({
  args: {
    platform: v.string(),
    solariProfileId: v.string(),
    status: v.union(v.literal("active"), v.literal("needs_reauth")),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const existing = await ctx.db
      .query("browserProfiles")
      .withIndex("by_user_platform", (q) => q.eq("userId", identity.subject).eq("platform", args.platform))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { solariProfileId: args.solariProfileId, status: args.status, lastUsedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("browserProfiles", {
      userId: identity.subject,
      platform: args.platform,
      solariProfileId: args.solariProfileId,
      status: args.status,
      lastUsedAt: now,
    });
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const all = await ctx.db.query("browserProfiles").collect();
    return all.filter((p) => p.userId === identity.subject);
  },
});

export const getForUser = query({
  args: { platform: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("browserProfiles")
      .withIndex("by_user_platform", (q) => q.eq("userId", identity.subject).eq("platform", args.platform))
      .unique();
  },
});
