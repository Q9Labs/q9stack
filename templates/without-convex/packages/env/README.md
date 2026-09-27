# `@__APP_SLUG__/env`

This package is the application environment contract for the Postgres variant. It uses the published `@q9labsai/env` API: every entry has a `schema`, `description`, and `scope`, and parsing returns an Effect `Either` with accumulated issues.

The contract includes `APP_ENV`, `APP_URL`, `API_URL`, `API_PORT`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `LOG_LEVEL`, and `OPENROUTER_API_KEY`. `PASSWORD_RESET_WEBHOOK_URL`, `PASSWORD_RESET_WEBHOOK_TOKEN`, and `SENTRY_DSN` are optional. Public URL values use `schema.url()`, the API port uses `schema.integer()`, and database or credential values use `schema.redacted()`.

`DATABASE_URL`, `BETTER_AUTH_SECRET`, and the password-reset webhook settings are server-only. The web Worker receives only public application and API settings; never copy database or Better Auth credentials into `wrangler.jsonc`.

```ts
import { fromProcessEnv } from "@q9labsai/env";
import { appEnv } from "@__APP_SLUG__/env";

const parsed = appEnv.parse(fromProcessEnv());
if (parsed._tag === "Left") throw parsed.left;
```
