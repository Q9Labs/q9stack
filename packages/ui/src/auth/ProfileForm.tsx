"use client";

import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "../primitives/avatar";
import { Button } from "../primitives/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "../primitives/field";
import { Input } from "../primitives/input";
import { AuthForm } from "./form-parts";
import { PROFILE_LABELS, type ProfileLabels } from "./labels";

export interface ProfileUser {
  readonly name: string;
  readonly email: string;
  readonly avatarUrl?: string | undefined;
}

export interface ProfileValues {
  readonly name: string;
}

export interface ProfileFormProps {
  readonly user: ProfileUser;
  readonly onSubmit: (values: ProfileValues) => void;
  readonly error?: string | undefined;
  readonly submitting?: boolean | undefined;
  readonly labels?: Partial<ProfileLabels> | undefined;
}

const WHITESPACE = /\s+/;

function initials(name: string): string {
  const parts = name.trim().split(WHITESPACE);
  return parts
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
}

export function ProfileForm({
  user,
  onSubmit,
  error,
  submitting = false,
  labels,
}: ProfileFormProps) {
  const text = { ...PROFILE_LABELS, ...labels };
  const [name, setName] = useState(user.name);

  return (
    <AuthForm
      slot="profile-form"
      title={text.title}
      description={text.description}
      error={error}
      onSubmit={() => onSubmit({ name })}
    >
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          {user.avatarUrl === undefined ? null : <AvatarImage src={user.avatarUrl} alt="" />}
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>
      <Field name="name" disabled={submitting}>
        <FieldLabel>{text.name}</FieldLabel>
        <Input required autoComplete="name" value={name} onValueChange={setName} />
        <FieldError match="valueMissing">{text.nameRequired}</FieldError>
      </Field>
      <Field name="email" disabled>
        <FieldLabel>{text.email}</FieldLabel>
        <Input type="email" value={user.email} readOnly />
        <FieldDescription>{text.emailHint}</FieldDescription>
      </Field>
      <Button type="submit" loading={submitting} className="self-start">
        {text.submit}
      </Button>
    </AuthForm>
  );
}
