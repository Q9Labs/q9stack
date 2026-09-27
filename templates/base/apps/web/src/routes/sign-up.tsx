import { useLingui } from "@lingui/react/macro";
import { SignUpForm } from "@q9labsai/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

interface SignupInput {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

export const Route = createFileRoute("/sign-up")({ component: SignUpPage });

function SignUpPage() {
  const { t } = useLingui();
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const submit = (_input: SignupInput): void => {
    setSubmitting(true);
    setError(undefined);
    setSubmitting(false);
  };

  return (
    <main className="mx-auto grid w-full max-w-md gap-5 px-4 py-12 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        {t({ id: "auth.signup.title", message: "Create an account" })}
      </h1>
      <SignUpForm
        onSubmit={submit}
        onSignIn={() => {
          window.location.assign("/sign-in");
        }}
        error={error}
        submitting={submitting}
      />
    </main>
  );
}
