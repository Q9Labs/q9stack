import { describe, expect, it } from "vitest";

import { parseAppEnvironment, parseRuntimeEnvironment, parseServerEnvironment } from "./env.js";

describe("browser environment boundary", () => {
  it("accepts the required public application values", () => {
    expect(
      parseAppEnvironment({
        APP_ENV: "dev",
        APP_URL: "http://localhost:3000",
      }),
    ).toMatchObject({
      APP_ENV: "dev",
      APP_URL: new URL("http://localhost:3000"),
      SENTRY_DSN: undefined,
    });
  });

  it("reports every missing or invalid public value before rendering", () => {
    expect(() => parseAppEnvironment({ APP_ENV: "staging", APP_URL: "not-a-url" })).toThrow(
      /APP_ENV:.*APP_URL:/u,
    );
  });

  it("validates required server values before server rendering", () => {
    expect(() =>
      parseServerEnvironment({
        APP_ENV: "dev",
        APP_URL: "http://localhost:3000",
        LOG_LEVEL: "info",
      }),
    ).toThrow(/OPENROUTER_API_KEY/u);
  });

  it("does not validate server-only values while hydrating in a browser", () => {
    expect(
      parseRuntimeEnvironment(
        {
          APP_ENV: "dev",
          APP_URL: "http://localhost:3000",
        },
        "browser",
      ),
    ).toMatchObject({ APP_ENV: "dev", APP_URL: new URL("http://localhost:3000") });
  });
});
