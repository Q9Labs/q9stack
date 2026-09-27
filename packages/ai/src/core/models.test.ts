import { describe, expect, it } from "vitest";

import { DEFAULT_MODELS, ModelRegistry, makeModelRegistry } from "./models.js";

describe("ModelRegistry", () => {
  it("resolves the locked defaults", () => {
    const registry = new ModelRegistry();

    expect(registry.resolve("fast")).toBe(DEFAULT_MODELS.fast);
    expect(registry.resolve("default")).toBe(DEFAULT_MODELS.default);
    expect(registry.resolve("reasoning")).toBe(DEFAULT_MODELS.reasoning);
    expect(registry.resolve("embedding")).toBe(DEFAULT_MODELS.embedding);
    expect(registry.resolve("vision")).toBe(DEFAULT_MODELS.vision);
  });

  it("gives q9.models precedence over direct models", () => {
    const registry = makeModelRegistry({
      models: {
        fast: "direct/fast",
        vision: "direct/vision",
      },
      q9: {
        models: (models) => ({
          fast: `${models.fast}/q9`,
        }),
      },
    });

    expect(registry.resolve("fast")).toBe("direct/fast/q9");
    expect(registry.resolve("vision")).toBe("direct/vision");
  });

  it("treats an unknown model name as an explicit provider id", () => {
    const registry = new ModelRegistry();

    expect(registry.resolveName("openai/custom-model")).toBe("openai/custom-model");
  });
});
