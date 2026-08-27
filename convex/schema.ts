import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  workspaces: defineTable({
    key: v.string(),
    payload: v.any(),
    revision: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
