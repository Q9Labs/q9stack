import { describe, expect, it } from "vitest";

import { parseArguments } from "../src/args.js";

const code = "1234567890abcdef1234567890abcdef";

describe("lookup arguments", () => {
  it("accepts the CLI's paging flags alongside a target", () => {
    expect(parseArguments(["trace", code, "--prod", "--limit", "50", "--after", "abc"])).toEqual({
      operation: "trace",
      value: code,
      target: "production",
    });
    expect(parseArguments(["trace", code, "--limit", "5"]).target).toBe("development");
  });
  it("rejects unknown flags and a paging flag without a value", () => {
    expect(() => parseArguments(["trace", code, "--verbose"])).toThrow("Invalid target");
    expect(() => parseArguments(["trace", code, "--limit"])).toThrow("Missing value");
  });
});
