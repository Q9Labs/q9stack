import { describe, expect, it } from "vitest";

import { createAccounts } from "../accounts.js";

describe("account fixtures", () => {
  it("creates the three documented development accounts", () => {
    const accounts = createAccounts(17);

    expect(accounts.map(({ email }) => email)).toEqual([
      "admin@dev.local",
      "member@dev.local",
      "viewer@dev.local",
    ]);
    expect(accounts.map(({ password }) => password)).toEqual([
      "dev-password",
      "dev-password",
      "dev-password",
    ]);
    expect(accounts.map(({ role }) => role)).toEqual(["admin", "member", "viewer"]);
    expect(accounts.every(({ id }) => id.length > 0)).toBe(true);
  });

  it("is deterministic and does not share faker state between invocations", () => {
    const first = createAccounts(17);

    createAccounts(99);

    expect(createAccounts(17)).toEqual(first);
    expect(createAccounts(18)).not.toEqual(first);
  });
});
