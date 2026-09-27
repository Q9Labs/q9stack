import type {
  AuthAccount,
  AuthResult,
  AuthSession,
  DevAccount,
  DevAccountSwitchInput,
  PasswordResetInput,
  PasswordResetResult,
  ResetPasswordInput,
  ResetPasswordResult,
  SessionState,
  SignInInput,
  SignOutResult,
  SignUpInput,
  UpdateProfileInput,
  UpdateProfileResult,
} from "./types.js";

export interface AuthClient {
  readonly signIn: (input: SignInInput) => Promise<AuthResult<AuthSession>>;
  readonly signUp: (input: SignUpInput) => Promise<AuthResult<AuthSession>>;
  readonly signOut: () => Promise<AuthResult<SignOutResult>>;
  readonly useSession: () => Promise<AuthResult<SessionState>>;
  readonly requestPasswordReset: (
    input: PasswordResetInput,
  ) => Promise<AuthResult<PasswordResetResult>>;
  readonly resetPassword: (input: ResetPasswordInput) => Promise<AuthResult<ResetPasswordResult>>;
  readonly updateProfile: (input: UpdateProfileInput) => Promise<AuthResult<UpdateProfileResult>>;
  readonly listDevAccounts: () => Promise<AuthResult<readonly DevAccount[]>>;
  readonly switchDevAccount: (input: DevAccountSwitchInput) => Promise<AuthResult<AuthSession>>;
}

export type AuthAccountSummary = Pick<AuthAccount, "email" | "name" | "role">;
