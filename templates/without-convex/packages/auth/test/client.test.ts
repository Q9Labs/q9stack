import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  AuthAccount,
  AuthClient,
  AuthResult,
  AuthSession,
  SessionState,
  SignInInput,
} from "../src/index.js";

const account: AuthAccount = {
  email: "member@dev.local",
  id: "account-member",
  name: "Dev Member",
  role: "member",
};

const session: AuthSession = {
  account,
  expiresAt: "2026-08-24T00:00:00.000Z",
  id: "session-member",
};

const success = <Value>(value: Value): AuthResult<Value> => ({ ok: true, value });

const makeFakeClient = (): AuthClient => {
  let current: SessionState = { status: "anonymous" };

  return {
    listDevAccounts: async () =>
      success([
        {
          ...account,
          environment: "development",
        },
      ]),
    requestPasswordReset: async () => success({ accepted: true, delivery: "email" }),
    resetPassword: async () => success({ reset: true }),
    signIn: async (input) => {
      if (input.email !== account.email || input.password !== "dev-password") {
        return {
          error: { code: "invalid-credentials", message: "Invalid credentials" },
          ok: false,
        };
      }
      current = { session, status: "authenticated" };
      return success(session);
    },
    signOut: async () => {
      current = { status: "anonymous" };
      return success({ signedOut: true });
    },
    signUp: async () => success(session),
    switchDevAccount: async () => {
      current = { session, status: "authenticated" };
      return success(session);
    },
    updateProfile: async () => success({ updated: true }),
    useSession: async () => success(current),
  };
};

describe("auth client port", () => {
  it("describes typed authentication operations", () => {
    expectTypeOf<AuthClient["signIn"]>().toEqualTypeOf<
      (input: SignInInput) => Promise<AuthResult<AuthSession>>
    >();
    expectTypeOf<AuthClient["useSession"]>().toEqualTypeOf<
      () => Promise<AuthResult<SessionState>>
    >();
  });

  it("supports a deterministic fake through the complete session flow", async () => {
    const client = makeFakeClient();

    const initial = await client.useSession();
    expect(initial).toEqual({ ok: true, value: { status: "anonymous" } });

    const signIn = await client.signIn({ email: account.email, password: "dev-password" });
    expect(signIn).toEqual({ ok: true, value: session });

    expect(await client.useSession()).toEqual({
      ok: true,
      value: { session, status: "authenticated" },
    });
    expect(await client.signOut()).toEqual({ ok: true, value: { signedOut: true } });
  });
});
