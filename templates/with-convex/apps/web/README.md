# `__APP_NAME__` web

This is the TanStack Start web app for `__APP_NAME__`. It runs on Vite during development and deploys as a Cloudflare Worker through `wrangler.jsonc`.

```sh
pnpm dev
pnpm build
pnpm test
pnpm e2e
pnpm deploy
```

The health endpoint is `/api/health` and returns `{ ok, version, env }` without exposing secrets. The app contract is supplied by `@__APP_SLUG__/env`. Required public values are validated before rendering, and the Worker validates its own server values before it renders or handles the health route. Convex authentication validates `SITE_URL` and `BETTER_AUTH_SECRET` inside the Convex boundary.

English and Arabic catalogs live in `src/locales`. `LocaleProvider` persists the selected locale in a cookie and applies `lang` plus `dir` to the document. Use logical Tailwind utilities when adding RTL-safe UI.

The `/__preview` gallery is available in development and redirects to `/` when `APP_ENV=prod`. Add a `*.preview.tsx` file beside the route or component that it describes, export a `definePreview(...)` value, and the gallery discovers it with `import.meta.glob`.

Auth routes use `LoginCard`, `SignupCard`, and `ForgotPasswordCard`; the shell uses `UserMenu` and the development-only `AccountSwitcher` from `@q9labsai/ui/auth`. Their callbacks call the Convex Better Auth adapter from `@__APP_SLUG__/auth`. `@q9labsai/ui/preview` supplies `PreviewGallery`, `Tweaker`, `definePreview`, and `knob`.

The home route reads `api.sample.list` through the Convex React provider and renders loading, empty, and populated states. Set `VITE_CONVEX_URL` before starting the web app.
