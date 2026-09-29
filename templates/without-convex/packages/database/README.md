# `@__APP_SLUG__/database`

The `diagnostic_events` migration stores schema-validated diagnostic events for
the command lookup. Schedule this retention query daily using a maintenance
role: `DELETE FROM diagnostic_events WHERE occurred_at < (EXTRACT(EPOCH FROM now() - INTERVAL '14 days') * 1000)::bigint;`.

The database package owns the PostgreSQL layer, append-only Effect SQL
migrations, and the sample repository for the without-Convex overlay.

`RuntimeSqlLive` reads `DATABASE_URL` through Effect Config. Tests and local
seeds can use `databaseLayer(connectionString)` instead:

```ts
import { Effect } from "effect";
import { SampleRepo, SampleRepoLive, databaseLayer, runMigrations } from "@__APP_SLUG__/database";
import { Layer } from "effect";

const program = Effect.gen(function* () {
  yield* runMigrations;
  const repository = yield* SampleRepo;
  return yield* repository.list();
});

const layer = Layer.provideMerge(
  SampleRepoLive,
  databaseLayer("postgres://app:app@localhost:5432/app"),
);
```

From the project root, start Postgres with `pnpm db:up` and run the checked-in
migrations with `pnpm db:migrate`. The
repository persists the `draft → published → archived → draft` lifecycle from
`@__APP_SLUG__/core` and reports invalid transitions as typed errors.
