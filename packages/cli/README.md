# @q9labsai/cli

`q9` is the project-local CLI for tracker validation, detached development commands, changelog releases, and diagnostics.

Install with `pnpm add -D @q9labsai/cli`, then add the scripts your project uses:

```json
{
  "scripts": {
    "dev": "q9 dev start -- <command>",
    "dev:status": "q9 dev status",
    "dev:logs": "q9 dev logs",
    "dev:stop": "q9 dev stop",
    "tracker:check": "q9 tracker check",
    "changelog:check": "q9 changelog check",
    "diag": "q9 diag"
  }
}
```

Run scripts with pnpm (for example, `pnpm tracker:check`). Every subcommand accepts `--json`; success emits a JSON value on stdout and failure emits `{ "error": "..." }` on stdout with a nonzero exit code. `dev logs --follow --json` emits the initial result followed by one JSON object per new line.

## Diagnostics

Configure `diag` in the project root `q9.config.json`:

```json
{
  "diag": {
    "adapter": "convex",
    "convexDir": "packages/convex",
    "lookup": "diagnostics/lookup:trace"
  }
}
```

Or use `{ "diag": { "adapter": "command", "command": ["node", "tools/trace-brief.mjs"] } }` for a product-owned read adapter. Multiple sources can be combined as `{ "diag": { "sources": [{ "adapter": "command", "command": ["node", "tools/trace-brief.mjs"] }, { "adapter": "axiom", "org": "org-id", "traces": "trace-dataset", "logs": "log-dataset", "tokenEnv": "AXIOM_QUERY_TOKEN" }] } }`. The single-adapter form remains valid; mixing `adapter` and `sources` is invalid. See the [Convex](../../recipes/diagnostics-convex.md), [command](../../recipes/diagnostics-command.md), and [Axiom](../../recipes/diagnostics-axiom.md) recipes.

`q9 diag trace <code> [--prod | --deployment <name>] [--json] [--no-logs] [--limit <n>] [--after <cursor>] [--otlp [endpoint]]` reads a code from development by default. `--prod` is explicit. `--limit` accepts 1–1000; without it each page retains the existing caps of 500 events, 200 spans, and 100 errors. Pass the brief's opaque `nextCursor` to `--after` to read the next page. `--otlp` exports locally to `http://localhost:4318`; a remote origin requires `diag.otlp.allowedEndpoints` in `q9.config.json`. `q9 diag check` probes every source's installation and read access without requesting a customer trace. Exit codes: 0 found, 2 not found/expired, 3 configuration/argument error, 4 adapter/auth error. `chalkdiag:v1` episode references belong to `pnpm trace:inspect`.

Optional `diagnostics/flows.json` is a JSON array of flow definitions, validated by both `diag check` and `diag trace`. When trace events name a `flow_run`, the CLI fetches that run's events across traces and prints step results before the ordinary events. See the [flows recipe](../../recipes/diagnostics-flows.md).

## Tracker

`tracker.yaml` uses schema version 7. The six built-in areas are `foundation`, `contracts`, `adapters`, `quality`, `toolkit`, and `release`. To admit project-specific areas, create `q9.config.json` in the repository root:

```json
{ "trackerAreas": ["product", "mobile"] }
```

`q9 tracker check [--file tracker.yaml]` validates fields, state-dependent requirements, and referenced files/Markdown headings. Example: `tracker.yaml: valid (12 outcomes)`. On failure, it prints paths such as `tracker.yaml: outcomes[2].code[0]: src/missing.ts: file does not exist`.

`q9 tracker list [--state planned] [--area foundation] [--priority P0]` prints ID, state, priority, size, and title per line. With the package's test fixture:

```text
demo.first  planned  P0  S  First feature
```

`q9 tracker show demo.first` prints that fixture outcome's summary, remaining work, code paths, and evidence:

```text
demo.first — First feature
State: planned
Area: foundation
Priority: P0
Size: S
Summary: A useful feature
Remaining work:
- Implement it
Code paths:
- note.md
Evidence:
- prior_assessment: note.md
```

## Development commands

`q9 dev start [--name api] -- pnpm run dev:server` starts a detached process in the repository root and records its PID, process group, command, start time, and `.logs/api.log` path in `.logs/q9-dev.json`. Example: `Started api (pid 12345); log: /project/.logs/api.log`. Starting an already-running name fails. `.logs/` should be gitignored.

`q9 dev status` shows recorded processes and cheap-to-discover listening ports: `api  pid=12345  alive  uptime=38s  ports=3000`.

`q9 dev logs [--name api] [--tail 20] [--follow]` prints recent log lines; for example, `Ready on http://localhost:3000`. The default name is `dev` and the default tail is 50 lines.

`q9 dev stop [--name api]` stops only the recorded, identity-checked process group: `Stopped api`. The default name is `dev`.

`q9 dev reset` stops all recorded groups and runs `dev:reset:hook` if present in the project's `package.json`: `Stopped 2 process(es); ran dev:reset:hook`.

## Changelog

`CHANGELOG.md` follows Keep a Changelog: `[Unreleased]` first, release headings like `## [1.9.0] - 2026-06-24`, category headings `Added`, `Changed`, `Fixed`, `Removed`, `Security`, or `Internal`, and one-line entries `- **Title**: body`.

`q9 changelog add --type added --title "New workflow" --body "Create a project faster."` appends to `[Unreleased]`: `Added added: New workflow to /project/CHANGELOG.md`.

`q9 changelog release 1.9.0 [--date 2026-06-24]` moves Unreleased entries into a new release and leaves Unreleased empty: `Released 1.9.0 on 2026-06-24 in /project/CHANGELOG.md`. It requires a greater version and nonempty Unreleased entries.

`q9 changelog check` validates headings, entry syntax, dates, and descending semver order: `CHANGELOG.md: valid (2 releases)`.

`q9 changelog export --out changelog.json` writes released, user-facing entries only: `Wrote /project/changelog.json (2 releases)`. Internal entries and releases containing only Internal entries are excluded.
