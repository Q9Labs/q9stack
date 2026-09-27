# `@__APP_SLUG__/env`

This package is the generated app's source of truth for runtime environment keys. It passes `envSchema` to the published `@q9labsai/env` package, so the web app, Wrangler configuration, and deployment checks use the same contract.

The descriptor keeps the base keys and adds the Convex and Better Auth values:

- `VITE_CONVEX_URL` is the public Convex cloud URL used by browser code.
- `BETTER_AUTH_SECRET` is a required server-only signing secret and is redacted.
- `SITE_URL` is the trusted server-side application origin.

`appEnv.keys()` returns all keys in declaration order. The `@q9labsai/env` sibling is resolved when the generated project integrates the published q9stack packages.
