import { useLingui } from "@lingui/react/macro";
import { AuthLayout, VerifyEmailNotice } from "@q9labsai/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/verify-email")({ component: VerifyEmailPage });

function VerifyEmailPage() {
  const { t } = useLingui();
  const [resent, setResent] = useState(false);

  return (
    <AuthLayout footer={t({ id: "auth.footer", message: "Authentication is handled by the API." })}>
      <VerifyEmailNotice
        email="member@dev.local"
        onResend={() => setResent(true)}
        resent={resent}
      />
    </AuthLayout>
  );
}
