"use client";

import { Mail01Icon } from "@hugeicons/core-free-icons";

import { Icon } from "../icon";
import { Button } from "../primitives/button";
import { VERIFY_EMAIL_LABELS, type VerifyEmailLabels } from "./labels";

export interface VerifyEmailNoticeProps {
  readonly email: string;
  readonly onResend: () => void;
  /** Set after a successful resend so the button reads as done. */
  readonly resent?: boolean | undefined;
  readonly submitting?: boolean | undefined;
  readonly labels?: Partial<VerifyEmailLabels> | undefined;
}

export function VerifyEmailNotice({
  email,
  onResend,
  resent = false,
  submitting = false,
  labels,
}: VerifyEmailNoticeProps) {
  const text = { ...VERIFY_EMAIL_LABELS, ...labels };
  return (
    <div data-slot="verify-email-notice" className="flex flex-col items-center gap-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon icon={Mail01Icon} size="lg" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold text-foreground">{text.title}</h1>
        <p className="text-sm text-muted-foreground">{text.description(email)}</p>
      </div>
      <Button variant="outline" onClick={onResend} loading={submitting} disabled={resent}>
        {resent ? text.resent : text.resend}
      </Button>
    </div>
  );
}
