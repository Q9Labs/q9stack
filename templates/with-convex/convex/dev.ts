import { v } from "convex/values";

import type { Id } from "./_generated/dataModel.js";
import { internalMutation, query } from "./_generated/server.js";
import { accountRoleValidator } from "./schema.js";

const devAccountResultValidator = v.object({
  email: v.string(),
  environment: v.literal("development"),
  id: v.string(),
  role: accountRoleValidator,
});

const ensureDevelopmentEnvironment = (): void => {
  if (process.env["APP_ENV"] !== "dev") {
    throw new Error("APP_ENV must be set to dev for development Convex functions");
  }
};

export const listAccounts = query({
  args: {},
  returns: v.array(devAccountResultValidator),
  handler: async (ctx) => {
    ensureDevelopmentEnvironment();

    const accounts = await ctx.db.query("devAccounts").withIndex("by_email").collect();

    return accounts.map((account) => ({
      email: account.email,
      environment: "development" as const,
      id: account.accountId,
      role: account.role,
    }));
  },
});

export const persistAccount = internalMutation({
  args: {
    accountId: v.string(),
    email: v.string(),
    role: accountRoleValidator,
  },
  returns: v.id("devAccounts"),
  handler: async (ctx, args): Promise<Id<"devAccounts">> => {
    ensureDevelopmentEnvironment();

    const existingByEmail = await ctx.db
      .query("devAccounts")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    const existingByAccountId = await ctx.db
      .query("devAccounts")
      .withIndex("by_account_id", (q) => q.eq("accountId", args.accountId))
      .unique();
    const existing = existingByEmail ?? existingByAccountId;

    if (existing) {
      await ctx.db.patch(existing._id, {
        accountId: args.accountId,
        email: args.email,
        environment: "development",
        role: args.role,
      });
      return existing._id;
    }

    return await ctx.db.insert("devAccounts", {
      accountId: args.accountId,
      email: args.email,
      environment: "development",
      role: args.role,
    });
  },
});
