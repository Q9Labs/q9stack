import { describe, expect, it } from "vitest";

import { classify } from "../../src/core/classify.js";
import { plan, selectPlanLanes } from "../../src/core/plan.js";
import type { GateCategory, GateLane } from "../../src/core/types.js";

function lane(
  id: string,
  trigger: boolean | string,
  categories: readonly GateCategory[] = [],
): GateLane {
  return {
    id,
    title: id,
    categories,
    triggers: () => trigger,
    run: async () => ({ status: "passed" }),
  };
}

describe("plan", () => {
  it("runs only cspell and hygiene for documentation-only changes", () => {
    const lanes = [
      lane("typecheck", true, ["source"]),
      lane("test", true, ["test"]),
      lane("cspell", false, ["docs"]),
      lane("hygiene", false),
      lane("custom-docs", true, ["docs"]),
    ];

    const result = plan(classify(["README.md", "docs/guide.md"]), lanes, "branch");

    expect(result.full).toBe(false);
    expect(result.lanes.map((entry) => [entry.lane.id, entry.selected])).toEqual([
      ["typecheck", false],
      ["test", false],
      ["cspell", true],
      ["hygiene", true],
      ["custom-docs", false],
    ]);
    expect(result.lanes[0]?.reason).toBe("skipped: documentation-only change");
    expect(result.lanes[2]?.reason).toBe("documentation files changed");
  });

  it("forces dependency safety lanes, typecheck, and build", () => {
    const lanes = [
      lane("osv", false, ["dependency"]),
      lane("syncpack", false, ["dependency"]),
      lane("version-drift", false, ["dependency"]),
      lane("typecheck", false, ["source"]),
      lane("build", false, ["source"]),
      lane("test", false, ["test"]),
    ];

    const result = plan(classify(["package.json", "pnpm-lock.yaml"]), lanes, "branch");

    expect(result.lanes.map((entry) => entry.selected)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(result.lanes[0]?.reason).toBe("2 dependency files changed");
    expect(result.lanes[5]?.reason).toBe("skipped: no test changes");
  });

  it("selects every lane for --full and records the request reason", () => {
    const lanes = [lane("typecheck", false, ["source"]), lane("hygiene", false)];
    const result = plan(classify(["README.md"]), lanes, "full");

    expect(result.full).toBe(true);
    expect(result.fullReason).toBe("--full requested");
    expect(result.lanes.every((entry) => entry.selected)).toBe(true);
    expect(result.lanes.every((entry) => entry.reason === "--full requested")).toBe(true);
  });

  it("fails closed to a full plan when a changed path has no category", () => {
    const lanes = [lane("typecheck", false, ["source"]), lane("test", false, ["test"])];
    const result = plan(classify(["assets/logo.svg"]), lanes, "branch");

    expect(result.full).toBe(true);
    expect(result.fullReason).toBe("assets/logo.svg is not classified");
    expect(result.lanes.every((entry) => entry.selected)).toBe(true);
  });

  it("forces a full plan when gate behavior changes", () => {
    const lanes = [lane("typecheck", false, ["source"]), lane("hygiene", false)];
    const result = plan(classify(["gate.config.ts"]), lanes, "branch");

    expect(result.full).toBe(true);
    expect(result.fullReason).toBe("gate.config.ts changes gate behavior");
    expect(result.lanes.every((entry) => entry.selected)).toBe(true);
  });

  it("uses string trigger explanations and category-based skipped reasons", () => {
    const lanes = [
      lane("semgrep", "3 source files changed", ["source"]),
      lane("test", false, ["test"]),
      lane("misc", false),
    ];
    const result = plan(classify(["src/a.ts", "src/b.ts", "src/c.ts"]), lanes, "branch");

    expect(result.lanes[0]).toMatchObject({ selected: true, reason: "3 source files changed" });
    expect(result.lanes[1]).toMatchObject({ selected: false, reason: "skipped: no test changes" });
    expect(result.lanes[2]).toMatchObject({
      selected: false,
      reason: "skipped: lane trigger did not match",
    });
  });

  it("supports explicit lane selection after planning", () => {
    const base = plan(
      classify(["src/index.ts"]),
      [
        lane("typecheck", true, ["source"]),
        lane("build", true, ["source"]),
        lane("test", true, ["test"]),
      ],
      "branch",
    );
    const result = selectPlanLanes(base, ["build"]);

    expect(result.full).toBe(base.full);
    expect(result.lanes.map((entry) => [entry.lane.id, entry.selected, entry.reason])).toEqual([
      ["typecheck", false, "skipped: not selected by --lane"],
      ["build", true, "explicit --lane build"],
      ["test", false, "skipped: not selected by --lane"],
    ]);
  });

  it("rejects duplicate lane ids and unknown explicit lanes", () => {
    expect(() =>
      plan(classify(["src/index.ts"]), [lane("test", true), lane("test", false)], "branch"),
    ).toThrowError(expect.objectContaining({ name: "GatePlanningError", code: "duplicate-lane" }));

    const base = plan(classify(["src/index.ts"]), [lane("test", true)], "branch");
    expect(() => selectPlanLanes(base, ["missing"])).toThrowError(
      expect.objectContaining({ name: "GatePlanningError", code: "unknown-lane" }),
    );
  });
});
