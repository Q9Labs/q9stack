import { defineGate, lanes } from "@q9labsai/gates";

export default defineGate({
  workspaceRoots: ["apps", "packages", "convex"],
  classifiers: {
    source: [".ts", ".tsx", ".mjs", ".cjs", ".js", ".jsx"],
    docs: ["scratchpad/", "*.md", "*.mdx", "*.txt"],
    dependency: ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"],
    gateDefinition: ["gate.config.ts", "lefthook.yml", "turbo.json", ".github/workflows/"],
    infra: ["infra/"],
    contract: ["packages/contracts/", "convex/schema.ts"],
  },
  concurrency: "50%",
  lanes: [
    lanes.typecheck(),
    lanes.lint(),
    lanes.format(),
    lanes.test(),
    lanes.build(),
    lanes.i18n({
      catalogGlob: "apps/web/src/locales/*/messages.po",
      sourceLocale: "en",
      allowlistPath: "gates/i18n-allowlist.json",
    }),
    lanes.fallow({ baselineDir: "gates/baselines/fallow" }),
    lanes.semgrep({
      packs: ["@q9labsai/config-semgrep/type-safety", "@q9labsai/config-semgrep/shape-heuristics"],
    }),
    lanes.depcruise(),
    lanes.osv(),
    lanes.gitleaks(),
    lanes.cspell(),
    lanes.syncpack(),
    lanes.testPresence({ sourceRoots: ["apps/*/src", "packages/*/src"] }),
    lanes.reactDoctor(),
    lanes.shellcheck(),
    lanes.actionlint(),
    lanes.tofu(),
    lanes.contractDrift({
      generate: "pnpm i18n:extract",
      paths: ["apps/web/src/locales"],
    }),
    lanes.convexCodegenDrift(),
    lanes.envContract({
      schema: "packages/env/src/env.ts",
      sources: [
        {
          glob: "apps/*/wrangler.jsonc",
          forbid: ["BETTER_AUTH_SECRET", "SITE_URL"],
        },
        ".env.example",
      ],
    }),
    // Budget covers the client deploy artifact (JS + CSS); fonts and the SSR
    // worker ship separately and are not part of the interactive payload.
    lanes.bundleSize({ budgets: { "apps/web/dist/client/assets/*.{js,css}": "325 kB" } }),
    lanes.versionDrift(),
    lanes.hygiene(),
  ],
});
