import { describe, expect, it } from "vitest";

import { appEnv } from "../src/env.js";

describe("application environment contract", () => {
  it("declares the exact five-key contract", () => {
    expect(appEnv.keys()).toEqual([
      "APP_ENV",
      "APP_URL",
      "LOG_LEVEL",
      "OPENROUTER_API_KEY",
      "SENTRY_DSN",
    ]);
  });
});
