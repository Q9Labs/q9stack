# `@__APP_SLUG__/auth`

`@__APP_SLUG__/auth` is a provider-neutral authentication port. It defines the account, role, session, input, typed-result, and error contracts that an overlay adapter implements.

```ts
import type { AuthClient, SignInInput } from "@__APP_SLUG__/auth";

const signIn = async (client: AuthClient, input: SignInInput) => client.signIn(input);
```

`AuthClient` exposes `signIn`, `signUp`, `signOut`, `useSession`, `requestPasswordReset`, `listDevAccounts`, and `switchDevAccount`. Every operation returns a `Promise<AuthResult<Value>>`; successful and failed outcomes are discriminated by `ok`. The package contains no framework, provider, storage, or network implementation. Variant overlays supply those adapters.
