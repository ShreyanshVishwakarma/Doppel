import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery, mutation, query, type MutationCtx } from "./_generated/server";

const MAX_MARKDOWN_BYTES = 100_000;
const MAX_RESUME_BYTES = 10_000_000;
const allowedResumeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
]);

async function requireIdentity(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated — sign in via Clerk");
  return identity;
}

function validateLink(value: string, label: string) {
  if (!value) return;
  if (value.length > 500) throw new Error(`${label} is too long`);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("protocol");
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
}

async function validateStoredFile(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  purpose: "markdown" | "resume",
) {
  const metadata = await ctx.db.system.get(storageId);
  if (!metadata) throw new Error(`${purpose} file was not found`);

  const maxBytes = purpose === "markdown" ? MAX_MARKDOWN_BYTES : MAX_RESUME_BYTES;
  if (metadata.size > maxBytes) throw new Error(`${purpose} file exceeds the size limit`);

  const contentType = metadata.contentType?.toLowerCase() ?? "";
  if (purpose === "markdown" && contentType !== "text/markdown") {
    throw new Error("Markdown file must use text/markdown content type");
  }
  if (purpose === "resume" && !allowedResumeTypes.has(contentType)) {
    throw new Error("Resume must be a PDF, Word document, or Markdown file");
  }
}

/** Generate a short-lived Convex file upload URL for an authenticated user. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Upsert the current user's onboarding profile and sync the users table. */
export const saveProfile = mutation({
  args: {
    role: v.union(v.literal("student"), v.literal("professional")),
    bio: v.string(),
    markdown: v.string(),
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
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const userId = identity.subject;
    const tokenIdentifier = identity.tokenIdentifier;
    const now = Date.now();

    if (args.bio.trim().length < 40 || args.bio.length > 20_000) {
      throw new Error("Bio paragraph must be between 40 and 20,000 characters");
    }
    if (args.markdown.length > MAX_MARKDOWN_BYTES) throw new Error("Markdown context is too large");
    if (args.resumeFileName && args.resumeFileName.length > 255) throw new Error("Resume filename is too long");

    validateLink(args.links.linkedin, "LinkedIn URL");
    validateLink(args.links.github, "GitHub URL");
    validateLink(args.links.twitter, "X URL");
    validateLink(args.links.portfolio, "Portfolio URL");
    await validateStoredFile(ctx, args.markdownStorageId, "markdown");
    if (args.resumeStorageId) await validateStoredFile(ctx, args.resumeStorageId, "resume");

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        clerkId: userId,
        email: identity.email ?? existingUser.email,
        name: identity.name ?? existingUser.name,
        imageUrl: identity.pictureUrl ?? existingUser.imageUrl,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("users", {
        tokenIdentifier,
        clerkId: userId,
        email: identity.email,
        name: identity.name,
        imageUrl: identity.pictureUrl,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        tokenIdentifier,
        role: args.role,
        bio: args.bio,
        markdown: args.markdown,
        markdownStorageId: args.markdownStorageId,
        resumeStorageId: args.resumeStorageId,
        resumeFileName: args.resumeFileName,
        links: args.links,
        preferences: args.preferences,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("profiles", {
      userId,
      tokenIdentifier,
      role: args.role,
      bio: args.bio,
      markdown: args.markdown,
      markdownStorageId: args.markdownStorageId,
      resumeStorageId: args.resumeStorageId,
      resumeFileName: args.resumeFileName,
      links: args.links,
      preferences: args.preferences,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Current user's profile (or null if not onboarded). */
export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .unique();
  },
});

/** Current user's profile plus signed URLs for their own files. */
export const getMyProfileWithUrls = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .unique();
    if (!profile) return null;
    const markdownUrl = await ctx.storage.getUrl(profile.markdownStorageId);
    const resumeUrl = profile.resumeStorageId ? await ctx.storage.getUrl(profile.resumeStorageId) : null;
    return { profile, markdownUrl, resumeUrl };
  },
});

/** Private profile read used only by the scheduled worker. */
export const getForExecution = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!profile) return null;
    return {
      markdown: profile.markdown,
      resumeStorageId: profile.resumeStorageId,
      role: profile.role,
      preferences: profile.preferences,
    };
  },
});
