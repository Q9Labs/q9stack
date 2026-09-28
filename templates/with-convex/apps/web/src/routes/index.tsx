import { api } from "@__APP_SLUG__/convex";
import { useLingui } from "@lingui/react/macro";
import { diagnosticCodeSchema } from "@q9labsai/diagnostics";
import { Badge, Button, Card } from "@q9labsai/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";

import { DiagnosticError } from "../components/diagnostic-error.js";
import { runtimeAppEnvironment } from "../env.js";
import { captureServerFailure, timedConvexAction } from "../lib/diagnostics.js";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  const { t } = useLingui();
  const samples = useQuery(api.sample.list, {});
  const failForDiagnostics = useAction(api.sample.failForDiagnostics);
  const [diagnosticCode, setDiagnosticCode] = useState<string | undefined>();
  const [failureAttempted, setFailureAttempted] = useState(false);

  const triggerFailure = async (): Promise<void> => {
    setFailureAttempted(false);
    setDiagnosticCode(undefined);
    try {
      await timedConvexAction("sample:failForDiagnostics", () => failForDiagnostics({}));
    } catch (error) {
      const payload: unknown =
        error !== null && typeof error === "object" && "data" in error ? error.data : undefined;
      const candidate =
        payload !== null && typeof payload === "object" && "diagnosticCode" in payload
          ? payload.diagnosticCode
          : undefined;
      const parsed = diagnosticCodeSchema.safeParse(candidate);
      if (parsed.success) {
        setDiagnosticCode(parsed.data);
        captureServerFailure(parsed.data);
      }
      setFailureAttempted(true);
    }
  };

  return (
    <section
      aria-labelledby="home-heading"
      className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-12 sm:px-6 lg:py-20"
    >
      <div className="grid gap-3 text-start">
        <Badge>{t({ id: "home.badge", message: "Convex sample data" })}</Badge>
        <h1
          id="home-heading"
          className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-6xl"
        >
          {t({ id: "home.title", message: "__APP_NAME__" })}
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
          {t({
            id: "home.description",
            message: "A small, accessible starting point backed by Convex.",
          })}
        </p>
      </div>
      <SampleList samples={samples} />
      {runtimeAppEnvironment() === "dev" ? (
        <div className="grid max-w-xl gap-4">
          <Button
            type="button"
            onClick={() => {
              void triggerFailure();
            }}
          >
            {t({ id: "diagnostics.demo.trigger", message: "Test error reporting" })}
          </Button>
          {failureAttempted ? (
            <DiagnosticError
              code={diagnosticCode}
              onRetry={() => {
                void triggerFailure();
              }}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

interface SampleListProps {
  readonly samples: (typeof api.sample.list)["_returnType"] | undefined;
}

function SampleList({ samples }: SampleListProps) {
  const { t } = useLingui();

  if (samples === undefined) {
    return (
      <Card className="grid min-h-40 place-items-center gap-2 p-6">
        <output className="text-sm text-muted-foreground">
          {t({ id: "home.samples.loading", message: "Loading samples…" })}
        </output>
      </Card>
    );
  }

  if (samples.length === 0) {
    return (
      <Card className="grid min-h-40 place-items-center gap-2 p-6">
        <p className="text-sm text-muted-foreground">
          {t({ id: "home.samples.empty", message: "No samples yet." })}
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {samples.map((sample) => (
        <Card className="grid gap-3 p-5" key={sample._id}>
          <div className="flex items-center justify-between gap-3">
            <Badge>{sample.kind}</Badge>
            <span className="text-xs text-muted-foreground">{sample.id}</span>
          </div>
          <h2 className="text-lg font-semibold text-card-foreground">{sample.title}</h2>
          {sample.kind === "published" ? (
            <p className="text-sm text-muted-foreground">
              {t({ id: "home.samples.published", message: "Published" })} {sample.publishedAt}
            </p>
          ) : null}
          {sample.kind === "archived" ? (
            <p className="text-sm text-muted-foreground">
              {t({ id: "home.samples.archived", message: "Archived" })} {sample.archivedAt}
            </p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
