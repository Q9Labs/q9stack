import { describe, expect, it } from "vitest";

import { custom } from "../../src/lanes/custom.js";

describe("custom lane", () => {
  it("accepts the explicit always trigger", () => {
    const lane = custom({
      id: "repository-check",
      title: "Repository check",
      triggers: "always",
      run: async () => ({ status: "passed" }),
    });

    expect(lane.triggers).toBe("always");
  });
});
