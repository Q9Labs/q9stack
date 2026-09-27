import { useLingui } from "@lingui/react/macro";
import { SignInForm } from "@q9labsai/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

export const Route = createFileRoute("/sign-in")({ component: SignInPage });

function SignInPage() {
  const { t } = useLingui();
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const submit = (_credentials: LoginCredentials): void => {
    setSubmitting(true);
    setError(undefined);
    setSubmitting(false);
  };

  return (
    <main className="mx-auto grid w-full max-w-md gap-5 px-4 py-12 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        {t({ id: "auth.login.title", message: "Sign in" })}
      </h1>
      <SignInForm
        onSubmit={submit}
        onForgotPassword={() => {
          window.location.assign("/forgot-password");
        }}
        onSignUp={() => {
          window.location.assign("/sign-up");
        }}
        error={error}
        submitting={submitting}
      />
    </main>
  );
}
