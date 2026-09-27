export const AUTH_ROLES = ["admin", "member", "viewer"] as const;
export type AuthRole = (typeof AUTH_ROLES)[number];

export const AUTH_ERROR_CODES = [
  "invalid-credentials",
  "email-in-use",
  "invalid-input",
  "not-authenticated",
  "unknown",
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export interface AuthAccount {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
  readonly role: AuthRole;
}

export interface DevAccount extends AuthAccount {
  readonly environment: "development";
}

export interface AuthSession {
  readonly id: string;
  readonly account: AuthAccount;
  readonly expiresAt: string;
}

export type SessionState =
  | { readonly status: "anonymous" }
  | { readonly status: "authenticated"; readonly session: AuthSession };

export interface AuthError {
  readonly code: AuthErrorCode;
  readonly message: string;
}

export interface AuthSuccess<Value> {
  readonly ok: true;
  readonly value: Value;
}

export interface AuthFailure {
  readonly ok: false;
  readonly error: AuthError;
}

export type AuthResult<Value> = AuthSuccess<Value> | AuthFailure;

export interface SignInInput {
  readonly email: string;
  readonly password: string;
}

export interface SignUpInput {
  readonly email: string;
  readonly password: string;
}

export interface PasswordResetInput {
  readonly email: string;
}

export interface ResetPasswordInput {
  readonly newPassword: string;
  readonly token: string;
}

export interface UpdateProfileInput {
  readonly name: string;
}

export interface DevAccountSwitchInput {
  readonly accountId: string;
}

export interface SignOutResult {
  readonly signedOut: true;
}

export type PasswordResetResult =
  | { readonly accepted: true; readonly delivery: "email" }
  | { readonly accepted: true; readonly delivery: "development"; readonly resetUrl: string };

export interface ResetPasswordResult {
  readonly reset: true;
}

export interface UpdateProfileResult {
  readonly updated: true;
}
