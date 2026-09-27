# Development seeds

The seed helpers are pure fixture generators. Each call creates and seeds its own Faker instance, so the output depends only on the supplied seed and never on global Faker state or external I/O.

- `createAccounts(seed)` returns the fixed development accounts `admin@dev.local`, `member@dev.local`, and `viewer@dev.local`, each with password `dev-password`.
- `createSampleFixtures(seed)` returns draft, published, and archived fixtures for every sample entity state.

The variant overlays provide the runner that persists these records. Every
runner must reject `APP_ENV=prod` before it writes data.
