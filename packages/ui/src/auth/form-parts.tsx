"use client";

import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import type { FormEvent, ReactNode } from "react";

import { Icon } from "../icon";

interface AuthHeaderProps {
  readonly title: string;
  readonly description?: string | undefined;
}

function AuthHeader({ title, description }: AuthHeaderProps) {
  return (
    <div data-slot="auth-header" className="flex flex-col gap-1.5 text-start">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      {description === undefined ? null : (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

interface AuthErrorProps {
  readonly message: string;
}

/** Form-level failure, announced to assistive technology when it appears. */
function AuthError({ message }: AuthErrorProps) {
  return (
    <p
      data-slot="auth-error"
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <Icon icon={AlertCircleIcon} size="sm" className="mt-0.5" />
      <span>{message}</span>
    </p>
  );
}

export interface AuthFormProps {
  readonly slot: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly error?: string | undefined;
  readonly onSubmit: () => void;
  readonly children: ReactNode;
}

/** The shell every auth screen shares: heading, form-level error, then fields. */
export function AuthForm({ slot, title, description, error, onSubmit, children }: AuthFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form data-slot={slot} className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <AuthHeader title={title} description={description} />
      {error === undefined ? null : <AuthError message={error} />}
      {children}
    </form>
  );
}
