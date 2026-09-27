import { availableParallelism } from "node:os";

import { describe, expect, it } from "vitest";

import { resolveConcurrency } from "../../src/orchestrator/concurrency.js";

describe("resolveConcurrency", () => {
  it("defaults to half of available parallelism, with a minimum of one", () => {
    expect(resolveConcurrency()).toBe(Math.max(1, Math.floor(availableParallelism() / 2)));
  });

  it("returns an explicit positive integer unchanged", () => {
    expect(resolveConcurrency(1)).toBe(1);
    expect(resolveConcurrency(7)).toBe(7);
  });

  it("resolves percentage values against available parallelism", () => {
    const available = availableParallelism();

    expect(resolveConcurrency("1%")).toBe(Math.max(1, Math.floor(available / 100)));
    expect(resolveConcurrency("50%")).toBe(Math.max(1, Math.floor(available / 2)));
    expect(resolveConcurrency("100%")).toBe(available);
  });

  it("rejects invalid numeric and percentage values", () => {
    expect(() => resolveConcurrency(0)).toThrowError(/positive integer/u);
    expect(() => resolveConcurrency(-1)).toThrowError(/positive integer/u);
    expect(() => resolveConcurrency(1.5)).toThrowError(/positive integer/u);
    expect(() => resolveConcurrency(Number.NaN)).toThrowError(/positive integer/u);
    expect(() => resolveConcurrency("0%")).toThrowError(/between 1% and 100%/u);
    expect(() => resolveConcurrency("101%")).toThrowError(/between 1% and 100%/u);
    expect(() => resolveConcurrency("-1%")).toThrowError(/between 1% and 100%/u);
  });
});
