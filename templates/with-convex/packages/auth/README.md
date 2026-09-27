# `@__APP_SLUG__/auth`

`@__APP_SLUG__/auth` defines the provider-neutral authentication port used by the web shell and auth screens. It exports the account, role, session, input, typed-result, and error contracts.

The Convex overlay also exports `createConvexAuthClient`. Give it the Better Auth base URL and a Convex client with `query`; it creates the Better Auth React client with the Convex plugin and returns that raw client beside the provider-neutral port.

```ts
import { createConvexAuthClient } from "@__APP_SLUG__/auth";

const { auth, authClient } = createConvexAuthClient({ baseURL, convex });
const result = await auth.signIn({ email, password });
```

Every operation returns a `Promise<AuthResult<Value>>`; successful and failed outcomes are discriminated by `ok`. The adapter never calls React hooks: `useSession` calls Better Auth's promise-returning `getSession` operation.
