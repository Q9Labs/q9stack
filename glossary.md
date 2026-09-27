# Glossary

Canonical q9stack terms and their meanings. Use them consistently in code, docs, commits and issues. [theory.md](theory.md) explains intended behavior, and [tracker.yaml](tracker.yaml) owns status.

## Sharing

| Term | Definition |
| --- | --- |
| **Product** | A q9labs application that consumes q9stack, such as Ava, Recruiter, Kaadr, Chalk, Murmur or Track. q9stack itself is not a product. |
| **Package** | Code that is materially identical across products, published as `@q9labsai/*`. A bad upgrade fails a product's gate instead of breaking production. |
| **Recipe** | A Markdown spec under `recipes/` for a concern whose rules are shared but whose code depends on the stack. Every recipe names a reference implementation and a conformance check. |
| **Reference implementation** | The product code where a recipe was first built and proven. An agent reads it when applying the recipe to another product. |
| **Conformance check** | A gate lane or small test that proves a product follows a recipe. A recipe without one is not accepted. |
| **Promotion** | Turning a recipe into a package, allowed only after two products run materially the same code. |
| **Harvest** | A read-only survey of the products that finds work worth sharing and ranks it by sharing mode. |

## Scaffold

| Term | Definition |
| --- | --- |
| **Scaffold** | The project that `create-q9stack` generates. The product owns every generated file after generation. |
| **Base** | The template tree that every scaffold starts from, in `templates/base`. |
| **Overlay** | Variant files that the generator copies on top of the base. |
| **Variant** | A scaffold choice that selects an overlay: Convex by default, Postgres for on-prem or enterprise products. |
| **Starter flow** | The authenticated path a fresh scaffold must complete before its variant counts as supported. |

## Gate

| Term | Definition |
| --- | --- |
| **Gate** | The `q9gate` run that plans and executes a project's configured checks. |
| **Lane** | One independently reported check in a gate run, such as lint, types or i18n. |
| **Baseline** | Reviewed findings that a lane may not exceed. New findings fail the lane. |

## Agent CLI

| Term | Definition |
| --- | --- |
| **q9** | The agent CLI from `@q9labsai/cli`. Projects call it through pnpm scripts, so agents keep running pnpm. |
| **Tracker** | A project's `tracker.yaml`: outcomes, status, remaining work and evidence. There are no rendered views. |
| **Changelog entry** | One line under Unreleased in `CHANGELOG.md`, written with `q9 changelog add`. Every entry outside Internal appears in the changelog dialog. |
| **Changelog dialog** | The in-app dialog that shows user-facing changelog entries. The app bundles them at build time. |
| **Diagnostic code** | The safe identifier a user sees on a failure. `q9 diag` resolves it into the browser journey, server log and stack. |
