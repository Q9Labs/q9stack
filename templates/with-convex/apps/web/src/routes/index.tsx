import { useLingui } from "@lingui/react/macro";
import { api } from "@__APP_SLUG__/convex";
import { Badge, Card } from "@q9labsai/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  const { t } = useLingui();
  const samples = useQuery(api.sample.list, {});

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
