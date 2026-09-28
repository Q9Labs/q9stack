import { convexClient } from "@convex-dev/better-auth/client/plugins";
import type { AuthClient as ConvexProviderAuthClient } from "@convex-dev/better-auth/react";
import { createAuthClient as createBetterAuthClient } from "better-auth/react";

import { createAuthAdapter, type ConvexAuthQueryClient } from "./adapter-core.js";
import type { AuthClient } from "./client.js";

const createBetterAuth = (baseURL: string) =>
  createBetterAuthClient({
    baseURL,
    plugins: [convexClient()],
  });

export type ConvexBetterAuthClient = ConvexProviderAuthClient;

export interface ConvexAuthClientOptions {
  readonly baseURL: string;
  readonly convex: ConvexAuthQueryClient;
}

export interface ConvexAuthClients {
  readonly auth: AuthClient;
  readonly authClient: ConvexBetterAuthClient;
}

export function createConvexAuthClient(options: ConvexAuthClientOptions): ConvexAuthClients {
  if (options.baseURL.trim().length === 0) {
    throw new Error("A Better Auth base URL is required.");
  }

  const authClient = createBetterAuth(options.baseURL);
  return {
    auth: createAuthAdapter({ authClient, convex: options.convex }),
    // @ts-expect-error because Convex narrows useSession().data to never with Better Auth 1.6.22.
    authClient,
  };
}

export type { ConvexAuthQueryClient } from "./adapter-core.js";
