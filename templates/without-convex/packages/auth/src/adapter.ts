import { createAuthClient as createBetterAuthClient } from "better-auth/react";
import { Either, Schema } from "effect";

import type { AuthClient } from "./client.js";
import {
  AUTH_ERROR_CODES,
  AUTH_ROLES,
  type AuthError,
  type AuthErrorCode,
  type AuthResult,
  type AuthSession,
  type DevAccount,
  type DevAccountSwitchInput,
  type PasswordResetInput,
  type PasswordResetResult,
  type ResetPasswordInput,
  type ResetPasswordResult,
  type SessionState,
  type SignInInput,
  type SignOutResult,
  type SignUpInput,
  type UpdateProfileInput,
  type UpdateProfileResult,
} from "./types.js";

const AuthRoleSchema = Schema.Literal(...AUTH_ROLES);

const BetterAuthErrorSchema = Schema.Struct({
  code: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
});

const SessionPayloadSchema = Schema.Struct({
  session: Schema.Struct({
    expiresAt: Schema.Union(Schema.String, Schema.DateFromSelf),
    id: Schema.String,
  }),
  user: Schema.Struct({
    email: Schema.String,
    id: Schema.String,
    name: Schema.String,
    role: Schema.optional(AuthRoleSchema),
  }),
});

const DevAccountSchema = Schema.Struct({
  email: Schema.String,
  environment: Schema.Literal("development"),
  id: Schema.String,
  role: AuthRoleSchema,
});

const DevAccountsPayloadSchema = Schema.Struct({
  accounts: Schema.Array(DevAccountSchema),
});

const DevelopmentPasswordResetPayloadSchema = Schema.Struct({
  resetUrl: Schema.String,
});

const knownErrorCode = (value: string | undefined): AuthErrorCode | undefined =>
  AUTH_ERROR_CODES.find((code) => code === value);

const decodeError = (value: unknown): AuthError => {
  const decoded = Schema.decodeUnknownEither(BetterAuthErrorSchema)(value);
  if (Either.isLeft(decoded)) {
    return { code: "unknown", message: "Authentication request failed." };
  }

  const code = decoded.right.code;
  const mappedCode =
    code === "INVALID_PASSWORD" || code === "INVALID_EMAIL"
      ? "invalid-credentials"
      : code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
        ? "email-in-use"
        : code === "UNAUTHORIZED"
          ? "not-authenticated"
          : (knownErrorCode(code) ?? "unknown");
  return {
    code: mappedCode,
    message: decoded.right.message ?? "Authentication request failed.",
  };
};

const failure = (error: AuthError): AuthResult<never> => ({ error, ok: false });

const invalidResponse = <Value>(): AuthResult<Value> =>
  failure({ code: "invalid-input", message: "Authentication service returned invalid data." });

const decodeSession = (value: unknown): AuthSession | undefined => {
  const decoded = Schema.decodeUnknownEither(SessionPayloadSchema)(value);
  if (Either.isLeft(decoded)) return undefined;

  const expiresAtValue = decoded.right.session.expiresAt;
  const expiresAt = expiresAtValue instanceof Date ? expiresAtValue : new Date(expiresAtValue);
  if (Number.isNaN(expiresAt.valueOf())) return undefined;

  return {
    account: {
      email: decoded.right.user.email,
      id: decoded.right.user.id,
      name: decoded.right.user.name,
      role: decoded.right.user.role ?? "member",
    },
    expiresAt: expiresAt.toISOString(),
    id: decoded.right.session.id,
  };
};

export const decodeDevAccountsPayload = (value: unknown): readonly DevAccount[] | undefined => {
  const decoded = Schema.decodeUnknownEither(DevAccountsPayloadSchema)(value);
  return Either.isLeft(decoded) ? undefined : decoded.right.accounts;
};

export const decodeDevelopmentPasswordResetPayload = (value: unknown): string | undefined => {
  const decoded = Schema.decodeUnknownEither(DevelopmentPasswordResetPayloadSchema)(value);
  if (Either.isLeft(decoded)) return undefined;
  try {
    return new URL(decoded.right.resetUrl).toString();
  } catch {
    return undefined;
  }
};

const fetchFailure = (error: unknown): AuthResult<never> =>
  failure({
    code: "unknown",
    message: error instanceof Error ? error.message : "Could not reach the authentication service.",
  });

const apiError = (response: Response): AuthResult<never> =>
  failure({ code: "unknown", message: `Authentication service returned HTTP ${response.status}.` });

export function createAuthClient(apiUrl: string, appUrl: string = apiUrl): AuthClient {
  const baseURL = apiUrl.replace(/\/+$/, "");
  const betterAuthClient = createBetterAuthClient({ baseURL });

  const loadAuthenticatedSession = async (): Promise<AuthResult<AuthSession>> => {
    const response = await betterAuthClient.getSession();
    if (response.error !== null) {
      return failure(decodeError(response.error));
    }
    if (response.data === null) {
      return invalidResponse<AuthSession>();
    }
    const session = decodeSession(response.data);
    return session === undefined ? invalidResponse<AuthSession>() : { ok: true, value: session };
  };

  const signIn = async (input: SignInInput): Promise<AuthResult<AuthSession>> => {
    try {
      const response = await betterAuthClient.signIn.email({
        email: input.email,
        password: input.password,
      });
      if (response.error !== null) {
        return failure(decodeError(response.error));
      }
      return await loadAuthenticatedSession();
    } catch (error: unknown) {
      return fetchFailure(error);
    }
  };

  const signUp = async (input: SignUpInput): Promise<AuthResult<AuthSession>> => {
    try {
      const separator = input.email.indexOf("@");
      const response = await betterAuthClient.signUp.email({
        email: input.email,
        name: separator > 0 ? input.email.slice(0, separator) : input.email,
        password: input.password,
      });
      if (response.error !== null) {
        return failure(decodeError(response.error));
      }
      return await loadAuthenticatedSession();
    } catch (error: unknown) {
      return fetchFailure(error);
    }
  };

  const signOut = async (): Promise<AuthResult<SignOutResult>> => {
    try {
      const response = await betterAuthClient.signOut();
      if (response.error !== null) {
        return failure(decodeError(response.error));
      }
      return { ok: true, value: { signedOut: true } };
    } catch (error: unknown) {
      return fetchFailure(error);
    }
  };

  const useSession = async (): Promise<AuthResult<SessionState>> => {
    try {
      const response = await betterAuthClient.getSession();
      if (response.error !== null) {
        return failure(decodeError(response.error));
      }
      if (response.data === null) {
        return { ok: true, value: { status: "anonymous" } };
      }
      const session = decodeSession(response.data);
      return session === undefined
        ? invalidResponse<SessionState>()
        : { ok: true, value: { session, status: "authenticated" } };
    } catch (error: unknown) {
      return fetchFailure(error);
    }
  };

  const requestPasswordReset = async (
    input: PasswordResetInput,
  ): Promise<AuthResult<PasswordResetResult>> => {
    try {
      const response = await betterAuthClient.requestPasswordReset({
        email: input.email,
        redirectTo: new URL("/reset-password", appUrl).toString(),
      });
      if (response.error !== null) {
        return failure(decodeError(response.error));
      }
      const developmentResponse = await fetch(
        `${baseURL}/api/dev/password-reset?email=${encodeURIComponent(input.email)}`,
        { credentials: "include" },
      );
      if (developmentResponse.status === 404) {
        return { ok: true, value: { accepted: true, delivery: "email" } };
      }
      if (!developmentResponse.ok) return apiError(developmentResponse);
      const payload: unknown = await developmentResponse.json();
      const resetUrl = decodeDevelopmentPasswordResetPayload(payload);
      return resetUrl === undefined
        ? invalidResponse<PasswordResetResult>()
        : {
            ok: true,
            value: { accepted: true, delivery: "development", resetUrl },
          };
    } catch (error: unknown) {
      return fetchFailure(error);
    }
  };

  const resetPassword = async (
    input: ResetPasswordInput,
  ): Promise<AuthResult<ResetPasswordResult>> => {
    try {
      const response = await betterAuthClient.resetPassword({
        newPassword: input.newPassword,
        token: input.token,
      });
      if (response.error !== null) {
        return failure(decodeError(response.error));
      }
      return { ok: true, value: { reset: true } };
    } catch (error: unknown) {
      return fetchFailure(error);
    }
  };

  const updateProfile = async (
    input: UpdateProfileInput,
  ): Promise<AuthResult<UpdateProfileResult>> => {
    try {
      const response = await betterAuthClient.updateUser({ name: input.name });
      if (response.error !== null) {
        return failure(decodeError(response.error));
      }
      return { ok: true, value: { updated: true } };
    } catch (error: unknown) {
      return fetchFailure(error);
    }
  };

  const listDevAccounts = async (): Promise<AuthResult<readonly DevAccount[]>> => {
    try {
      const response = await fetch(`${baseURL}/api/dev/accounts`, { credentials: "include" });
      if (!response.ok) return apiError(response);
      const payload: unknown = await response.json();
      const accounts = decodeDevAccountsPayload(payload);
      return accounts === undefined
        ? invalidResponse<readonly DevAccount[]>()
        : { ok: true, value: accounts };
    } catch (error: unknown) {
      return fetchFailure(error);
    }
  };

  const switchDevAccount = async (
    input: DevAccountSwitchInput,
  ): Promise<AuthResult<AuthSession>> => {
    const accounts = await listDevAccounts();
    if (!accounts.ok) return accounts;
    const account = accounts.value.find((candidate) => candidate.id === input.accountId);
    if (account === undefined) {
      return failure({ code: "invalid-input", message: "The development account was not found." });
    }

    const signedOut = await signOut();
    if (!signedOut.ok) return signedOut;
    return signIn({ email: account.email, password: "dev-password" });
  };

  return {
    listDevAccounts,
    requestPasswordReset,
    resetPassword,
    signIn,
    signOut,
    signUp,
    switchDevAccount,
    updateProfile,
    useSession,
  };
}
