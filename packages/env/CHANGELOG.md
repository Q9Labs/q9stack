# @q9labsai/env

## 0.3.0

### Minor Changes

- 02f9f75: Accept Expo's EXPO_PUBLIC_ prefix in typed client environment contracts.
- b2415e3: Update dependency catalogs to current stable releases and require Node 24.
- 0e46dc2: Point published package metadata at the public repository and issue tracker.
- 733edd8: Add a secure 1Password CLI adapter that loads declared environment fields with typed, redacted failures and deterministic command injection for tests.

### Patch Changes

- c580696: Make generated environment boundaries reject missing, blank, and invalid required values before server work without revalidating server-only values during browser hydration; move Convex backend functions and their dependencies to top-level `convex/`; make fresh Postgres seed lint prepare typed workspace dependencies; expose the gate CLI after a clean workspace install; and preserve Git ignore files while excluding generated directories and symlinks from packed scaffolds.
