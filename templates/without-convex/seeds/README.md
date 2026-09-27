# Development seeds

After `pnpm install`, run `pnpm db:up` and then `pnpm seed`. The seed command builds the API dependency graph, rejects `APP_ENV=prod`, runs the Effect SQL migrations, creates the three Better Auth accounts, and inserts deterministic sample fixtures. Running `pnpm db:migrate` first is safe but not required.

- `createAccounts(seed)` returns `admin@dev.local`, `member@dev.local`, and `viewer@dev.local`, each with password `dev-password`.
- `createSampleFixtures(seed)` returns draft, published, and archived fixtures for every sample entity state.

Account and fixture inserts are idempotent because the runner checks their stable identities before insertion. Better Auth pools close in a scoped release even when a seed operation fails.
