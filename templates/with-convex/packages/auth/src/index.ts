export type { AuthClient, AuthAccountSummary } from "./client.js";
export {
  createConvexAuthClient,
  type ConvexAuthClients,
  type ConvexAuthClientOptions,
  type ConvexAuthQueryClient,
  type ConvexBetterAuthClient,
} from "./adapter.js";
export {
  AUTH_ERROR_CODES,
  AUTH_ROLES,
  type AuthAccount,
  type AuthError,
  type AuthErrorCode,
  type AuthFailure,
  type AuthResult,
  type AuthRole,
  type AuthSession,
  type AuthSuccess,
  type DevAccount,
  type DevAccountSwitchInput,
  type PasswordResetInput,
  type PasswordResetResult,
  type SessionState,
  type SignInInput,
  type SignOutResult,
  type SignUpInput,
} from "./types.js";
