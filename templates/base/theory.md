# `__APP_NAME__` — theory

## Purpose

`__APP_NAME__` is a product application scaffolded from q9stack. This file owns
intent; source code owns implementation details.

## Scope boundaries

The application owns its domain rules, data, secrets, operational policy and
product decisions. Shared code belongs in a package only when its behavior is
materially identical across products. Stack-specific shared rules belong in a
recipe; defaults for new applications belong in the scaffold.

## Sharing model

Use `@q9labsai/*` packages for reusable code, recipes for shared invariants
with stack-specific implementations, and local code for product behavior.
Keep generated files understandable and change them in the owning project.

## Agent CLI

Use pnpm scripts for the development server, quality gate, tracker and
changelog. `tracker.yaml` owns status and remaining work; `design.md` owns
visual direction; `glossary.md` owns project vocabulary. Add user-facing release
notes with `q9 changelog add` and review them in the bundled changelog dialog.
