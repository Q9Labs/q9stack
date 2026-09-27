# @q9labsai/config-depcruise

Shareable dependency-cruiser rules for q9labs projects. The factory creates a
hexagonal architecture rule set: core code cannot import edge code, cycles and
deprecated Node core modules are errors, orphan modules are warnings, and
production modules cannot import devDependencies. It also blocks package source
imports so workspace packages are consumed through their public package names.

## Install

```sh
pnpm add -D @q9labsai/config-depcruise dependency-cruiser
```

## Configuration

The input paths accept dependency-cruiser regular expressions. Glob-style
`*`, `?`, and `{one,two}` segments are also accepted and are converted to
path-aware regular expressions. The built-in monorepo preset is intended for
the q9stack layout:

```js
const { makeHexagonalRules, presets } = require("@q9labsai/config-depcruise");

module.exports = makeHexagonalRules(presets.monorepo);
```

For a project with a different layout, provide its core and edge paths:

```js
const { makeHexagonalRules } = require("@q9labsai/config-depcruise");

module.exports = makeHexagonalRules({
  core: ["^src/domains"],
  edges: ["^src/(http|app|infra|adapters|routes)"],
});
```

Use `extraForbidden` to add project-specific dependency-cruiser forbidden
rules. The result is an `IConfiguration` and can be passed to the
dependency-cruiser API as `ruleSet`:

```ts
import { cruise } from "dependency-cruiser";
import { makeHexagonalRules, presets } from "@q9labsai/config-depcruise";

const result = await cruise(["src"], {
  validate: true,
  ruleSet: makeHexagonalRules(presets.monorepo),
});
```

dependency-cruiser 18.4.0 does not export a public `IRuleDefinition` type.
Its `IConfiguration.forbidden` field uses the exported `IForbiddenRuleType`
union, so `extraForbidden` uses that canonical type instead of inventing a
local duplicate.

### TypeScript 7 compatibility

dependency-cruiser 18.4.0 only analyzes `.ts` and `.tsx` when it can resolve a TypeScript compiler
below version 7 from its own dependency context. A TypeScript 7 compiler at the workspace root is
not sufficient. q9stack provides TypeScript 6.0.3 to dependency-cruiser with this pnpm workspace
extension:

```yaml
packageExtensions:
  dependency-cruiser:
    dependencies:
      typescript: 6.0.3
```

Keep the extension in workspaces that use TypeScript 7. The q9gate depcruise lane prefers the
config package's dependency-cruiser binary when it is available, then verifies that TypeScript
sources were included in the report. It fails with an install hint instead of silently passing
when `.ts` or `.tsx` files exist but no TypeScript modules were cruised. The rule tests exercise
both TypeScript and TSX fixtures.

## CJS and ESM

The package publishes `dist/index.js` for ESM and `dist/index.cjs` for CJS.
The sample `.dependency-cruiser.cjs` therefore uses `require()` safely. In
dependency-cruiser 18.4.0, the config loader dynamically imports `.cjs` files
and reads the CommonJS default export, so the sample works with the ESM-only
dependency-cruiser package as well as its CLI.

## Data-structure discipline

The core-edge rule makes dependency direction explicit instead of relying on
folder conventions that reviewers must remember. The package-source rule keeps
workspace boundaries at public package APIs. Together with the cycle rule,
these checks prevent hidden coupling from moving into otherwise untyped object
graphs and preserve a small, traceable dependency surface.
