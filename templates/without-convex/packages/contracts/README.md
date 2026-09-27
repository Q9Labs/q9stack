# `@__APP_SLUG__/contracts`

`@__APP_SLUG__/contracts` is the shared Effect Platform HTTP contract for the
application API. It exports the `AppApi` definition, payload schemas, typed
transport errors, and a Fetch-based client.

Generate the committed OpenAPI document with:

```sh
pnpm contracts:generate
```

The API exposes health and sample lifecycle endpoints under `/api`.
