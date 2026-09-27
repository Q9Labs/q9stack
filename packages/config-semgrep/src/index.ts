export const semgrepRulePacks = {
  typeSafety: "@q9labsai/config-semgrep/type-safety",
  shapeHeuristics: "@q9labsai/config-semgrep/shape-heuristics",
  security: "@q9labsai/config-semgrep/security",
} as const;

export type SemgrepRulePack = keyof typeof semgrepRulePacks;
