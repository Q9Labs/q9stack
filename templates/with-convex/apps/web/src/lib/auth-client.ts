import { createConvexAuthClient } from "@__APP_SLUG__/auth";

import { convexClient as convexReactClient, convexUrl } from "./convex.js";

const siteUrl = new URL(convexUrl);
if (siteUrl.hostname.endsWith(".convex.cloud")) {
  siteUrl.hostname = siteUrl.hostname.replace(/\.convex\.cloud$/, ".convex.site");
} else if ((siteUrl.hostname === "localhost" || siteUrl.hostname === "127.0.0.1") && siteUrl.port) {
  // The local Convex HTTP actions endpoint is one port after its client endpoint.
  siteUrl.port = String(Number(siteUrl.port) + 1);
}
const baseURL = siteUrl.toString();

const clients = createConvexAuthClient({
  baseURL,
  convex: convexReactClient,
});

export const authClient = clients.authClient;
export const auth = clients.auth;
