import type { Field as FieldPrimitive } from "@base-ui/react/field";
import type { ReactNode } from "react";

import { Field, FieldError, FieldLabel } from "../primitives/field";
import { Input } from "../primitives/input";
import type { AuthFieldLabels } from "./labels";

export interface EmailFieldProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly labels: AuthFieldLabels;
  readonly disabled?: boolean | undefined;
}

export function EmailField({ value, onValueChange, labels, disabled = false }: EmailFieldProps) {
  return (
    <Field name="email" disabled={disabled}>
      <FieldLabel>{labels.email}</FieldLabel>
      <Input
        type="email"
        required
        autoComplete="email"
        placeholder={labels.emailPlaceholder}
        value={value}
        onValueChange={onValueChange}
      />
      <FieldError match="valueMissing">{labels.emailRequired}</FieldError>
      <FieldError match="typeMismatch">{labels.emailInvalid}</FieldError>
    </Field>
  );
}

export interface PasswordFieldProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly labels: AuthFieldLabels;
  readonly autoComplete: "current-password" | "new-password";
  /** Defaults to the shared "Password" label; override it for a confirmation field. */
  readonly label?: string | undefined;
  readonly minLength?: number | undefined;
  readonly disabled?: boolean | undefined;
  readonly name?: string | undefined;
  readonly customValidity?: FieldPrimitive.Root.Props["validate"] | undefined;
  readonly children?: ReactNode;
}

export function PasswordField({
  value,
  onValueChange,
  labels,
  autoComplete,
  label = labels.password,
  minLength = 8,
  disabled = false,
  name = "password",
  customValidity,
  children,
}: PasswordFieldProps) {
  return (
    <Field name={name} disabled={disabled} validate={customValidity}>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>{label}</FieldLabel>
        {children}
      </div>
      <Input
        type="password"
        required
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={labels.passwordPlaceholder}
        value={value}
        onValueChange={onValueChange}
      />
      <FieldError match="valueMissing">{labels.passwordRequired}</FieldError>
      <FieldError match="tooShort">{labels.passwordTooShort}</FieldError>
      <FieldError />
    </Field>
  );
}
