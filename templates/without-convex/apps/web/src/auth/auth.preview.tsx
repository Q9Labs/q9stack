import {
  AuthLayout,
  ForgotPasswordForm,
  ProfileForm,
  ResetPasswordForm,
  SignInForm,
  SignUpForm,
  VerifyEmailNotice,
} from "@q9labsai/ui/auth";
import { definePreview } from "@q9labsai/ui/preview";

const onSubmit = () => null;
const onNavigate = () => null;

export default definePreview({
  title: "Authentication screens",
  scenarios: [
    {
      name: "default",
      knobs: {},
      render: () => (
        <AuthLayout>
          <div className="grid gap-6">
            <SignInForm onSubmit={onSubmit} onForgotPassword={onNavigate} onSignUp={onNavigate} />
            <SignUpForm onSubmit={onSubmit} onSignIn={onNavigate} />
            <ForgotPasswordForm onSubmit={onSubmit} onBackToSignIn={onNavigate} />
            <ResetPasswordForm onSubmit={onSubmit} />
            <VerifyEmailNotice email="member@dev.local" onResend={onNavigate} />
            <ProfileForm
              user={{ email: "member@dev.local", name: "Dev Member" }}
              onSubmit={onSubmit}
            />
          </div>
        </AuthLayout>
      ),
    },
    {
      name: "invalid",
      knobs: {},
      render: () => (
        <AuthLayout>
          <SignInForm
            onSubmit={onSubmit}
            onForgotPassword={onNavigate}
            onSignUp={onNavigate}
            error="The email or password is incorrect."
          />
        </AuthLayout>
      ),
    },
    {
      name: "submitting",
      knobs: {},
      render: () => (
        <AuthLayout>
          <SignUpForm onSubmit={onSubmit} onSignIn={onNavigate} submitting />
        </AuthLayout>
      ),
    },
  ],
});
