import { useLingui } from "@lingui/react/macro";
import { AuthLayout, SignInForm, type SignInValues } from "@q9labsai/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "../auth/auth-client.js";

export const Route = createFileRoute("/sign-in")({ component: SignInPage });

function SignInPage() {
  const { t } = useLingui();
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const submit = (input: SignInValues): void => {
    void submitSignIn(input);
  };

  const submitSignIn = async (input: SignInValues): Promise<void> => {
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await authClient.signIn(input);
      if (result.ok) {
        window.location.assign("/");
      } else {
        setError(result.error.message);
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout footer={t({ id: "auth.footer", message: "Authentication is handled by the API." })}>
      <SignInForm
        onSubmit={submit}
        onForgotPassword={() => window.location.assign("/forgot-password")}
        onSignUp={() => window.location.assign("/sign-up")}
        error={error}
        submitting={submitting}
      />
    </AuthLayout>
  );
}
