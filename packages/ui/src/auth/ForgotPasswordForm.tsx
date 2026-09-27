"use client";

import { useState } from "react";

import { Button } from "../primitives/button";
import { EmailField } from "./fields";
import { AuthForm } from "./form-parts";
import { FORGOT_PASSWORD_LABELS, type ForgotPasswordLabels } from "./labels";

export interface ForgotPasswordValues {
  readonly email: string;
}

export interface ForgotPasswordFormProps {
  readonly onSubmit: (values: ForgotPasswordValues) => void;
  readonly onBackToSignIn?: (() => void) | undefined;
  readonly error?: string | undefined;
  readonly submitting?: boolean | undefined;
  readonly labels?: Partial<ForgotPasswordLabels> | undefined;
}

export function ForgotPasswordForm({
  onSubmit,
  onBackToSignIn,
  error,
  submitting = false,
  labels,
}: ForgotPasswordFormProps) {
  const text = { ...FORGOT_PASSWORD_LABELS, ...labels };
  const [email, setEmail] = useState("");

  return (
    <AuthForm
      slot="forgot-password-form"
      title={text.title}
      description={text.description}
      error={error}
      onSubmit={() => onSubmit({ email })}
    >
      <EmailField value={email} onValueChange={setEmail} labels={text} disabled={submitting} />
      <Button type="submit" loading={submitting} className="w-full">
        {text.submit}
      </Button>
      {onBackToSignIn === undefined ? null : (
        <Button variant="ghost" size="sm" onClick={onBackToSignIn}>
          {text.backToSignIn}
        </Button>
      )}
    </AuthForm>
  );
}
