import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob([
  "./_generated/*.{js,ts}",
  "./sample.ts",
  "./diagnostics/persist.ts",
]);

describe("sample mutations", () => {
  it("keeps the public sample action available without diagnostics identity", async () => {
    const t = convexTest(schema, modules);
    const sample = { id: "public-action", kind: "draft" as const, title: "Public sample" };

    const id = await t.action(api.sample.saveFromAction, { sample });

    expect(await t.query(api.sample.list, {})).toContainEqual(
      expect.objectContaining({ _id: id, title: sample.title }),
    );
  });

  it("saves a sample idempotently and preserves its state", async () => {
    const t = convexTest(schema, modules);
    const sample = {
      id: "sample-fixture",
      kind: "draft" as const,
      title: "A sample fixture",
    };

    const firstId = await t.mutation(api.sample.save, { sample });
    const secondId = await t.mutation(api.sample.save, { sample });
    const rows = await t.query(api.sample.list, {});

    expect(secondId).toBe(firstId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      _id: firstId,
      id: sample.id,
      kind: sample.kind,
      title: sample.title,
    });
  });
});
