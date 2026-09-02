import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Clerk-linked users — synced on first profile save
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkId: v.string(), // identity.subject
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_clerkId", ["clerkId"]),

  // Single onboarding profile per user — paragraph + tailored prefs + markdown file refs
  profiles: defineTable({
    userId: v.string(), // Clerk subject (stable)
    tokenIdentifier: v.string(),
    role: v.union(v.literal("student"), v.literal("professional")),
    bio: v.string(), // the single paragraph
    markdown: v.string(), // full markdown content (also stored as file)
    markdownStorageId: v.id("_storage"),
    resumeStorageId: v.optional(v.id("_storage")),
    resumeFileName: v.optional(v.string()),
    links: v.object({
      linkedin: v.string(),
      github: v.string(),
      twitter: v.string(),
      portfolio: v.string(),
    }),
    preferences: v.object({
      tone: v.string(),
      targetRoles: v.string(),
      locations: v.string(),
      emailVolume: v.string(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_tokenIdentifier", ["tokenIdentifier"]),

  // Solari persistent browser profiles per platform (storageState)
  browserProfiles: defineTable({
    userId: v.string(),
    platform: v.string(), // "linkedin" | "gmail" | "twitter" | "greenhouse"
    solariProfileId: v.string(), // prof_xxx
    status: v.union(v.literal("active"), v.literal("needs_reauth")),
    lastUsedAt: v.number(),
  })
    .index("by_user_platform", ["userId", "platform"])
    .index("by_userId", ["userId"]),

  // Sandbox harness sessions — one per prompt. Each is a Solari Sandbox
  // that boots from the opencode harness snapshot and streams logs.
  sandboxSessions: defineTable({
    userId: v.string(),
    sandboxId: v.string(), // sbx_xxx from Solari
    snapshotId: v.string(), // snap_xxx forked from
    prompt: v.string(),
    markdown: v.string(), // slice of user markdown fed to harness
    status: v.union(
      v.literal("creating"),
      v.literal("running"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    browserSessionId: v.optional(v.string()),
    replayUrl: v.optional(v.string()),
    vncUrl: v.optional(v.string()),
    executionLogs: v.optional(v.array(v.string())),
    response: v.optional(v.string()),
    trace: v.optional(v.array(v.object({ ts: v.string(), type: v.string(), text: v.string() }))),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),
});
