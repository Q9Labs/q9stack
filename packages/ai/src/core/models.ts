export type ModelRole = "fast" | "default" | "reasoning" | "embedding" | "vision";

export type ModelTable = Readonly<{
  readonly fast: string;
  readonly default: string;
  readonly reasoning: string;
  readonly embedding: string;
  readonly vision: string;
}>;

export type ModelOverrides = Partial<ModelTable>;

export type Q9ModelsHook = ModelOverrides | ((models: ModelTable) => ModelOverrides);

export interface ModelRegistryOptions {
  readonly models?: ModelOverrides;
  readonly q9?: {
    readonly models?: Q9ModelsHook;
  };
}

export const DEFAULT_MODELS: ModelTable = {
  fast: "openai/gpt-5.6-luna",
  default: "openai/gpt-5.6-sol",
  reasoning: "openai/gpt-5.6-sol",
  embedding: "openai/text-embedding-3-small",
  vision: "openai/gpt-4o-mini",
};

const mergeModels = (base: ModelTable, overrides: ModelOverrides | undefined): ModelTable => ({
  fast: overrides?.fast ?? base.fast,
  default: overrides?.default ?? base.default,
  reasoning: overrides?.reasoning ?? base.reasoning,
  embedding: overrides?.embedding ?? base.embedding,
  vision: overrides?.vision ?? base.vision,
});

export class ModelRegistry {
  readonly models: ModelTable;

  constructor(options: ModelRegistryOptions = {}) {
    const direct = mergeModels(DEFAULT_MODELS, options.models);
    const hook = options.q9?.models;
    const hookOverrides = typeof hook === "function" ? hook(direct) : hook;
    this.models = mergeModels(direct, hookOverrides);
  }

  resolve(role: ModelRole): string {
    return this.models[role];
  }

  hasRole(value: string): value is ModelRole {
    return (
      value === "fast" ||
      value === "default" ||
      value === "reasoning" ||
      value === "embedding" ||
      value === "vision"
    );
  }

  resolveName(value: string): string {
    return this.hasRole(value) ? this.resolve(value) : value;
  }
}

export const makeModelRegistry = (options: ModelRegistryOptions = {}): ModelRegistry =>
  new ModelRegistry(options);
