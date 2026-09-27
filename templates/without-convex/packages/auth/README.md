# `@__APP_SLUG__/auth`

`@__APP_SLUG__/auth` keeps the provider-neutral `AuthClient` contract from the base template and supplies its Postgres-variant adapter through Better Auth.

```ts
import { createAuthClient } from "@__APP_SLUG__/auth";

const authClient = createAuthClient("http://localhost:3001", "http://localhost:3000");
const result = await authClient.signIn({
  email: "member@dev.local",
  password: "dev-password",
});
```

The first URL is Better Auth's API base URL. The optional second URL sets the
password-reset callback origin. The adapter maps Better Auth responses to the
discriminated `AuthResult` contract and confirms sign-in through the
cookie-backed session endpoint. Development accounts are fetched from
`/api/dev/accounts`, schema-decoded, and switched with `signOut` followed by
`signIn` using the seeded `dev-password`. `resetPassword` submits the callback
token and new password to Better Auth, while `updateProfile` persists the
authenticated user's display name. In development, `requestPasswordReset`
returns the reset URL from the API's guarded development endpoint. Production
requests use the API's configured delivery webhook and return only an accepted
email-delivery result.
