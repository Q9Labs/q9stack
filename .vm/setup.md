# Project VM setup

Oort workers read this file before they start project work.

Keep setup commands deterministic, non-interactive, and safe to run more than once. List secret names only. Map their values through Oort instead of putting credentials in this file.

## Runtime

- Required language and tool versions: Node.js 24 or newer
- Package manager: pnpm 11.1.3, pinned by the root `packageManager` field

## Bootstrap

Run these commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
```

## Required secrets and services

- Required environment variables: none for installation, builds, tests, gates, or the UI preview
- Required local or remote services: none

## Development server

- Start command: `pnpm --filter @q9labsai/ui preview --host 0.0.0.0`
- Port: `5311`
- Readiness check: `curl --fail --silent http://127.0.0.1:5311/ >/dev/null`

## Verification

Run these checks after setup and before handoff:

```sh
test "$(pnpm --version)" = "11.1.3"
pnpm gate:full
```

## Project-specific notes

- Read `docs/spec.md` before changing product behavior or repository architecture.
- Use pnpm for all dependency and script commands.
- The root gate handles source templates as repository inputs. Do not install dependencies inside `templates/` unless the task explicitly requires a generated-project smoke test.
