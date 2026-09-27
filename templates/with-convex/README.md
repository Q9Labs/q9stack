# `__APP_NAME__`

This is the `__APP_SLUG__` application scaffold. It uses TanStack Start on
Cloudflare Workers, a typed environment contract, a pure domain package, and the
`__PRODUCT__` UI theme.

## Local development

Use Node 24 and pnpm 11. Complete the first-time Convex backend setup below,
then copy `.env.example` to `.env` and provide values from your development
environment. Never commit `.env` or credentials.

```sh
pnpm install
pnpm dev
pnpm seed
```

Start `pnpm dev` first, then run `pnpm seed`. Use the development account
switcher in the shell to change between seeded accounts. The switcher is never
rendered when `APP_ENV=prod`.

The web app runs on the local Vite URL printed by the dev command. Its health
route is `/api/health`.

## Convex backend

Convex functions live in the top-level `convex/` directory and the deployment
is configured from the repository root: `convex.json` and `.env.local` both
live here, and the root `convex:*` scripts plus the package scripts all target
this single home. The workspace-only `@__APP_SLUG__/convex` package exposes the
generated API and remains the stable import boundary for application code.

First-time local setup without a Convex account:

```sh
CONVEX_AGENT_MODE=anonymous pnpm exec convex dev --once
pnpm exec convex env set APP_ENV dev
pnpm exec convex env set SITE_URL http://127.0.0.1:3211
pnpm exec convex env set BETTER_AUTH_SECRET "$(openssl rand -hex 32)"
printf '\nVITE_CONVEX_URL=http://127.0.0.1:3210\n' >> .env.local
```

The first command starts a local anonymous deployment and writes
`CONVEX_DEPLOYMENT` into `.env.local`. Development functions require `APP_ENV`,
and Better Auth requires `SITE_URL` plus `BETTER_AUTH_SECRET` on the deployment
before the first successful push, so set them and then re-run
`pnpm exec convex dev --once` (or keep `pnpm convex:dev` running) to push
functions.

## Authentication and preview

Auth screens use the callback-based primitives exported by
`@q9labsai/ui/auth`. The adapter is supplied by the selected overlay. The
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
`gates/baselines/` and must change only through the gate CLI.

## Deployment

Set `CLOUDFLARE_API_TOKEN` in the deployment environment, then run:

```sh
pnpm build
pnpm deploy:web
```

The deploy command targets the Worker named `__APP_SLUG__-web`. Confirm the
target environment before every deployment.
