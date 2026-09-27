"use client";

import { useState } from "react";

import { Button } from "../primitives/button";
import { Field, FieldError, FieldLabel } from "../primitives/field";
import { Input } from "../primitives/input";
import { EmailField, PasswordField } from "./fields";
import { AuthForm } from "./form-parts";
import { SIGN_UP_LABELS, type SignUpLabels } from "./labels";

export interface SignUpValues {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export interface SignUpFormProps {
  readonly onSubmit: (values: SignUpValues) => void;
  readonly onSignIn?: (() => void) | undefined;
  readonly error?: string | undefined;
  readonly submitting?: boolean | undefined;
  readonly labels?: Partial<SignUpLabels> | undefined;
}

export function SignUpForm({
  onSubmit,
  onSignIn,
  error,
  submitting = false,
  labels,
}: SignUpFormProps) {
  const text = { ...SIGN_UP_LABELS, ...labels };
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <AuthForm
      slot="sign-up-form"
      title={text.title}
      description={text.description}
      error={error}
      onSubmit={() => onSubmit({ name, email, password })}
    >
      <Field name="name" disabled={submitting}>
        <FieldLabel>{text.name}</FieldLabel>
        <Input
          required
          autoComplete="name"
          placeholder={text.namePlaceholder}
          value={name}
          onValueChange={setName}
        />
        <FieldError match="valueMissing">{text.nameRequired}</FieldError>
      </Field>
      <EmailField value={email} onValueChange={setEmail} labels={text} disabled={submitting} />
      <PasswordField
        value={password}
        onValueChange={setPassword}
        labels={text}
        autoComplete="new-password"
        disabled={submitting}
      />
      <Button type="submit" loading={submitting} className="w-full">
        {text.submit}
      </Button>
      {onSignIn === undefined ? null : (
        <p className="text-center text-sm text-muted-foreground">
          {text.haveAccount}{" "}
          <Button variant="link" size="sm" className="h-auto p-0" onClick={onSignIn}>
            {text.signIn}
          </Button>
        </p>
      )}
    </AuthForm>
  );
}
