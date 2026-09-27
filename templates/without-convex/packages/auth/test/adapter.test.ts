import { describe, expect, it } from "vitest";

import { decodeDevAccountsPayload, decodeDevelopmentPasswordResetPayload } from "../src/adapter.js";

describe("Better Auth adapter response boundary", () => {
  it("accepts the concrete development-account payload", () => {
    expect(
      decodeDevAccountsPayload({
        accounts: [
          {
            email: "member@dev.local",
            environment: "development",
            id: "account-member",
            role: "member",
          },
        ],
      }),
    ).toEqual([
      {
        email: "member@dev.local",
        environment: "development",
        id: "account-member",
        role: "member",
      },
    ]);
  });

  it("rejects a payload with an unknown role or environment", () => {
    expect(
      decodeDevAccountsPayload([
        {
          email: "member@dev.local",
          environment: "production",
          id: "account-member",
          role: "owner",
        },
      ]),
    ).toBeUndefined();
  });
});

describe("development password-reset boundary", () => {
  it("accepts only an absolute reset URL", () => {
    expect(
      decodeDevelopmentPasswordResetPayload({
        resetUrl: "http://api.test/api/auth/reset-password/token?callbackURL=web",
      }),
    ).toBe("http://api.test/api/auth/reset-password/token?callbackURL=web");
    expect(decodeDevelopmentPasswordResetPayload({ resetUrl: "/reset-password" })).toBeUndefined();
  });
});
