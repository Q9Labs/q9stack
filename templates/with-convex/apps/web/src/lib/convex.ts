import { appEnv } from "@__APP_SLUG__/env";
import { ConvexReactClient } from "convex/react";

import { parseAppEnvironment, readRuntimeSource } from "../env.js";

const parsedEnvironment = appEnv.client().parse(readRuntimeSource());
if (parsedEnvironment._tag === "Left") {
  throw parsedEnvironment.left;
}

const convexAddress = new URL(parsedEnvironment.right.VITE_CONVEX_URL);
const appAddress = parseAppEnvironment(readRuntimeSource()).APP_URL;
if (
  (convexAddress.hostname === "127.0.0.1" || convexAddress.hostname === "localhost") &&
  (appAddress.hostname === "127.0.0.1" || appAddress.hostname === "localhost")
) {
  // Same-site loopback hosts let Better Auth's session cookie reach the HTTP actions endpoint.
  convexAddress.hostname = appAddress.hostname;
}
// Convex's WebSocket client appends /api/... directly; a trailing slash breaks the path.
export const convexUrl = convexAddress.origin;
export const convexClient = new ConvexReactClient(convexUrl);
