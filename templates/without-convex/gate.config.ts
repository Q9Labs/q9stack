import { defineGate, lanes } from "@q9labsai/gates";

export default defineGate({
  workspaceRoots: ["apps", "packages"],
  classifiers: {
    source: [".ts", ".tsx", ".mjs", ".cjs", ".js", ".jsx"],
    docs: ["scratchpad/", "*.md", "*.mdx", "*.txt"],
    dependency: ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"],
    gateDefinition: ["gate.config.ts", "lefthook.yml", "turbo.json", ".github/workflows/"],
    infra: ["infra/"],
    contract: ["packages/contracts/"],
    sql: ["packages/database/migrations/"],
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
    lanes.contractDrift({
      id: "openapi-drift",
      title: "Generated OpenAPI drift",
      generate: "pnpm contracts:generate",
      paths: ["packages/contracts/openapi.json"],
    }),
    lanes.migrationSafety({ dir: "packages/database/migrations" }),
    lanes.envContract({
      schema: "packages/env/src/env.ts",
      sources: [
        {
          // The web Worker never receives database or auth secrets; the gate
          // fails if one of these keys ever lands in a wrangler config.
          glob: "apps/*/wrangler.jsonc",
          forbid: [
            "BETTER_AUTH_SECRET",
            "DATABASE_URL",
            "PASSWORD_RESET_WEBHOOK_TOKEN",
            "PASSWORD_RESET_WEBHOOK_URL",
          ],
        },
        ".env.example",
      ],
    }),
    // Budget covers the client deploy artifact (JS + CSS); fonts and the SSR
    // worker ship separately and are not part of the interactive payload.
    // The Postgres variant ships the Better Auth client and the typed contract
    // client in the browser bundle, so its budget sits above the base 250 kB.
    lanes.bundleSize({ budgets: { "apps/web/dist/client/assets/*.{js,css}": "350 kB" } }),
    lanes.versionDrift(),
    lanes.hygiene(),
  ],
});
