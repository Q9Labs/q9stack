# `__APP_NAME__`

This is the `__APP_SLUG__` application scaffold. It uses TanStack Start on
Cloudflare Workers, a typed environment contract, a pure domain package, and the
`__PRODUCT__` UI theme.

Project intent, work status, visual direction and vocabulary live in
[`theory.md`](theory.md), [`tracker.yaml`](tracker.yaml), [`design.md`](design.md)
and [`glossary.md`](glossary.md).

## Local development

Use Node 24 and pnpm 11. Copy `.env.example` to `.env` and provide values from
your development environment. Never commit `.env` or credentials.

```sh
pnpm install
pnpm dev
pnpm seed
```

Start `pnpm dev` first, then run `pnpm seed`. Use the development account
switcher in the shell to change between seeded accounts. The switcher is never
rendered when `APP_ENV=prod`.

Root `pnpm dev` starts the full selected stack. Use `pnpm web:dev` from the
workspace root, or run `pnpm dev` inside `apps/web`, to start only the web app
against a separately running API. Development commands prepare and watch their
compiled workspace dependencies automatically; no manual build is required.

The web app runs on the local Vite URL printed by the dev command. Its health
route is `/api/health`.

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
