import type { HexagonalRuleOptions } from "./rules.js";

export const presets: { readonly monorepo: HexagonalRuleOptions } = {
  monorepo: {
    core: ["packages/core/src"],
    edges: ["apps/*/src", "packages/*/src/{adapters,http,db,cli}"],
  },
};
