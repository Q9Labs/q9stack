"use client";

import { useState } from "react";

import { Button } from "../primitives/button";
import { PasswordField } from "./fields";
import { AuthForm } from "./form-parts";
import { RESET_PASSWORD_LABELS, type ResetPasswordLabels } from "./labels";

export interface ResetPasswordValues {
  readonly password: string;
}

export interface ResetPasswordFormProps {
  readonly onSubmit: (values: ResetPasswordValues) => void;
  readonly error?: string | undefined;
  readonly submitting?: boolean | undefined;
  readonly labels?: Partial<ResetPasswordLabels> | undefined;
}

export function ResetPasswordForm({
  onSubmit,
  error,
  submitting = false,
  labels,
}: ResetPasswordFormProps) {
  const text = { ...RESET_PASSWORD_LABELS, ...labels };
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  return (
    <AuthForm
      slot="reset-password-form"
      title={text.title}
      description={text.description}
      error={error}
      onSubmit={() => onSubmit({ password })}
    >
      <PasswordField
        value={password}
        onValueChange={setPassword}
        labels={text}
        autoComplete="new-password"
        disabled={submitting}
      />
      <PasswordField
        name="password-confirmation"
        value={confirmation}
        onValueChange={setConfirmation}
        labels={text}
        label={text.confirmPassword}
        autoComplete="new-password"
        disabled={submitting}
        customValidity={(value) => (value === password ? null : text.passwordMismatch)}
      />
      <Button type="submit" loading={submitting} className="w-full">
        {text.submit}
      </Button>
    </AuthForm>
  );
}
