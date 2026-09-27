import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";

import { components } from "./_generated/api.js";
import type { DataModel } from "./_generated/dataModel.js";
import authConfig from "./auth.config.js";
import { readConvexAuthEnvironment } from "./environment.js";

export const trustedOrigins = (): string[] => [readConvexAuthEnvironment().siteUrl];

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const environment = readConvexAuthEnvironment();

  const options: BetterAuthOptions & {
    basePath: string;
    baseURL: string;
    trustedOrigins: string[];
  } = {
    baseURL: environment.siteUrl,
    basePath: "/api/auth",
    secret: environment.betterAuthSecret,
    trustedOrigins: [environment.siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [convex({ authConfig })],
  };

  return betterAuth(options);
};
