/**
 * Every user-visible string in the auth screens, with English defaults.
 * Apps translate by passing a `labels` object (Lingui macros resolve to plain
 * strings, so nothing here depends on an i18n runtime).
 */
export interface AuthFieldLabels {
  readonly email: string;
  readonly emailPlaceholder: string;
  readonly emailRequired: string;
  readonly emailInvalid: string;
  readonly password: string;
  readonly passwordPlaceholder: string;
  readonly passwordRequired: string;
  readonly passwordTooShort: string;
}

export const AUTH_FIELD_LABELS: AuthFieldLabels = {
  email: "Email",
  emailPlaceholder: "you@example.com",
  emailRequired: "Enter your email address.",
  emailInvalid: "That does not look like an email address.",
  password: "Password",
  passwordPlaceholder: "••••••••",
  passwordRequired: "Enter your password.",
  passwordTooShort: "Use at least 8 characters.",
};

export interface SignInLabels extends AuthFieldLabels {
  readonly title: string;
  readonly description: string;
  readonly submit: string;
  readonly forgotPassword: string;
  readonly noAccount: string;
  readonly signUp: string;
}

export const SIGN_IN_LABELS: SignInLabels = {
  ...AUTH_FIELD_LABELS,
  title: "Sign in",
  description: "Use your work email to continue.",
  submit: "Sign in",
  forgotPassword: "Forgot password?",
  noAccount: "No account yet?",
  signUp: "Create one",
};

export interface SignUpLabels extends AuthFieldLabels {
  readonly title: string;
  readonly description: string;
  readonly name: string;
  readonly namePlaceholder: string;
  readonly nameRequired: string;
  readonly submit: string;
  readonly haveAccount: string;
  readonly signIn: string;
}

export const SIGN_UP_LABELS: SignUpLabels = {
  ...AUTH_FIELD_LABELS,
  title: "Create your account",
  description: "It takes less than a minute.",
  name: "Full name",
  namePlaceholder: "Ada Lovelace",
  nameRequired: "Enter your name.",
  submit: "Create account",
  haveAccount: "Already have an account?",
  signIn: "Sign in",
};

export interface ForgotPasswordLabels extends AuthFieldLabels {
  readonly title: string;
  readonly description: string;
  readonly submit: string;
  readonly backToSignIn: string;
}

export const FORGOT_PASSWORD_LABELS: ForgotPasswordLabels = {
  ...AUTH_FIELD_LABELS,
  title: "Reset your password",
  description: "We will email you a link to choose a new password.",
  submit: "Send reset link",
  backToSignIn: "Back to sign in",
};

export interface ResetPasswordLabels extends AuthFieldLabels {
  readonly title: string;
  readonly description: string;
  readonly confirmPassword: string;
  readonly passwordMismatch: string;
  readonly submit: string;
}

export const RESET_PASSWORD_LABELS: ResetPasswordLabels = {
  ...AUTH_FIELD_LABELS,
  title: "Choose a new password",
  description: "Pick something you have not used before.",
  confirmPassword: "Confirm password",
  passwordMismatch: "Both passwords must match.",
  submit: "Save password",
};

export interface VerifyEmailLabels {
  readonly title: string;
  readonly description: (email: string) => string;
  readonly resend: string;
  readonly resent: string;
}

export const VERIFY_EMAIL_LABELS: VerifyEmailLabels = {
  title: "Check your inbox",
  description: (email) => `We sent a verification link to ${email}.`,
  resend: "Resend email",
  resent: "Email sent",
};

export interface ProfileLabels {
  readonly title: string;
  readonly description: string;
  readonly name: string;
  readonly nameRequired: string;
  readonly email: string;
  readonly emailHint: string;
  readonly submit: string;
}

export const PROFILE_LABELS: ProfileLabels = {
  title: "Profile",
  description: "This is how your teammates see you.",
  name: "Full name",
  nameRequired: "Enter your name.",
  email: "Email",
  emailHint: "Contact an administrator to change your email.",
  submit: "Save changes",
};

export interface DevAccountSwitcherLabels {
  readonly title: string;
  readonly signedInAs: string;
  readonly signOut: string;
  readonly open: string;
}

export const DEV_ACCOUNT_SWITCHER_LABELS: DevAccountSwitcherLabels = {
  title: "Dev accounts",
  signedInAs: "Signed in as",
  signOut: "Sign out",
  open: "Switch dev account",
};
