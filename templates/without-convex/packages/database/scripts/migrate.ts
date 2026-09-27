import { fromProcessEnv, migrationEnv } from "@__APP_SLUG__/env";
import { Effect, Redacted } from "effect";

import { databaseLayer, runMigrations } from "../src/index.js";

const program = Effect.gen(function* () {
  const parsedEnvironment = migrationEnv.parse(fromProcessEnv());
  if (parsedEnvironment._tag === "Left") {
    return yield* Effect.fail(parsedEnvironment.left);
  }

  return yield* runMigrations.pipe(
    Effect.provide(databaseLayer(Redacted.value(parsedEnvironment.right.DATABASE_URL))),
  );
});

Effect.runPromise(program)
  .then((migrations) => {
    process.stdout.write(`Applied ${migrations.length} migration(s).\n`);
  })
  .catch((cause: unknown) => {
    console.error("Database migration failed", cause);
    process.exitCode = 1;
  });
