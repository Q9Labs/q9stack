import { createConvexAuthClient } from "@__APP_SLUG__/auth";

import { convexClient as convexReactClient, convexUrl } from "./convex.js";

const baseURL = convexUrl.replace(".convex.cloud", ".convex.site");

const clients = createConvexAuthClient({
  baseURL,
  convex: convexReactClient,
});

export const authClient = clients.authClient;
export const auth = clients.auth;
