import { httpRouter } from "convex/server";

import { authComponent, createAuth, trustedOrigins } from "./auth.js";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins: [...trustedOrigins()],
  },
});

export default http;
