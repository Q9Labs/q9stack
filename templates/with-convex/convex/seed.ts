import type { GenericCtx } from "@convex-dev/better-auth";
import { v } from "convex/values";

import { createAccounts } from "../seeds/accounts.js";
import { createSampleFixtures } from "../seeds/sample.js";
import { components, internal } from "./_generated/api.js";
import type { DataModel } from "./_generated/dataModel.js";
import { internalAction } from "./_generated/server.js";
import { authComponent, createAuth } from "./auth.js";

const seedNumber = 17;

const ensureDevelopmentEnvironment = (): void => {
  if (process.env["APP_ENV"] !== "dev") {
    throw new Error("APP_ENV must be set to dev for the development seed");
  }
};

const findAuthUserId = async (
  ctx: GenericCtx<DataModel>,
  email: string,
): Promise<string | undefined> => {
  // The Better Auth adapter query is untyped; narrow the document explicitly.
  const existing: unknown = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: email }],
  });

  if (existing === null || typeof existing !== "object" || !("_id" in existing)) {
    return undefined;
  }

  const id = existing._id;
  if (typeof id !== "string") {
    throw new Error(`Better Auth user ${email} has no string ID`);
  }
  return id;
};

export const run = internalAction({
  args: {},
  returns: v.object({
    accounts: v.number(),
    samples: v.number(),
  }),
  handler: async (ctx) => {
    ensureDevelopmentEnvironment();

    const accounts = createAccounts(seedNumber);
    const fixtures = createSampleFixtures(seedNumber);
    const { auth } = await authComponent.getAuth(createAuth, ctx);

    await Promise.all(
      accounts.map(async (account) => {
        const existingId = await findAuthUserId(ctx, account.email);
        const accountId =
          existingId ??
          (
            await auth.api.signUpEmail({
              body: {
                email: account.email,
                name: account.role,
                password: account.password,
              },
            })
          ).user.id;

        await ctx.runMutation(internal.dev.persistAccount, {
          accountId,
          email: account.email,
          role: account.role,
        });
      }),
    );

    const samples = [fixtures.draft, fixtures.published, fixtures.archived];
    await Promise.all(
      samples.map((sample) => ctx.runMutation(internal["sample"].persist, { sample })),
    );

    return {
      accounts: accounts.length,
      samples: samples.length,
    };
  },
});
