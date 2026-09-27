import type {
  AuthAccount,
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
} from "./types.js";

export interface AuthClient {
  readonly signIn: (input: SignInInput) => Promise<AuthResult<AuthSession>>;
  readonly signUp: (input: SignUpInput) => Promise<AuthResult<AuthSession>>;
  readonly signOut: () => Promise<AuthResult<SignOutResult>>;
  readonly getSession: () => Promise<AuthResult<SessionState>>;
  readonly requestPasswordReset: (
    input: PasswordResetInput,
  ) => Promise<AuthResult<PasswordResetResult>>;
  readonly listDevAccounts: () => Promise<AuthResult<readonly DevAccount[]>>;
  readonly switchDevAccount: (input: DevAccountSwitchInput) => Promise<AuthResult<AuthSession>>;
}

export type AuthAccountSummary = Pick<AuthAccount, "email" | "role">;
