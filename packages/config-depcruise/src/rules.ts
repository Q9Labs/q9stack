import type { IConfiguration, IForbiddenRuleType } from "dependency-cruiser";

import { toDependencyCruiserPatterns } from "./path-pattern.js";

export interface HexagonalRuleOptions {
  readonly core: readonly string[];
  readonly edges: readonly string[];
  readonly extraForbidden?: readonly IForbiddenRuleType[];
  /** Extra path regexes to leave out of the cruise, added to the build-output/fixture defaults. */
  readonly exclude?: readonly string[];
}

const DEFAULT_EXCLUDE = [
  "(?:^|/)node_modules/",
  "(?:^|/)(?:dist|build|coverage|\\.turbo|\\.worktrees|\\.wrangler|\\.output)/",
  "(?:^|/)(?:test|tests|__tests__)/fixtures/",
  "(?:^|/)__fixtures__/",
] as const;

const DEPRECATED_CORE_MODULES = "^(?:punycode|domain|constants|sys|_linklist|_stream_wrap)$";
const PACKAGE_SOURCE_FROM = "(?:^|/)packages/([^/]+)/src(?:/|$)";
const PACKAGE_SOURCE_TO = "(?:^|/)packages/(?!$1/)[^/]+/src(?:/|$)";
const TEST_PATH = "(?:^|/)(?:test|tests|__tests__|[^/]+\\.(?:test|spec)\\.[^/]+)(?:/|$)";

function makeCoreEdgeRule(
  core: readonly string[],
  edges: readonly string[],
): IForbiddenRuleType | undefined {
  if (core.length === 0 || edges.length === 0) {
    return undefined;
  }

  return {
    name: "domain-imports-edge",
    comment:
      "Domain core must not depend on transport, framework, or wiring code: dependencies point inward.",
    severity: "error",
    from: { path: toDependencyCruiserPatterns(core) },
    to: { path: toDependencyCruiserPatterns(edges) },
  };
}

function makeCircularRule(): IForbiddenRuleType {
  return {
    name: "no-circular",
    comment: "Circular imports hide coupling and make dependency direction hard to trace.",
    severity: "error",
    from: {},
    to: { circular: true },
  };
}

function makeOrphanRule(): IForbiddenRuleType {
  return {
    name: "no-orphans",
    comment: "Orphan modules are likely unused and should be removed or wired into the graph.",
    severity: "warn",
    from: { orphan: true },
    to: {},
  };
}

function makeProductionDevDependencyRule(): IForbiddenRuleType {
  return {
    name: "no-dev-dependencies-in-production",
    comment:
      "Production modules must not import packages declared only in devDependencies; keep test tooling at the test edge.",
    severity: "error",
    from: { pathNot: TEST_PATH },
    to: { dependencyTypes: ["npm-dev"] },
  };
}

function makeDeprecatedCoreRule(): IForbiddenRuleType {
  return {
    name: "no-deprecated-core",
    comment:
      "Deprecated Node.js core modules have supported alternatives and must not enter the dependency graph.",
    severity: "error",
    from: {},
    to: {
      dependencyTypes: ["core"],
      path: DEPRECATED_CORE_MODULES,
    },
  };
}

function makeCrossPackageSourceRule(): IForbiddenRuleType {
  return {
    name: "no-cross-package-src-imports",
    comment:
      "Packages must import each other through package names, not by reaching into another package's src directory.",
    severity: "error",
    from: { path: PACKAGE_SOURCE_FROM },
    to: { path: PACKAGE_SOURCE_TO },
  };
}

export function makeHexagonalRules(options: HexagonalRuleOptions): IConfiguration {
  const coreEdgeRule = makeCoreEdgeRule(options.core, options.edges);
  const rules = [
    coreEdgeRule,
    makeCircularRule(),
    makeOrphanRule(),
    makeProductionDevDependencyRule(),
    makeDeprecatedCoreRule(),
    makeCrossPackageSourceRule(),
  ].filter((rule): rule is IForbiddenRuleType => rule !== undefined);

  return {
    forbidden: [...rules, ...(options.extraForbidden ?? [])],
    options: {
      doNotFollow: { path: "node_modules" },
      exclude: { path: [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])] },
      tsPreCompilationDeps: true,
    },
  };
}
