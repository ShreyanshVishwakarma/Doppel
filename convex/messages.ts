import { query } from "./_generated/server";

/**
 * Example from Convex & Clerk docs — requires ConvexProviderWithClerk.
 * Returns identity for authenticated user; throws if not authenticated.
 * Make sure caller is inside <Authenticated> from convex/react.
 */
export const getForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }
    // Example: fetch messages by author — adapt to your schema
    // return await ctx.db.query("messages").withIndex("by_author", (q) => q.eq("author", identity.email)).collect();
    return { identity };
  },
});

export const getIdentity = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.auth.getUserIdentity();
  },
});
