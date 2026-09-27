import { appEnv } from "@__APP_SLUG__/env";
import { ConvexReactClient } from "convex/react";

import { readRuntimeSource } from "../env.js";

const parsedEnvironment = appEnv.client().parse(readRuntimeSource());
if (parsedEnvironment._tag === "Left") {
  throw parsedEnvironment.left;
}

export const convexUrl = parsedEnvironment.right.VITE_CONVEX_URL.toString();
export const convexClient = new ConvexReactClient(convexUrl);
