# `__APP_NAME__` repository guide

This is the `__APP_SLUG__` pnpm workspace. Read `theory.md` for intent,
`tracker.yaml` for status, `design.md` for visual direction and `glossary.md`
for project vocabulary before changing the project.

## Commands

Use Node 24 and pnpm 11. Run `pnpm dev`, `pnpm dev:status`, `pnpm dev:logs`,
`pnpm dev:stop`, `pnpm gate` and `pnpm tracker:check`. Run `pnpm changelog:check`
and `pnpm changelog:export`; add release notes with
`pnpm exec q9 changelog add --type added --title "Title" --body "User-facing change."`.

`pnpm gate` runs the project checks, tracker and changelog validation. The web
build exports released changelog entries into the app bundle.

## Code and boundaries

- Keep domain code in `packages/core` free of framework and provider imports.
- Keep environment parsing in `packages/env`; do not read secrets in UI code.
- Use strict TypeScript and the shared config packages. Do not add `any`, unsafe
  assertions, shapeless records, or unjustified suppressions.
- Keep English and Arabic catalogs in sync with `pnpm i18n:extract`. Preserve
  locale direction and use logical layout classes (`ms-`, `me-`, `ps-`, `pe-`,
  `start-`, `end-`, and `text-start`).
- Keep tests close to behavior. Do not skip or weaken a failing test.
- Keep hooks and gates non-mutating. They must not format, stage, commit, push,
  deploy, or regenerate files.

Keep ADRs and runbooks under `docs/`. Do not access or deploy production without
explicit approval. Never commit `.env` files, credentials, transient build
output, or customer data. Preserve unrelated worktree changes and keep commits
focused.
