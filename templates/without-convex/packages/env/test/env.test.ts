import { describe, expect, it } from "vitest";

import { appEnv } from "../src/env.js";

describe("application environment contract", () => {
  it("declares the exact thirteen-key contract", () => {
    expect(appEnv.keys()).toEqual([
      "APP_ENV",
      "APP_URL",
      "API_URL",
      "API_PORT",
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "LOG_LEVEL",
      "OPENROUTER_API_KEY",
      "PUBLIC_APP_URL",
      "PUBLIC_API_URL",
      "PASSWORD_RESET_WEBHOOK_TOKEN",
      "PASSWORD_RESET_WEBHOOK_URL",
      "SENTRY_DSN",
    ]);
  });

  it("marks database and auth credentials as server-side values", () => {
    const entries = appEnv.schemaJson();
    expect(entries.find((entry) => entry.key === "DATABASE_URL")).toMatchObject({
      scope: "server",
      schema: { type: "redacted" },
    });
    expect(entries.find((entry) => entry.key === "BETTER_AUTH_SECRET")).toMatchObject({
      scope: "server",
      schema: { type: "redacted" },
    });
    expect(entries.find((entry) => entry.key === "PASSWORD_RESET_WEBHOOK_TOKEN")).toMatchObject({
      required: false,
      scope: "server",
      schema: { type: "redacted" },
    });
  });

  it("uses the shared dev and prod application environment enum", () => {
    expect(appEnv.schemaJson().find((entry) => entry.key === "APP_ENV")).toMatchObject({
      schema: { type: "enum", values: ["dev", "prod"] },
    });

    expect(appEnv.parse({ APP_ENV: "staging" })._tag).toBe("Left");
  });
});
