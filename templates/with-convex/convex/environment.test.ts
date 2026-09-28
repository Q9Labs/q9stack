import { describe, expect, it } from "vitest";

import { readConvexAuthEnvironment } from "./environment.js";

describe("Convex authentication environment", () => {
  it("accepts the required secret and site URL", () => {
    expect(
      readConvexAuthEnvironment({
        BETTER_AUTH_SECRET: "development-secret",
        SITE_URL: "http://127.0.0.1:3211",
      }),
    ).toEqual({
      betterAuthSecret: "development-secret",
      siteUrl: "http://127.0.0.1:3211",
    });
  });

  it("rejects missing, blank, and malformed values", () => {
    expect(() => readConvexAuthEnvironment({ SITE_URL: "https://example.com" })).toThrow(
      /BETTER_AUTH_SECRET/u,
    );
    expect(() =>
      readConvexAuthEnvironment({ BETTER_AUTH_SECRET: "\u200b", SITE_URL: "https://example.com" }),
    ).toThrow(/BETTER_AUTH_SECRET/u);
    expect(() =>
      readConvexAuthEnvironment({ BETTER_AUTH_SECRET: "secret", SITE_URL: "not-a-url" }),
    ).toThrow(/SITE_URL/u);
  });
});
