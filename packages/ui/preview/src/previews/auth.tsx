import {
  AuthLayout,
  DevAccountSwitcher,
  ForgotPasswordForm,
  ProfileForm,
  ResetPasswordForm,
  SignInForm,
  SignUpForm,
  VerifyEmailNotice,
} from "../../../src/auth/index";
import { definePreview, knob } from "../../../src/preview/index";

const noop = (): void => {};

const ACCOUNTS = [
  { email: "owner@example.com", name: "Dana Ito", role: "owner" },
  { email: "admin@example.com", name: "Omar Haddad", role: "admin" },
  { email: "member@example.com", name: "Lin Zhao", role: "member" },
];

const LOGO = <span className="text-lg font-medium tracking-tight">q9 labs</span>;
const FOOTER = (
  <span>
    By continuing you agree to the{" "}
    <a className="underline underline-offset-4" href="#terms" rel="noopener">
      terms
    </a>
    .
  </span>
);

export const authPreview = definePreview({
  title: "Auth",
  scenarios: [
    {
      name: "Sign in",
      knobs: {
        error: knob.text("error", ""),
        submitting: knob.boolean("submitting", false),
      },
      render: ({ error, submitting }) => (
        <AuthLayout logo={LOGO} footer={FOOTER}>
          <SignInForm
            onSubmit={noop}
            onForgotPassword={noop}
            onSignUp={noop}
            error={error === "" ? undefined : error}
            submitting={submitting}
          />
        </AuthLayout>
      ),
    },
    {
      name: "Sign up",
      knobs: { submitting: knob.boolean("submitting", false) },
      render: ({ submitting }) => (
        <AuthLayout logo={LOGO} footer={FOOTER}>
          <SignUpForm onSubmit={noop} onSignIn={noop} submitting={submitting} />
        </AuthLayout>
      ),
    },
    {
      name: "Forgot password",
      knobs: {},
      render: () => (
        <AuthLayout logo={LOGO}>
          <ForgotPasswordForm onSubmit={noop} onBackToSignIn={noop} />
        </AuthLayout>
      ),
    },
    {
      name: "Reset password",
      knobs: {},
      render: () => (
        <AuthLayout logo={LOGO}>
          <ResetPasswordForm onSubmit={noop} />
        </AuthLayout>
      ),
    },
    {
      name: "Verify email",
      knobs: { resent: knob.boolean("resent", false) },
      render: ({ resent }) => (
        <AuthLayout logo={LOGO}>
          <VerifyEmailNotice email="dana@example.com" onResend={noop} resent={resent} />
        </AuthLayout>
      ),
    },
    {
      name: "Profile",
      knobs: { submitting: knob.boolean("submitting", false) },
      render: ({ submitting }) => (
        <div className="max-w-lg">
          <ProfileForm
            user={{ name: "Dana Ito", email: "dana@example.com" }}
            onSubmit={noop}
            submitting={submitting}
          />
        </div>
      ),
    },
    {
      name: "Dev account switcher",
      knobs: { expanded: knob.boolean("expanded", true) },
      render: ({ expanded }) => (
        <div className="relative h-64 rounded-lg border border-dashed border-border">
          <p className="p-4 text-sm text-muted-foreground">
            The switcher pins itself to the bottom inline-start of the viewport.
          </p>
          <DevAccountSwitcher
            key={String(expanded)}
            accounts={ACCOUNTS}
            current="admin@example.com"
            defaultOpen={expanded}
            onSwitch={noop}
            onSignOut={noop}
          />
        </div>
      ),
    },
  ],
});
