import { PgClient } from "@effect/sql-pg";
import { Config, Redacted } from "effect";

/** Runtime client for the application database. */
export const RuntimeSqlLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL"),
  maxConnections: Config.succeed(10),
  applicationName: Config.succeed("__APP_SLUG__-database"),
});

/** Explicit connection layer for tests, seeds, and migration scripts. */
export const databaseLayer = (connectionString: string) =>
  PgClient.layer({
    url: Redacted.make(connectionString),
    maxConnections: 10,
    applicationName: "__APP_SLUG__-database",
  });
