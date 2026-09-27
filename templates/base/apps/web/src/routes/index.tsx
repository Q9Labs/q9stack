import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useLingui } from "@lingui/react/macro";
import { Badge, Button, Card, Icon } from "@q9labsai/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  const { t } = useLingui();

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
      <Card className="grid gap-3 p-6">
        <h2 className="text-xl font-semibold text-card-foreground">
          {t({ id: "home.cardTitle", message: "What is included" })}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {t({
            id: "home.cardDescription",
            message: "Shared tokens, typed environment contracts, and a Worker-ready web app.",
          })}
        </p>
      </Card>
    </section>
  );
}
