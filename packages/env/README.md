# @q9labsai/env

`@q9labsai/env` defines one typed environment contract for Node, Cloudflare Workers, Vite, and Expo. Each schema is named by `defineEnv`, so the key is written once in the object literal and once in the resulting parsed type.

Install the environment package and Effect, whose `Either` and `Redacted` values are part of the public contract:

```sh
pnpm add @q9labsai/env effect
```

```ts
import { defineEnv, integer, string, url } from "@q9labsai/env";
import { Either } from "effect";
import { fromProcessEnv } from "@q9labsai/env/adapters";

const env = defineEnv({
  DATABASE_URL: {
    schema: url(),
    description: "PostgreSQL connection URL",
    scope: "server",
  },
  PORT: {
    schema: integer(),
    description: "HTTP listen port",
    required: false,
    scope: "build",
  },
  VITE_API_URL: {
    schema: string(),
    description: "Public API origin",
    scope: "client",
  },
});

const result = env.parse(fromProcessEnv());
if (Either.isRight(result)) {
  result.right.DATABASE_URL; // URL
  result.right.PORT; // number | undefined
}

const clientEnv = env.client();
clientEnv.keys(); // ["VITE_API_URL"]
clientEnv.parse(import.meta.env);
```

The built-in builders are `string()`, `integer()`, `boolean()`, `url()`, and `redacted()`; they are also available under the `schema` and `schemas` namespaces. They create Effect `Config` values after `defineEnv` supplies the key, so callers do not duplicate key names. Redacted values are returned as Effect `Redacted<string>` values and can be unwrapped only at the integration boundary with `Redacted.value`.

`required` defaults to `true`. Required strings and redacted values reject Unicode-whitespace-only input. Set `required: false` to accept a missing or blank key and receive `undefined`; other malformed optional values still produce an error. `parse` returns an Effect `Either` and evaluates every entry, so `EnvError.issues` lists all missing and invalid keys together without including source values.

`client()` keeps only `scope: "client"` entries whose keys use the `VITE_`, `PUBLIC_`, or `EXPO_PUBLIC_` public prefixes. `keys()` and `schemaJson()` preserve declaration order. `schemaJson()` is a JSON-safe array containing each key, schema kind, description, required flag, and scope.

Use `fromProcessEnv()` in Node, `fromWorkerEnv(env)` for a Worker bindings object, and `fromImportMetaEnv()` or `fromImportMetaEnv(import.meta.env)` in Vite. Worker and Vite adapters copy string bindings and ignore non-string bindings such as KV namespaces.

## Load declared values from 1Password

Install the official `op` CLI, then sign in locally with the desktop app integration or `op signin`. Store each environment value as a field whose label exactly matches its contract key. Pass the contract keys plus an explicit vault and item reference to the adapter:

```ts
import { fromOnePassword } from "@q9labsai/env/adapters/one-password";

const source = fromOnePassword({
  vault: "Development",
  item: "q9stack-development",
  keys: env.keys(),
});
const result = env.parse(source);
```

The adapter invokes `op item get` without a shell and imports only the requested labels. Existing process environment values take precedence, so a developer can override one value without changing the shared item. Missing fields stay absent for `env.parse()` to report alongside other contract issues. Duplicate requested labels, non-string field values, malformed CLI output, authentication failures, and missing items fail with a typed `OnePasswordEnvError`; its message never includes field values or raw CLI output.

For CI, create a least-privilege 1Password service account with read access to the selected vault. Supply `OP_SERVICE_ACCOUNT_TOKEN` through the CI provider's secret store, and supply the vault and item references as CI variables. Do not write the token or resolved environment values to a checked-in file:

```ts
const source = fromOnePassword({
  vault: process.env.OP_VAULT_ID ?? "",
  item: process.env.OP_ITEM_ID ?? "",
  keys: env.keys(),
});
```
