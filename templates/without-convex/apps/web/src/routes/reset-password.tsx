import { useLingui } from "@lingui/react/macro";
import { AuthLayout, ResetPasswordForm, type ResetPasswordValues } from "@q9labsai/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";
import { useState } from "react";

import { authClient } from "../auth/auth-client.js";

const ResetPasswordSearchSchema = Schema.Struct({
  token: Schema.optional(Schema.String),
});

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  validateSearch: Schema.decodeUnknownSync(ResetPasswordSearchSchema),
});

function ResetPasswordPage() {
  const { t } = useLingui();
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const { token } = Route.useSearch();

  const submit = (input: ResetPasswordValues): void => {
    void savePassword(input);
  };

  const savePassword = async (input: ResetPasswordValues): Promise<void> => {
    if (token === undefined) {
      setError("The password-reset link is missing its token.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    setSaved(false);
    try {
      const result = await authClient.resetPassword({ newPassword: input.password, token });
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.error.message);
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Password reset failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout footer={t({ id: "auth.footer", message: "Authentication is handled by the API." })}>
      <ResetPasswordForm onSubmit={submit} error={error} submitting={submitting} />
      {saved ? (
        <output className="mt-4 block text-sm text-muted-foreground">
          {t({
            id: "auth.reset.saved",
            message: "Your password was updated. You can sign in now.",
          })}
        </output>
      ) : null}
    </AuthLayout>
  );
}
