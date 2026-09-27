# ADR 0002: PostgreSQL persistence through Effect SQL

- Status: accepted
- Date: **YEAR**

## Context

The Postgres variant needs a server-side persistence boundary that can share the domain package with the Node API and the seed runner. The template must not introduce an ORM or leak database credentials into the Cloudflare web Worker.

## Decision

Use PostgreSQL through `@effect/sql` and `@effect/sql-pg`. SQL-in-code migrations run through Effect's migrator, and `packages/database` exposes the database layer plus the `SampleRepo` service. The API uses the same layer for request handlers. Better Auth uses the `pg` adapter against the configured `DATABASE_URL`, while the web app talks to the API through the typed contracts client.

The Cloudflare Worker receives only public app/API settings. `DATABASE_URL` and `BETTER_AUTH_SECRET` remain server-side deployment inputs. No database provider or database resource is declared in the v1 OpenTofu modules because the API Docker image is deployed externally.

## Consequences

- Migrations and repository operations are explicit Effect programs, so callers must provide the database layer and handle failures.
- PostgreSQL is the source of truth for accounts and sample data; seeds use Better Auth's server API so password hashes match runtime authentication.
- The API contract and generated OpenAPI document are checked by the contract drift lane, and SQL migrations are checked by the migration safety lane.
