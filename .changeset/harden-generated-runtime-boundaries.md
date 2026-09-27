---
"@q9labsai/env": patch
"@q9labsai/gates": patch
"create-q9stack": patch
---

Make generated environment boundaries reject missing, blank, and invalid required values before server work without revalidating server-only values during browser hydration; move Convex backend functions and their dependencies to top-level `convex/`; make fresh Postgres seed lint prepare typed workspace dependencies; expose the gate CLI after a clean workspace install; and preserve Git ignore files while excluding generated directories and symlinks from packed scaffolds.
