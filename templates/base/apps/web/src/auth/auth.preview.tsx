import { ForgotPasswordForm, SignInForm, SignUpForm } from "@q9labsai/ui/auth";
import { definePreview } from "@q9labsai/ui/preview";

const onSubmit = (): void => {};
const onNavigate = (): void => {};

export default definePreview({
  title: "Authentication forms",
  scenarios: [
    {
      name: "default",
      knobs: {},
      render: () => (
        <div className="grid gap-6">
          <SignInForm onSubmit={onSubmit} onForgotPassword={onNavigate} onSignUp={onNavigate} />
          <SignUpForm onSubmit={onSubmit} onSignIn={onNavigate} />
          <ForgotPasswordForm onSubmit={onSubmit} onBackToSignIn={onNavigate} />
        </div>
      ),
    },
    {
      name: "invalid",
      knobs: {},
      render: () => (
        <SignInForm
          onSubmit={onSubmit}
          onForgotPassword={onNavigate}
          onSignUp={onNavigate}
          error="The email or password is incorrect."
        />
      ),
    },
    {
      name: "submitting",
      knobs: {},
      render: () => <SignUpForm onSubmit={onSubmit} onSignIn={onNavigate} submitting />,
    },
  ],
});
