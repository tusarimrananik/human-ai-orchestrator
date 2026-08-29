import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const workspacePayload = v.object({
  schemaVersion: v.union(v.literal(1), v.literal(2)),
  tasks: v.array(v.any()),
  batchPriorityOrder: v.array(v.string()),
  parallelGroups: v.array(v.object({ id: v.string(), name: v.string(), slotLimit: v.number() })),
  isParallelModeActive: v.boolean(),
  activeTurnGroupName: v.string(),
});

function payloadsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return identity ? { id: identity.subject, email: identity.email ?? null, name: identity.name ?? null } : null;
  },
});

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db.query("workspaces").withIndex("by_key", (q) => q.eq("key", identity.subject)).unique();
  },
});

export const save = mutation({
  args: {
    payload: workspacePayload,
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    const key = identity.subject;
    const existing = await ctx.db.query("workspaces").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (existing && payloadsEqual(existing.payload, args.payload)) {
      return { ok: true as const, revision: existing.revision, updatedAt: existing.updatedAt };
    }
    if ((!existing && args.expectedRevision !== 0) || (existing && existing.revision !== args.expectedRevision)) {
      return { ok: false as const, revision: existing?.revision ?? 0, updatedAt: existing?.updatedAt ?? 0 };
    }

    const revision = (existing?.revision ?? 0) + 1;
    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { payload: args.payload, revision, updatedAt });
    } else {
      await ctx.db.insert("workspaces", { key, payload: args.payload, revision, updatedAt });
    }
    return { ok: true as const, revision, updatedAt };
  },
});

export const forceSave = mutation({
  args: {
    payload: workspacePayload,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    const key = identity.subject;
    const existing = await ctx.db.query("workspaces").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (existing && payloadsEqual(existing.payload, args.payload)) {
      return { ok: true as const, revision: existing.revision, updatedAt: existing.updatedAt };
    }
    const revision = (existing?.revision ?? 0) + 1;
    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { payload: args.payload, revision, updatedAt });
    } else {
      await ctx.db.insert("workspaces", { key, payload: args.payload, revision, updatedAt });
    }
    return { ok: true as const, revision, updatedAt };
  },
});

export const adminClearTasks = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("workspaces").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (existing) {
      const revision = existing.revision + 1;
      const updatedAt = Date.now();
      const updatedPayload = {
        ...existing.payload,
        tasks: [],
      };
      await ctx.db.patch(existing._id, { payload: updatedPayload, revision, updatedAt });
      return { ok: true as const, revision, count: 0 };
    }
    return { ok: false as const, message: "Workspace not found" };
  },
});

export const adminSetWorkspace = mutation({
  args: {
    key: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("workspaces").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    const revision = (existing?.revision ?? 0) + 1;
    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { payload: args.payload, revision, updatedAt });
    } else {
      await ctx.db.insert("workspaces", { key: args.key, payload: args.payload, revision, updatedAt });
    }
    return { ok: true as const, revision, taskCount: args.payload.tasks.length };
  },
});
