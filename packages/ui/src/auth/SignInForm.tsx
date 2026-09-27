"use client";

import { useState } from "react";

import { Button } from "../primitives/button";
import { EmailField, PasswordField } from "./fields";
import { AuthForm } from "./form-parts";
import { SIGN_IN_LABELS, type SignInLabels } from "./labels";

export interface SignInValues {
  readonly email: string;
  readonly password: string;
}

export interface SignInFormProps {
  readonly onSubmit: (values: SignInValues) => void;
  readonly onForgotPassword?: (() => void) | undefined;
  readonly onSignUp?: (() => void) | undefined;
  readonly error?: string | undefined;
  readonly submitting?: boolean | undefined;
  readonly labels?: Partial<SignInLabels> | undefined;
}

export function SignInForm({
  onSubmit,
  onForgotPassword,
  onSignUp,
  error,
  submitting = false,
  labels,
}: SignInFormProps) {
  const text = { ...SIGN_IN_LABELS, ...labels };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <AuthForm
      slot="sign-in-form"
      title={text.title}
      description={text.description}
      error={error}
      onSubmit={() => onSubmit({ email, password })}
    >
      <EmailField value={email} onValueChange={setEmail} labels={text} disabled={submitting} />
      <PasswordField
        value={password}
        onValueChange={setPassword}
        labels={text}
        autoComplete="current-password"
        disabled={submitting}
      >
        {onForgotPassword === undefined ? null : (
          <Button variant="link" size="sm" className="h-auto p-0" onClick={onForgotPassword}>
            {text.forgotPassword}
          </Button>
        )}
      </PasswordField>
      <Button type="submit" loading={submitting} className="w-full">
        {text.submit}
      </Button>
      {onSignUp === undefined ? null : (
        <p className="text-center text-sm text-muted-foreground">
          {text.noAccount}{" "}
          <Button variant="link" size="sm" className="h-auto p-0" onClick={onSignUp}>
            {text.signUp}
          </Button>
        </p>
      )}
    </AuthForm>
  );
}
