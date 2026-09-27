import { defineGate, lanes } from "@q9labsai/gates";

export default defineGate({
  workspaceRoots: ["packages", "tools"],
  classifiers: {
    source: [".ts", ".tsx", ".mjs", ".cjs", ".js", ".jsx"],
    docs: ["scratchpad/", "*.md", "*.mdx", "*.txt"],
    dependency: ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"],
    gateDefinition: ["gate.config.ts", "lefthook.yml", "turbo.json", ".github/workflows/"],
    infra: ["infra/"],
    contract: ["packages/contracts/"],
  },
  concurrency: "50%",
  lanes: [
    lanes.typecheck(),
    lanes.lint(),
    lanes.format(),
    lanes.test(),
    lanes.build(),
    lanes.fallow({ baselineDir: "gates/baselines/fallow" }),
    lanes.semgrep({
      packs: [
        "@q9labsai/config-semgrep/type-safety",
        "@q9labsai/config-semgrep/shape-heuristics",
        ".semgrep/project.yml",
      ],
    }),
    lanes.depcruise(),
    lanes.osv(),
    lanes.gitleaks(),
    lanes.cspell(),
    lanes.syncpack(),
    lanes.testPresence({ sourceRoots: ["packages/*/src", "tools/*/src"] }),
    lanes.shellcheck(),
    lanes.actionlint(),
    lanes.versionDrift(),
    lanes.hygiene(),
  ],
});
