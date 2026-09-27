# `__APP_NAME__`

This is the `__APP_SLUG__` Postgres scaffold. It uses TanStack Start on
Cloudflare Workers for the web app, an Effect Platform Node API, PostgreSQL
through Effect SQL, Better Auth, a typed HTTP contract, and the `__PRODUCT__`
UI theme.

## Local development

Use Node 24 and pnpm 11. Copy `.env.example` to `.env` and provide the server
values, then copy `apps/web/.env.example` to `apps/web/.env`. Never commit
`.env` or credentials.

```sh
pnpm install
pnpm db:up
pnpm db:migrate
pnpm contracts:generate
pnpm seed
pnpm dev
```

If port 5432 is already in use, run `POSTGRES_PORT=55444 pnpm db:up` and use
the same port in `DATABASE_URL`.

Root `pnpm dev` starts the web and API development processes. Use `pnpm
web:dev` from the workspace root, or run `pnpm dev` inside `apps/web`, to start
only the web app against a separately running API. Development commands prepare
and watch their compiled workspace dependencies automatically; no manual build
is required.

The web app runs on the local Vite URL printed by the dev command. Its health
route is `/api/health`. The Node API listens on `API_PORT` (default 3001) and
serves the contract under `/api`, Swagger at `/docs`, and OpenAPI JSON at
`/openapi.json`.

## Environment boundaries

The web Worker receives `API_URL` and `API_PORT`. Vite embeds only
`PUBLIC_APP_URL` and `PUBLIC_API_URL` in the browser bundle. Keep
`DATABASE_URL` and `BETTER_AUTH_SECRET` in the API environment only.

## Authentication and preview

Auth screens use the callback-based primitives exported by
`@q9labsai/ui/auth`, wired to Better Auth through the `@__APP_SLUG__/auth`
adapter. Use the development account switcher in the shell to change between
seeded accounts; it is never rendered when `APP_ENV=prod`.

Development password resets return a link in the forgot-password screen. For
production delivery, set `PASSWORD_RESET_WEBHOOK_URL` to an HTTPS endpoint and
`PASSWORD_RESET_WEBHOOK_TOKEN` to its bearer token. The endpoint must accept
the event contract documented in `apps/api/README.md` and deliver the reset
URL by email.

The
preview gallery runs at `/__preview` during development and uses
`@q9labsai/ui/preview`; it is redirected away from production.

Add a gallery scenario by placing a `*.preview.tsx` file beside the route or
component and exporting a `definePreview` scenario. The gallery discovers these
files automatically.

## Internationalization

English is the source locale and Arabic is the RTL sample. Run the catalog
commands after changing translated copy:

```sh
pnpm i18n:extract
```

The Vite plugin compiles catalogs when the app runs. Use the locale switcher in
the shell to change locale and direction. Keep new layout styles logical so the
same component works in LTR and RTL.

## Verification

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm gate
```

`pnpm gate:full` runs all configured lanes. Baselines live under
`gates/baselines/` and must change only through the gate CLI. The OpenAPI
drift lane regenerates `packages/contracts/openapi.json`, and the migration
safety lane checks SQL files under `packages/database/migrations`.

## Deployment

Set `CLOUDFLARE_API_TOKEN` in the deployment environment, then run:

```sh
pnpm build
pnpm deploy:web
```

The deploy command targets the Worker named `__APP_SLUG__-web`. Confirm the
target environment before every deployment.
