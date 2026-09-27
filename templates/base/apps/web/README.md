# `__APP_NAME__` web

This is the TanStack Start web app for `__APP_NAME__`. It runs on Vite during development and deploys as a Cloudflare Worker through `wrangler.jsonc`.

```sh
pnpm dev
pnpm build
pnpm test
pnpm e2e
pnpm deploy
```

The health endpoint is `/api/health` and returns `{ ok, version, env }` without exposing secrets. The app contract is supplied by `@__APP_SLUG__/env`. Required public values are validated before rendering, and the Worker validates its server values before it renders or handles the health route. Missing or invalid values produce one accumulated configuration error.

English and Arabic catalogs live in `src/locales`. `LocaleProvider` persists the selected locale in a cookie and applies `lang` plus `dir` to the document. Use logical Tailwind utilities when adding RTL-safe UI.

The `/__preview` gallery is available in development and redirects to `/` when `APP_ENV=prod`. Add a `*.preview.tsx` file beside the route or component that it describes, export a `definePreview(...)` value, and the gallery discovers it with `import.meta.glob`.

Auth routes use the callback-based primitives from `@q9labsai/ui/auth`; the
development-only shell uses `DevAccountSwitcher`. Their callback props are
local mock boundaries until an overlay supplies the auth adapter.
`@q9labsai/ui/preview` supplies `PreviewGallery`, `Tweaker`, `definePreview`,
and `knob`.

The sidebar changelog dialog reads the released entries exported from the root
`CHANGELOG.md` at build time; add entries with `pnpm exec q9 changelog add`.
