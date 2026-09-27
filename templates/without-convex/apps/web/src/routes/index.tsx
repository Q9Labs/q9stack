import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useLingui } from "@lingui/react/macro";
import { makeClient } from "@__APP_SLUG__/contracts";
import { Badge, Button, Card, Icon } from "@q9labsai/ui";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { useEffect, useState } from "react";

import { publicApiUrl } from "../auth/auth-client.js";

const loadSample = createServerFn({ method: "GET" }).handler(async () => {
  const client = await Effect.runPromise(makeClient(publicApiUrl));
  return Effect.runPromise(client.sample.listSamples({}));
});

type SampleResponse = Awaited<ReturnType<typeof loadSample>>;
type SampleState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "populated"; readonly value: SampleResponse };

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  const { t } = useLingui();
  const [sample, setSample] = useState<SampleState>({ status: "loading" });

  useEffect(() => {
    let mounted = true;
    void loadSample()
      .then((value) => {
        if (mounted) setSample({ status: "populated", value });
      })
      .catch((error: unknown) => {
        if (mounted) {
          setSample({
            message: error instanceof Error ? error.message : "The API request failed.",
            status: "error",
          });
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section
      aria-labelledby="home-heading"
      className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:py-20"
    >
      <div className="grid gap-5 text-start">
        <Badge>{t({ id: "home.badge", message: "Template ready" })}</Badge>
        <h1
          id="home-heading"
          className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-6xl"
        >
          {t({ id: "home.title", message: "__APP_NAME__" })}
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
          {t({
            id: "home.description",
            message: "A small, accessible starting point for your next q9labs project.",
          })}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button">
            {t({ id: "home.primaryAction", message: "Explore the starter" })}
            <Icon icon={ArrowRight01Icon} size="sm" flipInRtl />
          </Button>
          <output className="text-sm text-muted-foreground">
            {t({ id: "home.status", message: "Healthy foundation" })}
          </output>
        </div>
      </div>
      <SampleCard sample={sample} />
    </section>
  );
}

function SampleCard({ sample }: { readonly sample: SampleState }) {
  if (sample.status === "loading") {
    return (
      <Card className="grid min-h-40 gap-3 p-6" aria-busy="true">
        <h2 className="text-xl font-semibold text-card-foreground">Sample API</h2>
        <p className="text-sm text-muted-foreground">Loading sample data…</p>
      </Card>
    );
  }

  if (sample.status === "error") {
    return (
      <Card className="grid min-h-40 gap-3 p-6" role="alert">
        <h2 className="text-xl font-semibold text-card-foreground">Sample API</h2>
        <p className="text-sm text-destructive">{sample.message}</p>
      </Card>
    );
  }

  return (
    <Card className="grid gap-3 p-6">
      <h2 className="text-xl font-semibold text-card-foreground">Sample API</h2>
      <output className="block text-sm leading-6 text-muted-foreground">
        The typed client returned populated data.
      </output>
      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
        {JSON.stringify(sample.value, null, 2)}
      </pre>
    </Card>
  );
}
