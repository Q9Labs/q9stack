# `@__APP_SLUG__/api`

The Node API uses Effect Platform's `HttpApi` builder. It serves the generated
contract routes, Better Auth at `/api/auth/*`, development auth helpers under
`/api/dev/*`, Swagger UI at `/docs`, and the OpenAPI JSON document at
`/openapi.json`.

## Local development

Set the environment contract values from the project root, start Postgres, run
the database migration, and then start the API with `pnpm api:dev`. The API
listens on `API_PORT` and allows credentialed requests from `APP_URL`.

## Deployment

The Dockerfile is a neutral Node 24 image that works with Fly.io, Railway, or
Cloud Run. Set `APP_ENV=prod`, provide the redacted database and auth secrets,
and configure `APP_URL` and `API_URL` to their deployed HTTPS origins. Production
cookies are secure and cross-origin; the API does not enable development account
discovery in production. Request logs omit query strings and replace password-reset
path tokens with `:token`; tracing is disabled for token-bearing targets.
`@q9labsai/diagnostics-server` adds a diagnostic code response header and safe
failure body, with optional OTLP/HTTP export when `OTEL_EXPORTER_OTLP_ENDPOINT`
is set. Unexpected failures are stored in `diagnostic_events` for `pnpm diag`.

Password-reset requests return an in-app reset link in development. In
production, set `PASSWORD_RESET_WEBHOOK_URL` to an HTTPS endpoint and
`PASSWORD_RESET_WEBHOOK_TOKEN` to its bearer token. The API posts a
`password-reset.requested` event with `recipient.email` and `resetUrl`, and it
fails the auth request if delivery fails. The webhook must send the link through
the application's email provider and return a 2xx response.

## Auth database tables

The Effect SQL migrator shipped in `packages/database` exclusively owns Better
Auth's `user`, `session`, `account`, and `verification` tables. Never run the
Better Auth CLI migration against the same database, because it would bypass
the migration manifest and create drift. When upgrading Better Auth, use the
CLI only to generate and compare SQL outside the configured database, then put
any reviewed changes into a new Effect migration.
