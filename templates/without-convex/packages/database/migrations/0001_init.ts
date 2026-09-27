import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

const migration = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE IF NOT EXISTS sample_entities (
    id text PRIMARY KEY,
    title text NOT NULL,
    state text NOT NULL CHECK (state IN ('draft', 'published', 'archived')),
    published_at timestamptz,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  yield* sql`CREATE INDEX IF NOT EXISTS sample_entities_created_at_idx
    ON sample_entities (created_at, id)`;
});

export default migration;
