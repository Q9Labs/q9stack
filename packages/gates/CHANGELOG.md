# @q9labsai/gates

## 0.3.1

### Patch Changes

- 0e0a664: Read CLI versions from each package manifest, preserve and annotate newly accepted OSV findings, and normalize OSV paths through realpath.
- 4793790: Pass the resolved base to React Doctor during full gate runs.

## 0.3.0

### Minor Changes

- 0dcd8ff: Expose target and unfiltered changed files to custom lane callbacks.
- 4a6a051: Audit explicitly selected Fallow files across branch, index, working-tree, and untracked changes.
- b46fe1c: Allow custom syncpack arguments and Gitleaks git-history scans.
- fea208c: Add configurable OSV excludes and nested JSON catalog support to the i18n lane.
- 8e5cf84: Add a diff-aware i18n lane for Lingui PO catalogs, ICU arguments, Arabic plurals, and reviewed untranslated-string exceptions.
- bf34ccf: Add always-on lane triggers, explicit changed-file inputs, and config-declared targets.
- b2415e3: Update dependency catalogs to current stable releases and require Node 24.
- 0e46dc2: Point published package metadata at the public repository and issue tracker.
- eef77c7: Include committed branch changes in staged gates, inspect configured doctor commands and scripts, and load React Scan through its CommonJS runtime exports.
- 02f9f75: Classify and validate Wrangler TOML environment variables alongside JSON configs.
- 9ad53f3: Resolve gate tools through runnable candidate fallbacks and use the product's dependency-cruiser peer.
- f642201: Add stable Semgrep baselines and report skipped-file parse errors as warnings.

### Patch Changes

- c580696: Make generated environment boundaries reject missing, blank, and invalid required values before server work without revalidating server-only values during browser hydration; move Convex backend functions and their dependencies to top-level `convex/`; make fresh Postgres seed lint prepare typed workspace dependencies; expose the gate CLI after a clean workspace install; and preserve Git ignore files while excluding generated directories and symlinks from packed scaffolds.
- 89b46c8: `lanes.reactDoctor({ requireScanCli: true })` fails when the React Scan CLI is unavailable.
