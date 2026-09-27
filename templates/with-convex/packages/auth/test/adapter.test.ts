import { describe, expect, it } from "vitest";

import {
  createAuthAdapter,
  type BetterAuthOperations,
  type ConvexAuthQueryClient,
} from "../src/adapter-core.js";

const account = {
  email: "admin@dev.local",
  environment: "development" as const,
  id: "account-admin",
  role: "admin" as const,
};

const session = {
  session: {
    expiresAt: "2026-08-25T00:00:00.000Z",
    id: "session-admin",
  },
  user: {
    email: account.email,
    id: account.id,
    role: account.role,
  },
};

describe("Convex auth adapter", () => {
  it("switches to a returned development account after signing out", async () => {
    const calls: string[] = [];
    const authOperations: BetterAuthOperations = {
      getSession: async () => ({ data: session, error: null }),
      requestPasswordReset: async () => ({ data: { status: true }, error: null }),
      signIn: {
        email: async (input) => {
          calls.push(`sign-in:${input.email}:${input.password}`);
          return { data: { token: "better-auth-token" }, error: null };
        },
      },
      signOut: async () => {
        calls.push("sign-out");
        return { data: null, error: null };
      },
      signUp: {
        email: async () => ({ data: session, error: null }),
      },
    };
    const convex: ConvexAuthQueryClient = {
      query: async () => [account],
    };
    const client = createAuthAdapter({ authClient: authOperations, convex });

    const result = await client.switchDevAccount({ accountId: account.id });

    expect(result).toEqual({
      ok: true,
      value: {
        account: { email: account.email, id: account.id, role: account.role },
        expiresAt: session.session.expiresAt,
        id: session.session.id,
      },
    });
    expect(calls).toEqual(["sign-out", "sign-in:admin@dev.local:dev-password"]);
  });

  it("maps Better Auth failures into the port error union", async () => {
    const authOperations: BetterAuthOperations = {
      getSession: async () => ({ data: null, error: null }),
      requestPasswordReset: async () => ({ data: null, error: null }),
      signIn: {
        email: async () => ({
          data: null,
          error: { message: "Invalid email or password", status: 401 },
        }),
      },
      signOut: async () => ({ data: null, error: null }),
      signUp: {
        email: async () => ({ data: null, error: null }),
      },
    };
    const convex: ConvexAuthQueryClient = {
      query: async () => [],
    };
    const client = createAuthAdapter({ authClient: authOperations, convex });

    await expect(client.signIn({ email: account.email, password: "wrong" })).resolves.toEqual({
      error: { code: "invalid-credentials", message: "Invalid email or password" },
      ok: false,
    });
  });

  it("uses getSession and resolves development role metadata", async () => {
    const authOperations: BetterAuthOperations = {
      getSession: async () => ({
        data: {
          session: session.session,
          user: { email: account.email, id: account.id },
        },
        error: null,
      }),
      requestPasswordReset: async () => ({ data: null, error: null }),
      signIn: {
        email: async () => ({ data: session, error: null }),
      },
      signOut: async () => ({ data: null, error: null }),
      signUp: {
        email: async () => ({ data: session, error: null }),
      },
    };
    const convex: ConvexAuthQueryClient = {
      query: async () => [account],
    };
    const client = createAuthAdapter({ authClient: authOperations, convex });

    await expect(client.getSession()).resolves.toEqual({
      ok: true,
      value: {
        session: {
          account: { email: account.email, id: account.id, role: account.role },
          expiresAt: session.session.expiresAt,
          id: session.session.id,
        },
        status: "authenticated",
      },
    });
  });
});
