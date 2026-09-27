# `__APP_NAME__` web

This is the TanStack Start web app for `__APP_NAME__`. It runs on Vite during development and deploys as a Cloudflare Worker through `wrangler.jsonc`.

```sh
pnpm dev
pnpm build
pnpm test
pnpm e2e
pnpm deploy
```

The home route calls the Postgres API through `@__APP_SLUG__/contracts` inside a TanStack `createServerFn`. It renders loading, error, and populated states without exposing database or Better Auth credentials to the Worker.

The browser auth boundary reads `PUBLIC_API_URL` and `PUBLIC_APP_URL` at
build time and creates the Better Auth client pointed at the Node API.
`API_URL` remains the server-side Worker binding. `DATABASE_URL` and
`BETTER_AUTH_SECRET` belong to the API process and must not be added to
`wrangler.jsonc`.

Required browser values fail before rendering instead of falling back to
localhost. The Worker validates only its own public and server bindings;
database and authentication secrets remain at the Node API boundary.

The `/__preview` gallery is available in development and redirects to `/` when `APP_ENV=prod`. Auth routes use `AuthLayout`, `SignInForm`, `SignUpForm`, `ForgotPasswordForm`, `ResetPasswordForm`, `VerifyEmailNotice`, `ProfileForm`, and `DevAccountSwitcher` from `@q9labsai/ui/auth`.
