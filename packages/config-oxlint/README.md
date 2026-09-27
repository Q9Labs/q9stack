# @q9labsai/config-oxlint

Shareable Oxlint and Oxfmt configuration for q9labs TypeScript projects. The package keeps the
correctness and suspicious categories strict, treats performance findings as warnings, and turns on
Oxlint's type-aware TypeScript rules through `oxlint-tsgolint`.

## Consume the configs

For a JSON config, copy the package file into the project and extend it from the project config:

```json
{
  "extends": ["./oxlint.json"]
}
```

Project rules are applied after the shared file, so a local exception can be narrow and explicit:

```json
{
  "extends": ["./oxlint.json"],
  "rules": {
    "no-console": "off",
    "typescript/no-explicit-any": "warn"
  }
}
```

Oxlint 1.79 resolves JSON `extends` entries as filesystem paths relative to the declaring config;
it does not resolve a package specifier such as `@q9labsai/config-oxlint/oxlint.json`. When using
the standalone binary, copy the selected JSON file and its `oxlint.json` base into the project
during `q9gate init` (or copy them directly) and extend that local path. Use an `oxlint.config.ts`
file to import the exported JSON when you want package resolution:

```ts
import { defineConfig } from "oxlint";
import baseConfig from "@q9labsai/config-oxlint/oxlint.json" with { type: "json" };

export default defineConfig({
  extends: [baseConfig],
});
```

The TypeScript form needs the Node-based Oxlint package. Standalone Oxlint binaries should use a
copied JSON file. The package root also exports `configFiles`, a typed map of the published config
paths, for tooling that needs to locate them. `react.json` adds React, React Hooks, and JSX-a11y
rules and browser globals; `node.json` removes those DOM-oriented plugins and enables Node globals.
`oxfmt.json` can be used with `oxfmt -c` or copied to `.oxfmtrc.json`.

Install Oxlint and its type-aware companion in the consuming project:

```sh
pnpm add -D oxlint oxlint-tsgolint oxfmt
```

When extending the JSON config, run Oxlint with type-aware mode at the project root:

```sh
oxlint --type-aware -c .oxlintrc.json .
```

`options.typeAware` is included in the base file for direct use. Oxlint only applies that linter
option from a root config, so a project that extends the file must set it in its own root config or
pass `--type-aware`.

## Policy

The data-structure discipline set is the TypeScript type-aware group: `no-explicit-any`, the
`no-unsafe-*` rules, `no-unnecessary-condition`, `switch-exhaustiveness-check`,
`prefer-nullish-coalescing`, `consistent-type-imports`, and promise/error rules. These checks keep
values narrowed and failures explicit instead of allowing shape-erasing values to spread through a
codebase. The Semgrep package covers syntax patterns that Oxlint cannot express, such as shapeless
records and unsafe type assertions.

`no-unused-vars` ignores names beginning with `_`. `no-console` remains a warning but permits only
`console.warn` and `console.error`. `unicorn/no-array-for-each` is deliberately disabled because
array iteration is often the clearest choice; the Node protocol and useless-undefined checks stay
enabled.

## Formatting

Oxfmt uses two spaces, double quotes, semicolons, trailing commas in all multiline constructs, and
a 100-column width. Oxfmt 0.64 supports import sorting, so the shared config enables its default
import groups.

## Development

```sh
pnpm -F @q9labsai/config-oxlint typecheck
pnpm -F @q9labsai/config-oxlint test
pnpm -F @q9labsai/config-oxlint build
```
