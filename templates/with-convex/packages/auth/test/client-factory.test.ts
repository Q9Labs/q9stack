import { describe, expect, it } from "vitest";

import { createConvexAuthClient, type ConvexAuthQueryClient } from "../src/index.js";

const convex: ConvexAuthQueryClient = {
  query: async () => [],
};

describe("Convex Better Auth client factory", () => {
  it("creates the provider client and provider-neutral port together", () => {
    const clients = createConvexAuthClient({
      baseURL: "https://example.convex.site",
      convex,
    });

    expect(clients.authClient.$fetch).toBeTypeOf("function");
    expect(clients.auth.signIn).toBeTypeOf("function");
  });

  it("rejects an empty Better Auth base URL", () => {
    expect(() => createConvexAuthClient({ baseURL: " ", convex })).toThrow(
      "A Better Auth base URL is required.",
    );
  });
});
