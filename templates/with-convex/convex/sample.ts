import { v, type Infer } from "convex/values";

import { internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import {
  action,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server.js";
import { sampleDocumentValidator, sampleInputValidator, sampleKindValidator } from "./schema.js";

type SampleInput = Infer<typeof sampleInputValidator>;

const fixtureIdFor = (sample: SampleInput): string => `${sample.id}:${sample.kind}`;

const upsertSample = async (ctx: MutationCtx, sample: SampleInput): Promise<Id<"samples">> => {
  const fixtureId = fixtureIdFor(sample);
  const existing = await ctx.db
    .query("samples")
    .withIndex("by_fixture_id", (q) => q.eq("fixtureId", fixtureId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, { ...sample, fixtureId });
    return existing._id;
  }

  return await ctx.db.insert("samples", { ...sample, fixtureId });
};

export const list = query({
  args: {
    kind: v.optional(sampleKindValidator),
  },
  returns: v.array(sampleDocumentValidator),
  handler: async (ctx, args) => {
    const kind = args.kind;
    if (kind === undefined) {
      return await ctx.db.query("samples").collect();
    }

    return await ctx.db
      .query("samples")
      .withIndex("by_kind", (q) => q.eq("kind", kind))
      .collect();
  },
});

export const save = mutation({
  args: {
    sample: sampleInputValidator,
  },
  returns: v.id("samples"),
  handler: async (ctx, args) => upsertSample(ctx, args.sample),
});

export const persist = internalMutation({
  args: {
    sample: sampleInputValidator,
  },
  returns: v.id("samples"),
  handler: async (ctx, args) => upsertSample(ctx, args.sample),
});

export const saveFromAction = action({
  args: {
    sample: sampleInputValidator,
  },
  returns: v.id("samples"),
  handler: async (ctx, args): Promise<Id<"samples">> =>
    await ctx.runMutation(internal["sample"].persist, { sample: args.sample }),
});
