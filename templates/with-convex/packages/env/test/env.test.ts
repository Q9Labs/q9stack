import { describe, expect, it } from "vitest";

import { appEnv, envSchema } from "../src/env.js";

describe("application environment contract", () => {
  it("declares the complete Convex key contract", () => {
    expect(appEnv.keys()).toEqual([
      "APP_ENV",
      "APP_URL",
      "LOG_LEVEL",
      "OPENROUTER_API_KEY",
      "SENTRY_DSN",
      "VITE_CONVEX_URL",
      "BETTER_AUTH_SECRET",
      "SITE_URL",
    ]);
  });

  it("keeps Better Auth secrets server-only and redacted", () => {
    expect(envSchema.BETTER_AUTH_SECRET.scope).toBe("server");
    expect(envSchema.BETTER_AUTH_SECRET.schema.schemaJson).toEqual({ type: "redacted" });
    expect(envSchema.VITE_CONVEX_URL.scope).toBe("client");
  });
});
