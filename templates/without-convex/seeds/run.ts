import type { AppConfig } from "@__APP_SLUG__/api";
import { createAuthServer, type AuthServer } from "@__APP_SLUG__/api/auth";
import { databaseLayer, runMigrations, SampleRepo, SampleRepoLive } from "@__APP_SLUG__/database";
import { appEnv } from "@__APP_SLUG__/env";
import { fromProcessEnv } from "@q9labsai/env";
import { Effect, Either } from "effect";

import { createAccounts, type SeedAccount } from "./accounts.js";
import { preflightSeedEnvironment, redactedSeedEnvironment } from "./preflight.js";
import { createSampleFixtures } from "./sample.js";

interface AccountRow {
  readonly id: string;
}

const seedAccount = async (server: AuthServer, account: SeedAccount): Promise<void> => {
  const existing = await server.pool.query<AccountRow>(
    'SELECT id FROM "user" WHERE email = $1 LIMIT 1',
    [account.email],
  );
  if (existing.rows.length === 0) {
    await server.auth.api.signUpEmail({
      body: {
        email: account.email,
        name: account.role,
        password: account.password,
      },
    });
  }

  const result = await server.pool.query('UPDATE "user" SET role = $1 WHERE email = $2', [
    account.role,
    account.email,
  ]);
  if (result.rowCount !== 1) {
    throw new Error(`Could not assign role for seeded account ${account.email}.`);
  }
};

const parseSeedEnvironment = (): Either.Either<AppConfig, unknown> => {
  const parsedEnvironment = appEnv.parse(fromProcessEnv());
  if (Either.isLeft(parsedEnvironment)) return Either.left(parsedEnvironment.left);
  return preflightSeedEnvironment(Either.right(redactedSeedEnvironment(parsedEnvironment.right)));
};

const seedProgram = Effect.gen(function* () {
  const environment = yield* Either.match(parseSeedEnvironment(), {
    onLeft: (error) => Effect.fail(error),
    onRight: (value) => Effect.succeed(value),
  });

  const databaseProgram = Effect.gen(function* () {
    yield* runMigrations;
    const repo = yield* SampleRepo;

    yield* Effect.acquireUseRelease(
      Effect.sync(() => createAuthServer(environment)),
      (authServer) =>
        Effect.gen(function* () {
          for (const account of createAccounts(42)) {
            yield* Effect.tryPromise({
              try: () => seedAccount(authServer, account),
              catch: (error: unknown) => error,
            });
          }

          const fixtures = [
            createSampleFixtures(42).draft,
            createSampleFixtures(43).published,
            createSampleFixtures(44).archived,
          ];
          for (const fixture of fixtures) {
            const existing = yield* Effect.either(repo.get(fixture.id));
            if (Either.isLeft(existing)) {
              if (existing.left._tag === "NotFound") {
                yield* repo.insert(fixture);
              } else {
                yield* Effect.fail(existing.left);
              }
            }
          }
        }),
      (authServer) =>
        Effect.tryPromise({
          try: () => authServer.close(),
          catch: (error: unknown) => error,
        }).pipe(Effect.orDie),
    );
  });

  yield* databaseProgram.pipe(
    Effect.provide(SampleRepoLive),
    Effect.provide(databaseLayer(environment.databaseURL)),
  );
});

await Effect.runPromise(seedProgram);
