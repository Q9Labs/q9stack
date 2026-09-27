import { useLingui } from "@lingui/react/macro";
import { ForgotPasswordForm } from "@q9labsai/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

interface ForgotPasswordInput {
  readonly email: string;
}

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

function ForgotPasswordPage() {
  const { t } = useLingui();
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const submit = (_input: ForgotPasswordInput): void => {
    setSubmitting(true);
    setError(undefined);
    setSubmitting(false);
  };

  return (
    <main className="mx-auto grid w-full max-w-md gap-5 px-4 py-12 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        {t({ id: "auth.forgot.title", message: "Reset your password" })}
      </h1>
      <ForgotPasswordForm
        onSubmit={submit}
        onBackToSignIn={() => {
          window.location.assign("/sign-in");
        }}
        error={error}
        submitting={submitting}
      />
    </main>
  );
}
