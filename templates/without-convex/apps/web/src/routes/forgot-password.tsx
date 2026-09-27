import { useLingui } from "@lingui/react/macro";
import { AuthLayout, ForgotPasswordForm, type ForgotPasswordValues } from "@q9labsai/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "../auth/auth-client.js";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

function ForgotPasswordPage() {
  const { t } = useLingui();
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | undefined>();

  const submit = (input: ForgotPasswordValues): void => {
    void submitRequest(input);
  };

  const submitRequest = async (input: ForgotPasswordValues): Promise<void> => {
    setSubmitting(true);
    setError(undefined);
    setAccepted(false);
    setResetUrl(undefined);
    try {
      const result = await authClient.requestPasswordReset(input);
      if (result.ok) {
        setAccepted(true);
        setResetUrl(result.value.delivery === "development" ? result.value.resetUrl : undefined);
      } else {
        setError(result.error.message);
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Password reset request failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout footer={t({ id: "auth.footer", message: "Authentication is handled by the API." })}>
      <ForgotPasswordForm
        onSubmit={submit}
        onBackToSignIn={() => window.location.assign("/sign-in")}
        error={error}
        submitting={submitting}
      />
      {accepted ? (
        <output className="mt-4 block text-sm text-muted-foreground">
          {resetUrl === undefined ? (
            t({
              id: "auth.forgot.accepted",
              message: "If the account exists, a reset link is on its way.",
            })
          ) : (
            <a className="underline" href={resetUrl}>
              {t({ id: "auth.forgot.open", message: "Open the development reset link" })}
            </a>
          )}
        </output>
      ) : null}
    </AuthLayout>
  );
}
