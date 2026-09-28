import { useLingui } from "@lingui/react/macro";
import { Button, Card } from "@q9labsai/ui";
import { useState } from "react";

interface DiagnosticErrorProps {
  readonly code: string | undefined;
  readonly onRetry?: () => void;
}

export function DiagnosticError({ code, onRetry }: DiagnosticErrorProps) {
  const { t } = useLingui();
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card role="alert" className="grid gap-4 p-6 text-start">
      <div className="grid gap-2">
        <h2 className="text-lg font-semibold text-card-foreground">
          {t({ id: "diagnostics.error.title", message: "Something went wrong" })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {code
            ? t({
                id: "diagnostics.error.with_code",
                message: "Share this diagnostic code with support so we can investigate.",
              })
            : t({
                id: "diagnostics.error.without_code",
                message: "Please try again. A diagnostic code is not available right now.",
              })}
        </p>
      </div>
      {code ? (
        <div className="flex flex-wrap items-center gap-3">
          <code
            dir="ltr"
            className="rounded-md bg-muted px-3 py-2 font-mono text-sm text-foreground select-all"
          >
            {code}
          </code>
          <Button
            type="button"
            onClick={() => {
              void copy();
            }}
          >
            {copied
              ? t({ id: "diagnostics.error.copied", message: "Copied" })
              : t({ id: "diagnostics.error.copy", message: "Copy code" })}
          </Button>
        </div>
      ) : null}
      {onRetry ? (
        <div>
          <Button type="button" onClick={onRetry}>
            {t({ id: "diagnostics.error.retry", message: "Try again" })}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
