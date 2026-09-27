import { useLingui } from "@lingui/react/macro";
import { AuthLayout, SignUpForm, type SignUpValues } from "@q9labsai/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "../auth/auth-client.js";

export const Route = createFileRoute("/sign-up")({ component: SignUpPage });

function SignUpPage() {
  const { t } = useLingui();
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const submit = (input: SignUpValues): void => {
    void submitSignUp(input);
  };

  const submitSignUp = async (input: SignUpValues): Promise<void> => {
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await authClient.signUp({ email: input.email, password: input.password });
      if (result.ok) {
        window.location.assign("/");
      } else {
        setError(result.error.message);
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Sign up failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout footer={t({ id: "auth.footer", message: "Authentication is handled by the API." })}>
      <SignUpForm
        onSubmit={submit}
        onSignIn={() => window.location.assign("/sign-in")}
        error={error}
        submitting={submitting}
      />
    </AuthLayout>
  );
}
