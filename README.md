# q9stack

q9stack is an open-source TypeScript toolkit and project generator for shared development tooling and application scaffolds.

It exists to make reusable tooling and starter defaults easier to maintain in one place, so projects can adopt improvements without copying shared code. Application-specific domain logic stays in each project.

## Quickstart

```sh
pnpm create q9stack
```

Follow the prompts to choose a project name and stack.

## Packages

- [create-q9stack](packages/create-q9stack/README.md) — scaffold a project from the q9stack templates.
- [gates](packages/gates/README.md) — plan and run quality checks with the `q9gate` CLI.
- [diagnostics](packages/diagnostics/README.md) — safe diagnostic code, event, and trace-brief contracts.
- [cli](packages/cli/README.md) — project-local agent commands, including `q9 diag`.
- [config-depcruise](packages/config-depcruise/README.md) — reusable dependency-boundary rules.
- [config-oxlint](packages/config-oxlint/README.md) — shared Oxlint and Oxfmt configuration.
- [config-semgrep](packages/config-semgrep/README.md) — reusable Semgrep rule packs.
- [config-tsconfig](packages/config-tsconfig/README.md) — strict TypeScript base configurations.
- [env](packages/env/README.md) — typed environment parsing for Node, Workers, and Vite.
- [ui](packages/ui/README.md) — design tokens, UI primitives, app shell, and theming.
- [ai](packages/ai/README.md) — Effect-wrapped AI model and workflow primitives.
- [voice](packages/voice/README.md) — provider-neutral browser voice-call clients.

## Project guides

- [Theory](theory.md) — scope, sharing model, and design decisions.
- [Glossary](glossary.md) — project terminology.
- [Contributing](CONTRIBUTING.md) — propose recipes, report bugs, and run the gate.
- [Convex diagnostics recipe](recipes/diagnostics-convex.md) and [command adapter recipe](recipes/diagnostics-command.md) — product-owned trace capture and retrieval.
