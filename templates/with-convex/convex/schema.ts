import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const sampleKindValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);

export const accountRoleValidator = v.union(
  v.literal("admin"),
  v.literal("member"),
  v.literal("viewer"),
);

export const sampleInputValidator = v.union(
  v.object({
    id: v.string(),
    kind: v.literal("draft"),
    title: v.string(),
  }),
  v.object({
    id: v.string(),
    kind: v.literal("published"),
    publishedAt: v.string(),
    title: v.string(),
  }),
  v.object({
    archivedAt: v.string(),
    id: v.string(),
    kind: v.literal("archived"),
    title: v.string(),
  }),
);

export const sampleStoredValidator = v.union(
  v.object({
    fixtureId: v.string(),
    id: v.string(),
    kind: v.literal("draft"),
    title: v.string(),
  }),
  v.object({
    fixtureId: v.string(),
    id: v.string(),
    kind: v.literal("published"),
    publishedAt: v.string(),
    title: v.string(),
  }),
  v.object({
    archivedAt: v.string(),
    fixtureId: v.string(),
    id: v.string(),
    kind: v.literal("archived"),
    title: v.string(),
  }),
);

export const sampleDocumentValidator = v.union(
  v.object({
    _creationTime: v.number(),
    _id: v.id("samples"),
    fixtureId: v.string(),
    id: v.string(),
    kind: v.literal("draft"),
    title: v.string(),
  }),
  v.object({
    _creationTime: v.number(),
    _id: v.id("samples"),
    fixtureId: v.string(),
    id: v.string(),
    kind: v.literal("published"),
    publishedAt: v.string(),
    title: v.string(),
  }),
  v.object({
    _creationTime: v.number(),
    _id: v.id("samples"),
    archivedAt: v.string(),
    fixtureId: v.string(),
    id: v.string(),
    kind: v.literal("archived"),
    title: v.string(),
  }),
);

const samples = defineTable(sampleStoredValidator)
  .index("by_sample_id", ["id"])
  .index("by_kind", ["kind"])
  .index("by_fixture_id", ["fixtureId"]);

const devAccounts = defineTable({
  accountId: v.string(),
  email: v.string(),
  environment: v.literal("development"),
  role: accountRoleValidator,
})
  .index("by_account_id", ["accountId"])
  .index("by_email", ["email"]);

export default defineSchema({
  devAccounts,
  samples,
});
