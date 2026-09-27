# `@__APP_SLUG__/env`

This package is the scaffold’s source of truth for its five environment keys. It passes `envSchema` to `defineEnv` from the published `@q9labsai/env` package.

The template expects this descriptor shape:

```ts
{
  kind: "string" | "enum" | "url",
  values?: readonly string[],
  optional: boolean,
  server: boolean,
  redacted: boolean,
}
```

`APP_ENV` is a public enum with `dev` and `prod` values. `APP_URL` is a public
URL. `LOG_LEVEL` is a server enum. `OPENROUTER_API_KEY` is a required,
server-only, redacted string. `SENTRY_DSN` is an optional public URL.
`appEnv.keys()` returns the keys in declaration order.

The `@q9labsai/env` sibling is resolved when the generated project integrates the published q9stack packages. The local template does not provide a stub for that package.
