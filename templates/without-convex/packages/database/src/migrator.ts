import { Migrator } from "@effect/sql";
import { Effect } from "effect";

import initial from "../migrations/0001_init.js";
import betterAuth from "../migrations/0002_better_auth.js";

/** Migrations are registered explicitly so their order cannot drift. */
export const migrationManifest: Migrator.Loader = Effect.succeed([
  [1, "init", Effect.succeed(initial)] as const,
  [2, "better_auth", Effect.succeed(betterAuth)] as const,
]);

/** Runs every forward migration not yet recorded by Effect SQL Migrator. */
export const runMigrations = Migrator.make({})({
  loader: migrationManifest,
});
