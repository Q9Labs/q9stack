# `@__APP_SLUG__/convex`

`@__APP_SLUG__/convex` is the workspace-only generated API package for the
scaffold. The backend functions live in the top-level `convex/` directory. This
package exposes the generated API and types for the web app without publishing
or owning backend source.

Import the generated API and types from the package root:

```ts
import { api } from "@__APP_SLUG__/convex";
import type { Doc, Id } from "@__APP_SLUG__/convex";
```

The package exposes `api`, `internal`, and `components` at runtime, plus
`DataModel`, `Doc`, `Id`, and `TableNames` as types. The `./api` export contains
the same generated runtime references for consumers that only need function
references.

The sample API contains `api.sample.list`, `api.sample.save`, and
`api.sample.saveFromAction`. Every function validates its arguments and return
value. `api.dev.listAccounts` returns seeded account metadata outside
production; `internal.seed.run` is available to the authenticated Convex CLI.

Set `SITE_URL` before starting Convex. Better Auth uses it as its required
base URL and trusted origin, so startup fails with a clear error when it is
missing. Set `APP_ENV=dev` for local development.

Run `pnpm seed` from the scaffold root after the first `pnpm dev`. The seed
action creates the three development accounts with Better Auth's server API,
stores their role metadata, and writes one sample row for each lifecycle state.
It requires `APP_ENV=dev` before any write. A repeated seed is idempotent by
email, account ID, and the deterministic sample fixture ID. Two concurrent
seeds can still race during Better Auth's user creation because the component
does not expose a transaction across that external call; rerun the seed if a
duplicate request loses that race.

The generated `convex/_generated` directory is intentionally ignored. Run
`codegen` before `build` or `test`; the root commands and compatibility wrappers
do this automatically. The `dev` script runs `convex dev`, and `deploy` runs
`convex deploy`.
