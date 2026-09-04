import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";

async function requireIdentity(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity;
}

export const create = mutation({
  args: {
    prompt: v.string(),
    markdown: v.string(),
    sandboxId: v.string(),
    snapshotId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const prompt = args.prompt.trim();
    if (!prompt || prompt.length > 5000) throw new Error("Prompt must be 1-5000 chars");
    if (args.markdown.length > 100000) throw new Error("Markdown too large");
    const now = Date.now();
    return await ctx.db.insert("sandboxSessions", {
      userId: identity.subject,
      sandboxId: args.sandboxId,
      snapshotId: args.snapshotId,
      prompt,
      // The sandbox reads the full markdown from /tmp/prompt.md; this copy is a
      // reference slice only. Capping it keeps reactive re-sends cheap.
      markdown: args.markdown.slice(0, 4000),
      status: "running",
      executionLogs: [`Sandbox ${args.sandboxId} started from ${args.snapshotId}`],
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("sandboxSessions"),
    status: v.optional(v.union(v.literal("creating"), v.literal("running"), v.literal("paused"), v.literal("completed"), v.literal("failed"))),
    logs: v.optional(v.array(v.string())),
    response: v.optional(v.string()),
    trace: v.optional(v.array(v.object({ ts: v.string(), type: v.string(), text: v.string() }))),
    errorMessage: v.optional(v.string()),
    browserSessionId: v.optional(v.string()),
    replayUrl: v.optional(v.string()),
    vncUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const sess = await ctx.db.get(args.id);
    if (!sess || sess.userId !== identity.subject) throw new Error("Not found");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.status) patch.status = args.status;
    if (args.errorMessage !== undefined) patch.errorMessage = args.errorMessage;
    if (args.browserSessionId) patch.browserSessionId = args.browserSessionId;
    if (args.replayUrl) patch.replayUrl = args.replayUrl;
    if (args.vncUrl) patch.vncUrl = args.vncUrl;
    if (args.response !== undefined) patch.response = args.response;
    if (args.trace !== undefined) patch.trace = args.trace;
    if (args.logs) {
      patch.executionLogs = [...(sess.executionLogs ?? []), ...args.logs].slice(-200);
    }
    await ctx.db.patch(args.id, patch);
  },
});

// Internal helper for server routes that already validated via Clerk auth header
export const updateBySandboxId = mutation({
  args: {
    sandboxId: v.string(),
    secret: v.string(),
    status: v.optional(v.union(v.literal("creating"), v.literal("running"), v.literal("paused"), v.literal("completed"), v.literal("failed"))),
    logs: v.optional(v.array(v.string())),
    errorMessage: v.optional(v.string()),
    replayUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expected = process.env.SANDBOX_HARNESS_SECRET;
    if (!expected || args.secret !== expected) throw new Error("Unauthorized harness");
    const sess = await ctx.db
      .query("sandboxSessions")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect()
      .then((all) => all.find((s) => s.sandboxId === args.sandboxId));
    if (!sess) return;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.status) patch.status = args.status;
    if (args.errorMessage !== undefined) patch.errorMessage = args.errorMessage;
    if (args.replayUrl) patch.replayUrl = args.replayUrl;
    if (args.logs) patch.executionLogs = [...(sess.executionLogs ?? []), ...args.logs].slice(-200);
    await ctx.db.patch(sess._id, patch);
  },
});

// Lightweight list for the sidebar: no markdown, no trace, no response, no logs.
// A full 20-row payload here is ~2KB instead of ~2MB, which matters because this
// query re-sends reactively on every trace update during a run.
export const listMineSummary = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db
      .query("sandboxSessions")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .take(20);
    return rows.map((s) => ({
      _id: s._id,
      status: s.status,
      prompt: s.prompt.slice(0, 200),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt ?? s.createdAt,
      sandboxId: s.sandboxId,
      browserSessionId: s.browserSessionId,
      replayUrl: s.replayUrl,
      errorMessage: s.errorMessage,
      traceCount: s.trace?.length ?? 0,
    }));
  },
});

// Full detail (trace, response, logs) for ONE session — the one on screen.
export const getDetail = query({
  args: { id: v.id("sandboxSessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const s = await ctx.db.get(args.id);
    if (!s || s.userId !== identity.subject) throw new Error("Not found");
    return {
      _id: s._id,
      status: s.status,
      prompt: s.prompt,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt ?? s.createdAt,
      sandboxId: s.sandboxId,
      snapshotId: s.snapshotId,
      browserSessionId: s.browserSessionId,
      replayUrl: s.replayUrl,
      errorMessage: s.errorMessage,
      trace: s.trace,
      response: s.response,
      executionLogs: s.executionLogs,
    };
  },
});

export const get = query({
  args: { id: v.id("sandboxSessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const sess = await ctx.db.get(args.id);
    if (!sess || sess.userId !== identity.subject) throw new Error("Not found");
    return sess;
  },
});
