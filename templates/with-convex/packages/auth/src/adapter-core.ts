import { api } from "@__APP_SLUG__/convex";

import type { AuthClient } from "./client.js";
import type {
  AuthResult,
  AuthSession,
  DevAccount,
  DevAccountSwitchInput,
  PasswordResetInput,
  PasswordResetResult,
  SessionState,
  SignInInput,
  SignOutResult,
  SignUpInput,
  AuthError,
  AuthErrorCode,
  AuthRole,
} from "./types.js";

interface BetterAuthResponse {
  readonly data: unknown;
  readonly error: unknown;
}

export interface BetterAuthOperations {
  readonly getSession: () => Promise<BetterAuthResponse>;
  readonly signIn: {
    readonly email: (input: {
      readonly email: string;
      readonly password: string;
    }) => Promise<BetterAuthResponse>;
  };
  readonly signOut: () => Promise<BetterAuthResponse>;
  readonly signUp: {
    readonly email: (input: {
      readonly email: string;
      readonly name: string;
      readonly password: string;
    }) => Promise<BetterAuthResponse>;
  };
  readonly requestPasswordReset: (input: { readonly email: string }) => Promise<BetterAuthResponse>;
}

export interface ConvexAuthQueryClient {
  readonly query: (query: typeof api.dev.listAccounts, args: {}) => Promise<readonly DevAccount[]>;
}

export interface ConvexAuthAdapterDependencies {
  readonly authClient: BetterAuthOperations;
  readonly convex: ConvexAuthQueryClient;
}

interface ErrorDetails {
  readonly code?: string;
  readonly message: string;
  readonly status?: number;
}

interface SessionData {
  readonly session: {
    readonly expiresAt: Date | string | number;
    readonly id: string;
  };
  readonly user: {
    readonly email: string;
    readonly id: string;
    readonly role?: string | null;
  };
}

const success = <Value>(value: Value): AuthResult<Value> => ({ ok: true, value });

const failure = <Value>(code: AuthErrorCode, message: string): AuthResult<Value> => ({
  error: { code, message },
  ok: false,
});

const isAuthRole = (value: unknown): value is AuthRole =>
  value === "admin" || value === "member" || value === "viewer";

function readErrorDetails(error: unknown, fallbackMessage: string): ErrorDetails {
  if (error instanceof Error) {
    return { message: error.message };
  }

  if (typeof error !== "object" || error === null) {
    return { message: fallbackMessage };
  }

  const message =
    "message" in error && typeof error.message === "string" ? error.message : fallbackMessage;
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const status = "status" in error && typeof error.status === "number" ? error.status : undefined;

  return {
    ...(code === undefined ? {} : { code }),
    message,
    ...(status === undefined ? {} : { status }),
  };
}

function mapError(error: unknown, fallbackCode: AuthErrorCode, fallbackMessage: string): AuthError {
  const details = readErrorDetails(error, fallbackMessage);
  const searchable = `${details.code ?? ""} ${details.message}`.toLowerCase();

  let code = fallbackCode;
  if (
    details.status === 401 ||
    searchable.includes("invalid email or password") ||
    searchable.includes("invalid credentials") ||
    searchable.includes("invalid_email_or_password")
  ) {
    code = "invalid-credentials";
  } else if (
    details.status === 409 ||
    searchable.includes("already exists") ||
    searchable.includes("email is already")
  ) {
    code = "email-in-use";
  } else if (details.status === 400 || searchable.includes("invalid")) {
    code = "invalid-input";
  } else if (searchable.includes("unauthenticated") || searchable.includes("not authenticated")) {
    code = "not-authenticated";
  }

  return { code, message: details.message };
}

function responseError(
  response: BetterAuthResponse,
  fallbackCode: AuthErrorCode,
  fallbackMessage: string,
): AuthError | undefined {
  if (response.error === null || response.error === undefined) {
    return undefined;
  }

  return mapError(response.error, fallbackCode, fallbackMessage);
}

function isSessionData(value: unknown): value is SessionData {
  if (typeof value !== "object" || value === null || !("session" in value) || !("user" in value)) {
    return false;
  }

  const session = value.session;
  const user = value.user;
  if (
    typeof session !== "object" ||
    session === null ||
    typeof user !== "object" ||
    user === null ||
    !("id" in session) ||
    typeof session.id !== "string" ||
    !("expiresAt" in session) ||
    !(
      typeof session.expiresAt === "string" ||
      session.expiresAt instanceof Date ||
      (typeof session.expiresAt === "number" && Number.isFinite(session.expiresAt))
    ) ||
    !("id" in user) ||
    typeof user.id !== "string" ||
    !("email" in user) ||
    typeof user.email !== "string"
  ) {
    return false;
  }

  if (
    "role" in user &&
    user.role !== null &&
    user.role !== undefined &&
    typeof user.role !== "string"
  ) {
    return false;
  }

  return true;
}

function mapSession(value: unknown): AuthResult<AuthSession> {
  if (!isSessionData(value)) {
    return failure("invalid-input", "The authentication session has an invalid shape.");
  }

  const roleValue = "role" in value.user ? value.user.role : undefined;
  if (roleValue !== undefined && roleValue !== null && !isAuthRole(roleValue)) {
    return failure("invalid-input", "The authentication session does not include a valid role.");
  }
  const role = isAuthRole(roleValue) ? roleValue : "member";

  const expiresAt =
    typeof value.session.expiresAt === "string"
      ? value.session.expiresAt
      : new Date(value.session.expiresAt).toISOString();

  return success({
    account: {
      email: value.user.email,
      id: value.user.id,
      role,
    },
    expiresAt,
    id: value.session.id,
  });
}

async function resolveDevelopmentRole(
  session: AuthSession,
  convex: ConvexAuthQueryClient,
): Promise<AuthResult<AuthSession>> {
  if (!session.account.email.endsWith("@dev.local")) {
    return success(session);
  }

  try {
    const accounts = await convex.query(api.dev.listAccounts, {});
    const account = accounts.find(
      (candidate) =>
        candidate.id === session.account.id || candidate.email === session.account.email,
    );
    if (account === undefined) {
      return success(session);
    }

    return success({
      ...session,
      account: {
        ...session.account,
        role: account.role,
      },
    });
  } catch (error) {
    return {
      error: mapError(error, "unknown", "The development account is unavailable."),
      ok: false,
    };
  }
}

async function sessionResponse(
  response: BetterAuthResponse,
  convex: ConvexAuthQueryClient,
  fallbackCode: AuthErrorCode,
): Promise<AuthResult<AuthSession>> {
  const error = responseError(response, fallbackCode, "Authentication failed.");
  if (error !== undefined) {
    return { error, ok: false };
  }

  const session = mapSession(response.data);
  return session.ok ? resolveDevelopmentRole(session.value, convex) : session;
}

async function sessionAfterAuthentication(
  response: BetterAuthResponse,
  authClient: BetterAuthOperations,
  convex: ConvexAuthQueryClient,
  fallbackCode: AuthErrorCode,
): Promise<AuthResult<AuthSession>> {
  const error = responseError(response, fallbackCode, "Authentication failed.");
  if (error !== undefined) {
    return { error, ok: false };
  }

  return await sessionResponse(await authClient.getSession(), convex, fallbackCode);
}

function emptyResponse(
  response: BetterAuthResponse,
  fallbackCode: AuthErrorCode,
  fallbackMessage: string,
): AuthResult<true> {
  const error = responseError(response, fallbackCode, fallbackMessage);
  return error === undefined ? success(true) : { error, ok: false };
}

export function createAuthAdapter(dependencies: ConvexAuthAdapterDependencies): AuthClient {
  const authClient = dependencies.authClient;

  const signIn = async (input: SignInInput): Promise<AuthResult<AuthSession>> => {
    if (input.email.trim().length === 0 || input.password.length === 0) {
      return failure("invalid-input", "Email and password are required.");
    }

    try {
      const response = await authClient.signIn.email({
        email: input.email,
        password: input.password,
      });
      return await sessionAfterAuthentication(
        response,
        authClient,
        dependencies.convex,
        "invalid-credentials",
      );
    } catch (error) {
      return {
        error: mapError(error, "unknown", "Sign in failed."),
        ok: false,
      };
    }
  };

  const signUp = async (input: SignUpInput): Promise<AuthResult<AuthSession>> => {
    if (input.email.trim().length === 0 || input.password.length === 0) {
      return failure("invalid-input", "Email and password are required.");
    }

    try {
      const response = await authClient.signUp.email({
        email: input.email,
        name: input.email.split("@")[0] ?? input.email,
        password: input.password,
      });
      return await sessionAfterAuthentication(
        response,
        authClient,
        dependencies.convex,
        "email-in-use",
      );
    } catch (error) {
      return {
        error: mapError(error, "unknown", "Sign up failed."),
        ok: false,
      };
    }
  };

  const signOut = async (): Promise<AuthResult<SignOutResult>> => {
    try {
      const response = await authClient.signOut();
      const result = emptyResponse(response, "not-authenticated", "Sign out failed.");
      return result.ok ? success({ signedOut: true }) : { error: result.error, ok: false };
    } catch (error) {
      return { error: mapError(error, "unknown", "Sign out failed."), ok: false };
    }
  };

  const getSession = async (): Promise<AuthResult<SessionState>> => {
    try {
      const response = await authClient.getSession();
      const error = responseError(response, "not-authenticated", "Session lookup failed.");
      if (error !== undefined) {
        return { error, ok: false };
      }
      if (response.data === null || response.data === undefined) {
        return success({ status: "anonymous" });
      }

      const session = mapSession(response.data);
      if (!session.ok) {
        return { error: session.error, ok: false };
      }

      const resolved = await resolveDevelopmentRole(session.value, dependencies.convex);
      return resolved.ok
        ? success({ session: resolved.value, status: "authenticated" })
        : { error: resolved.error, ok: false };
    } catch (error) {
      return { error: mapError(error, "unknown", "Session lookup failed."), ok: false };
    }
  };

  const requestPasswordReset = async (
    input: PasswordResetInput,
  ): Promise<AuthResult<PasswordResetResult>> => {
    if (input.email.trim().length === 0) {
      return failure("invalid-input", "Email is required.");
    }

    try {
      const response = await authClient.requestPasswordReset({ email: input.email });
      const result = emptyResponse(response, "invalid-input", "Password reset request failed.");
      return result.ok ? success({ accepted: true }) : { error: result.error, ok: false };
    } catch (error) {
      return { error: mapError(error, "unknown", "Password reset request failed."), ok: false };
    }
  };

  const listDevAccounts = async (): Promise<AuthResult<readonly DevAccount[]>> => {
    try {
      const accounts = await dependencies.convex.query(api.dev.listAccounts, {});
      return success(accounts);
    } catch (error) {
      return {
        error: mapError(error, "unknown", "Development accounts are unavailable."),
        ok: false,
      };
    }
  };

  const switchDevAccount = async (
    input: DevAccountSwitchInput,
  ): Promise<AuthResult<AuthSession>> => {
    const listed = await listDevAccounts();
    if (!listed.ok) {
      return { error: listed.error, ok: false };
    }

    const account = listed.value.find((candidate) => candidate.id === input.accountId);
    if (account === undefined) {
      return failure("invalid-input", "The development account was not found.");
    }

    const signedOut = await signOut();
    if (!signedOut.ok) {
      return { error: signedOut.error, ok: false };
    }

    return signIn({ email: account.email, password: "dev-password" });
  };

  return {
    listDevAccounts,
    requestPasswordReset,
    signIn,
    signOut,
    signUp,
    switchDevAccount,
    getSession,
  };
}
