import { describe, expect, it } from "vitest";

import { diffEnvContract } from "../../src/core/env-contract.js";

describe("env contract key diffing", () => {
  it("accepts a schema whose keys are present in every source", () => {
    const result = diffEnvContract(
      ["API_URL", "DATABASE_URL"],
      [
        { name: "wrangler.jsonc", keys: ["API_URL", "DATABASE_URL"] },
        { name: ".env.example", keys: ["DATABASE_URL", "API_URL"] },
        { name: "outputs.tf", keys: ["API_URL", "DATABASE_URL"] },
      ],
    );

    expect(result).toEqual({ valid: true, differences: [], forbidden: [] });
  });

  it("reports keys missing from each individual side", () => {
    const result = diffEnvContract(
      ["API_URL", "DATABASE_URL"],
      [
        { name: "wrangler.jsonc", keys: ["API_URL"] },
        { name: ".env.example", keys: ["API_URL", "DATABASE_URL", "EXTRA"] },
      ],
    );

    expect(result.valid).toBe(false);
    expect(result.differences).toEqual([
      { key: "DATABASE_URL", missingFrom: ["wrangler.jsonc"] },
      { key: "EXTRA", missingFrom: ["schema", "wrangler.jsonc"] },
    ]);
  });

  it("deduplicates keys within a source and sorts differences by key", () => {
    const result = diffEnvContract(
      ["ZED", "ZED", "ALPHA"],
      [
        { name: "env", keys: ["ZED", "ZED"] },
        { name: "infra", keys: ["ALPHA", "ALPHA"] },
      ],
    );

    expect(result.differences).toEqual([
      { key: "ALPHA", missingFrom: ["env"] },
      { key: "ZED", missingFrom: ["infra"] },
    ]);
  });

  it("handles an empty contract as valid and an empty source as missing all keys", () => {
    expect(diffEnvContract([], [{ name: "env", keys: [] }])).toEqual({
      valid: true,
      differences: [],
      forbidden: [],
    });
    expect(diffEnvContract(["API_KEY"], [{ name: "env", keys: [] }])).toEqual({
      valid: false,
      differences: [{ key: "API_KEY", missingFrom: ["env"] }],
      forbidden: [],
    });
  });

  it("exempts forbidden keys from presence and flags them when present", () => {
    const exempt = diffEnvContract(
      ["API_URL", "DATABASE_URL"],
      [
        { name: "wrangler.jsonc", keys: ["API_URL"], forbid: ["DATABASE_URL"] },
        { name: ".env.example", keys: ["API_URL", "DATABASE_URL"] },
      ],
    );
    expect(exempt).toEqual({ valid: true, differences: [], forbidden: [] });

    const violated = diffEnvContract(
      ["API_URL", "DATABASE_URL"],
      [{ name: "wrangler.jsonc", keys: ["API_URL", "DATABASE_URL"], forbid: ["DATABASE_URL"] }],
    );
    expect(violated.valid).toBe(false);
    expect(violated.differences).toEqual([]);
    expect(violated.forbidden).toEqual([{ key: "DATABASE_URL", source: "wrangler.jsonc" }]);
  });
});
