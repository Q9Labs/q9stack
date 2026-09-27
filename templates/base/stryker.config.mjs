export default {
  plugins: ["@stryker-mutator/vitest-runner"],
  testRunner: "vitest",
  vitest: {
    configFile: "packages/core/vitest.config.ts",
    related: false,
  },
  ignorePatterns: ["tsconfig.json"],
  mutate: ["packages/core/src/**/*.ts"],
  reporters: ["clear-text", "json", "progress"],
};
