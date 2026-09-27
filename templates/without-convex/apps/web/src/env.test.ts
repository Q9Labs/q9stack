import { describe, expect, it } from "vitest";

import { parseAppEnvironment, parseServerEnvironment } from "./env.js";

describe("browser environment boundary", () => {
  it("rejects a missing or invalid APP_ENV before rendering", () => {
    expect(() => parseAppEnvironment({ APP_URL: "http://localhost:3000" })).toThrow(/APP_ENV/u);
    expect(() =>
      parseAppEnvironment({ APP_ENV: "staging", APP_URL: "http://localhost:3000" }),
    ).toThrow(/APP_ENV/u);
  });

  it("validates only the web server contract before server rendering", () => {
    expect(() =>
      parseServerEnvironment({
        APP_ENV: "dev",
        APP_URL: "http://localhost:3000",
        LOG_LEVEL: "info",
        OPENROUTER_API_KEY: "test-key",
        PUBLIC_API_URL: "http://localhost:3001",
        PUBLIC_APP_URL: "http://localhost:3000",
      }),
    ).not.toThrow();
  });
});
