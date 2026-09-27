import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

const migration = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE IF NOT EXISTS "user" (
    id text PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    "emailVerified" boolean NOT NULL DEFAULT false,
    image text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    role text NOT NULL DEFAULT 'member',
    CONSTRAINT better_auth_user_role_check
      CHECK (role IN ('admin', 'member', 'viewer'))
  )`;
  yield* sql`ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'`;
  yield* sql`DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = to_regclass('"user"')
          AND conname = 'better_auth_user_role_check'
      ) THEN
        ALTER TABLE "user"
          ADD CONSTRAINT better_auth_user_role_check
          CHECK (role IN ('admin', 'member', 'viewer'));
      END IF;
    END
  $$`;

  yield* sql`CREATE TABLE IF NOT EXISTS session (
    id text PRIMARY KEY,
    "expiresAt" timestamptz NOT NULL,
    token text NOT NULL UNIQUE,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
  )`;
  yield* sql`CREATE INDEX IF NOT EXISTS session_user_id_idx
    ON session ("userId")`;

  yield* sql`CREATE TABLE IF NOT EXISTS account (
    id text PRIMARY KEY,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamptz,
    "refreshTokenExpiresAt" timestamptz,
    scope text,
    password text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`;
  yield* sql`CREATE INDEX IF NOT EXISTS account_user_id_idx
    ON account ("userId")`;

  yield* sql`CREATE TABLE IF NOT EXISTS verification (
    id text PRIMARY KEY,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamptz NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`;
  yield* sql`CREATE INDEX IF NOT EXISTS verification_identifier_idx
    ON verification (identifier)`;
});

export default migration;
