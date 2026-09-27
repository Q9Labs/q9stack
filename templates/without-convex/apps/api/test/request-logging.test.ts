import { describe, expect, it } from "vitest";

import { safeRequestTarget, shouldDisableRequestTracing } from "../src/request-logging.js";

describe("request logging privacy", () => {
  it("redacts reset tokens and removes query values", () => {
    expect(safeRequestTarget("/api/auth/reset-password/secret-token?callbackURL=web")).toBe(
      "/api/auth/reset-password/:token",
    );
    expect(safeRequestTarget("/api/dev/accounts?email=member%40dev.local")).toBe(
      "/api/dev/accounts",
    );
  });

  it("disables tracing when the target can carry credentials", () => {
    expect(shouldDisableRequestTracing("/api/auth/reset-password/secret-token")).toBe(true);
    expect(shouldDisableRequestTracing("/callback?code=secret-code")).toBe(true);
    expect(shouldDisableRequestTracing("/api/health")).toBe(false);
  });
});
