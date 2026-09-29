#!/usr/bin/env node
import { SqlClient } from "@effect/sql";
import { PgClient } from "@effect/sql-pg";
import { Effect, Redacted } from "effect";

import { parseArguments } from "./args.js";
import { lookupRun, lookupTrace } from "./lookup.js";

async function main(args: string[]): Promise<void> {
  const { operation, value, target } = parseArguments(args);
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is required");
  const client = PgClient.layer({ url: Redacted.make(url), maxConnections: 1 });
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return operation === "trace"
        ? yield* lookupTrace(sql, value, target)
        : yield* lookupRun(sql, value);
    }).pipe(Effect.provide(client)),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main(process.argv.slice(2)).catch(() => {
  process.stderr.write("Diagnostic lookup failed. Check read access, arguments, and migration.\n");
  process.exitCode = 1;
});
