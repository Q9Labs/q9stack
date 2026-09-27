import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  evaluateBaselineCount,
  evaluateBaselineEntries,
  type Baseline,
} from "../../src/core/baseline.js";

interface Finding {
  readonly id: string;
  readonly message: string;
}

const firstFinding: Finding = { id: "dead-code:src/old.ts", message: "unused export" };
const secondFinding: Finding = { id: "dead-code:src/unused.ts", message: "unused function" };

const baseline: Baseline<Finding> = {
  count: 2,
  entries: [firstFinding, secondFinding],
  acceptedAt: "2026-08-23T00:00:00.000Z",
  message: "legacy findings accepted",
};

describe("baseline ratchets", () => {
  it("fails a count baseline only when the current count rises", () => {
    expect(evaluateBaselineCount(2, 2)).toEqual({
      before: 2,
      after: 2,
      increased: false,
      newEntries: [],
    });
    expect(evaluateBaselineCount(1, 2).increased).toBe(false);
    expect(evaluateBaselineCount(3, 2)).toMatchObject({
      before: 2,
      after: 3,
      increased: true,
    });
  });

  it("fails an entry baseline for a new entry even when the count does not rise", () => {
    const current = [firstFinding, { id: "dead-code:src/new.ts", message: "unused" }];

    const result = evaluateBaselineEntries(current, baseline, (entry) => entry.id);

    expect(result).toEqual({
      before: 2,
      after: 2,
      increased: true,
      newEntries: [{ id: "dead-code:src/new.ts", message: "unused" }],
    });
  });

  it("fails an entry baseline when the count rises even if every entry was accepted", () => {
    const current = [...baseline.entries, firstFinding];
    const result = evaluateBaselineEntries(current, baseline, (entry) => entry.id);

    expect(result.before).toBe(2);
    expect(result.after).toBe(3);
    expect(result.increased).toBe(true);
    expect(result.newEntries).toEqual([]);
  });

  it("does not fail when current entries are an accepted subset", () => {
    const result = evaluateBaselineEntries([secondFinding], baseline, (entry) => entry.id);

    expect(result).toMatchObject({ before: 2, after: 1, increased: false });
    expect(result.newEntries).toEqual([]);
  });

  it("identifies exactly the entries whose keys are absent from the baseline", () => {
    const entryArbitrary = fc.record({
      id: fc.constantFrom("a", "b", "c", "d"),
      message: fc.string({ maxLength: 20 }),
    });

    fc.assert(
      fc.property(fc.array(entryArbitrary, { maxLength: 12 }), (entries) => {
        const known = new Set(["a", "b"]);
        const currentBaseline: Baseline<Finding> = {
          ...baseline,
          count: entries.length + 12,
          entries: [...known].map((id) => ({ id, message: "accepted" })),
        };
        const result = evaluateBaselineEntries(entries, currentBaseline, (entry) => entry.id);
        const expected = entries.filter((entry) => !known.has(entry.id));

        expect(result.newEntries).toEqual(expected);
        expect(result.increased).toBe(expected.length > 0);
      }),
    );
  });
});
