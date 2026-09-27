import { convexClient } from "@convex-dev/better-auth/client/plugins";
import type { AuthClient as ConvexProviderAuthClient } from "@convex-dev/better-auth/react";
import { createAuthClient as createBetterAuthClient } from "better-auth/react";

import { createAuthAdapter, type ConvexAuthQueryClient } from "./adapter-core.js";
import type { AuthClient } from "./client.js";

// Annotated with the provider's own client type: the inferred type is not
// portable for dts emission (TS2883) and this guarantees provider compatibility.
const createBetterAuth = (baseURL: string): ConvexProviderAuthClient =>
  createBetterAuthClient({
    baseURL,
    plugins: [convexClient()],
  });

export type ConvexBetterAuthClient = ReturnType<typeof createBetterAuth>;

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
    authClient,
  };
}

export type { ConvexAuthQueryClient } from "./adapter-core.js";
